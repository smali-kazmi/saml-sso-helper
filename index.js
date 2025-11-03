const saml = require('samlify');
const fs = require('fs');
const axios = require('axios');
const crypto = require('crypto');

// Configure samlify to be more lenient
saml.setSchemaValidator({
    validate: () => true
});

class SAMLHelper {
    constructor(config = {}) {
        this.config = {
            // Default configuration
            encryption: config.encryption !== false, // Default to encrypted
            entityID: config.entityID,
            baseURL: config.baseURL,
            certificates: config.certificates || {},
            attributes: config.attributes || ['email', 'displayName', 'firstName', 'lastName'],
            nameIDFormat: config.nameIDFormat || 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
            sessionTimeout: config.sessionTimeout || 5, // minutes
            signatureAlgorithm: config.signatureAlgorithm || 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
            ...config
        };

        this.idp = null;
        this.sp = null;
        this.partnerMetadataCache = new Map();
    }

    /**
     * Create Identity Provider instance
     */
    createIdentityProvider(options = {}) {
        const config = { ...this.config, ...options };

        if (!config.entityID) {
            throw new Error('EntityID is required for Identity Provider');
        }

        if (!config.certificates.signing) {
            throw new Error('Signing certificate is required');
        }

        const idpConfig = {
            entityID: config.entityID,
            privateKey: this._loadCertificate(config.certificates.signing.key, 'IdP signing key'),
            signingCert: this._loadCertificate(config.certificates.signing.cert, 'IdP signing certificate'),
            requestSignatureAlgorithm: config.signatureAlgorithm,
            nameIDFormat: [config.nameIDFormat],
            singleSignOnService: [{
                Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
                Location: `${config.baseURL}/sso`
            }],
            isAssertionEncrypted: config.encryption
        };

        // Add encryption keys if encryption is enabled
        if (config.encryption && config.certificates.encryption) {
            idpConfig.encPrivateKey = this._loadCertificate(config.certificates.encryption.key, 'IdP encryption key');
        }

        // Add custom template for consistent attribute handling
        if (config.attributes && config.attributes.length > 0) {
            idpConfig.loginResponseTemplate = this._generateResponseTemplate(config.attributes);
        }

        this.idp = saml.IdentityProvider(idpConfig);
        return this.idp;
    }

    /**
     * Create Service Provider instance
     */
    createServiceProvider(options = {}) {
        const config = { ...this.config, ...options };

        if (!config.entityID) {
            throw new Error('EntityID is required for Service Provider');
        }

        if (!config.certificates.signing) {
            throw new Error('Signing certificate is required');
        }

        const spConfig = {
            entityID: config.entityID,
            assertionConsumerService: [{
                Binding: saml.Constants.namespace.binding.post,
                Location: `${config.baseURL}/assert`
            }],
            singleLogoutService: [{
                Binding: saml.Constants.namespace.binding.redirect,
                Location: `${config.baseURL}/slo`
            }],
            privateKey: this._loadCertificate(config.certificates.signing.key, 'SP signing key'),
            signingCert: this._loadCertificate(config.certificates.signing.cert, 'SP signing certificate'),
            wantAssertionsSigned: false,
            wantResponseSigned: true,
            requestSignatureAlgorithm: config.signatureAlgorithm,
            validateInResponseTo: true,
            allowCreate: true,
            isAssertionEncrypted: config.encryption
        };

        // Add encryption keys if encryption is enabled
        if (config.encryption && config.certificates.encryption) {
            spConfig.encPrivateKey = this._loadCertificate(config.certificates.encryption.key, 'SP encryption key');
            spConfig.encryptCert = this._loadCertificate(config.certificates.encryption.cert, 'SP encryption certificate');
        }

        this.sp = saml.ServiceProvider(spConfig);
        return this.sp;
    }

    /**
     * Load partner metadata dynamically
     */
    async loadPartnerMetadata(metadataURL, type = 'idp') {
        try {
            if (this.partnerMetadataCache.has(metadataURL)) {
                return this.partnerMetadataCache.get(metadataURL);
            }

            console.log(`🔄 Loading ${type.toUpperCase()} metadata from: ${metadataURL}`);
            const response = await axios.get(metadataURL, { timeout: 10000 });

            const partnerConfig = {
                metadata: response.data,
                isAssertionEncrypted: this.config.encryption
            };

            let partner;
            if (type === 'idp') {
                partner = saml.IdentityProvider(partnerConfig);
            } else {
                partner = saml.ServiceProvider(partnerConfig);
            }

            this.partnerMetadataCache.set(metadataURL, partner);
            console.log(`✅ ${type.toUpperCase()} metadata loaded successfully`);
            return partner;
        } catch (error) {
            console.error(`❌ Failed to load ${type.toUpperCase()} metadata:`, error.message);
            throw new Error(`Failed to load partner metadata: ${error.message}`);
        }
    }

    /**
     * Generate SAML login response (IdP side)
     */
    async createLoginResponse(sp, request, userData, options = {}) {
        if (!this.idp) {
            throw new Error('Identity Provider not initialized. Call createIdentityProvider() first.');
        }

        const user = {
            email: userData.email || 'user@example.com',
            displayName: userData.displayName || userData.name || 'User',
            firstName: userData.firstName || userData.given_name || 'First',
            lastName: userData.lastName || userData.family_name || 'Last',
            ...userData
        };

        // Create tag replacement function for attributes
        const tagReplacement = (template) => {
            const id = '_' + crypto.randomBytes(8).toString('hex');
            const now = new Date().toISOString();
            const notOnOrAfter = new Date(Date.now() + this.config.sessionTimeout * 60 * 1000).toISOString();

            const acsServices = sp.entityMeta.getAssertionConsumerService();
            const acsLocation = acsServices?.[0]?.Location || `${this.config.baseURL}/assert`;
            const spEntityID = sp.entityMeta.getEntityID();

            const tagValues = {
                ID: id,
                AssertionID: '_' + crypto.randomBytes(8).toString('hex'),
                IssueInstant: now,
                NotBefore: now,
                NotOnOrAfter: notOnOrAfter,
                Destination: acsLocation,
                InResponseTo: request.extract.request.id,
                Issuer: this.idp.entityMeta.getEntityID(),
                NameID: user.email,
                SubjectRecipient: acsLocation,
                Audience: spEntityID,
                ...user // Spread all user attributes
            };

            const context = Object.keys(tagValues).reduce((xml, key) => {
                return xml.replace(new RegExp(`{${key}}`, 'g'), tagValues[key] || '');
            }, template);

            return { id, context };
        };

        return await this.idp.createLoginResponse(sp, request, 'post', user, tagReplacement);
    }

    /**
     * Parse SAML login response (SP side)
     */
    async parseLoginResponse(idp, request) {
        if (!this.sp) {
            throw new Error('Service Provider not initialized. Call createServiceProvider() first.');
        }

        const result = await this.sp.parseLoginResponse(idp, 'post', request);

        // Normalize the response
        const extract = result.extract || result;
        return {
            success: true,
            nameID: extract.nameID || extract.nameid || extract.subject || 'Unknown',
            attributes: extract.attributes || extract.attribute || {},
            sessionIndex: extract.sessionIndex,
            conditions: extract.conditions,
            audience: extract.audience,
            issuer: extract.issuer,
            raw: result
        };
    }

    /**
     * Generate metadata XML
     */
    getMetadata(type = 'idp') {
        const entity = type === 'idp' ? this.idp : this.sp;
        if (!entity) {
            throw new Error(`${type.toUpperCase()} not initialized`);
        }
        const metadata = entity.getMetadata();
        // Ensure XML declaration is present
        if (!metadata.startsWith('<?xml')) {
            return `<?xml version="1.0" encoding="UTF-8"?>\n${metadata}`;
        }
        return metadata;
    }

    /**
     * Create SP-initiated LogoutRequest (SP -> IdP)
     */
    async createLogoutRequest(idp, { nameID, sessionIndex, binding = 'redirect', relayState } = {}) {
        if (!this.sp) {
            throw new Error('Service Provider not initialized. Call createServiceProvider() first.');
        }
        if (!nameID && !sessionIndex) {
            throw new Error('Logout requires at least nameID or sessionIndex');
        }

        const opts = {};
        if (nameID) opts.nameID = nameID;
        if (sessionIndex) opts.sessionIndex = sessionIndex;

        const req = await this.sp.createLogoutRequest(idp, binding, opts);
        return { binding, relayState, request: req };
    }

    /**
     * Parse LogoutResponse on SP side (IdP -> SP)
     */
    async parseLogoutResponse(idp, request) {
        if (!this.sp) {
            throw new Error('Service Provider not initialized. Call createServiceProvider() first.');
        }
        const binding = request.method === 'POST' ? 'post' : 'redirect';
        const result = await this.sp.parseLogoutResponse(idp, binding, request);
        return { success: true, raw: result };
    }

    /**
     * Parse LogoutRequest on IdP side (SP -> IdP)
     */
    async parseLogoutRequest(sp, request) {
        if (!this.idp) {
            throw new Error('Identity Provider not initialized. Call createIdentityProvider() first.');
        }
        const binding = request.method === 'POST' ? 'post' : 'redirect';
        const result = await this.idp.parseLogoutRequest(sp, binding, request);
        const extract = result.extract || result;
        return {
            success: true,
            nameID: extract.nameID || extract.nameid,
            sessionIndex: extract.sessionIndex,
            raw: result
        };
    }

    /**
     * Create LogoutResponse on IdP side (IdP -> SP)
     */
    async createLogoutResponse(sp, request, { binding, relayState } = {}) {
        if (!this.idp) {
            throw new Error('Identity Provider not initialized. Call createIdentityProvider() first.');
        }
        const usedBinding = binding || (request.method === 'POST' ? 'post' : 'redirect');
        const res = await this.idp.createLogoutResponse(sp, usedBinding, request, 'success', relayState);
        return { binding: usedBinding, relayState, response: res };
    }

    /**
     * Generate Express.js middleware for SAML endpoints
     */
    getExpressMiddleware() {
        return {
            // IdP middleware
            idp: {
                metadata: (req, res) => {
                    try {
                        const metadata = this.getMetadata('idp');
                        res.set('Content-Type', 'application/xml');
                        res.send(metadata);
                    } catch (error) {
                        res.status(500).json({ error: error.message });
                    }
                },

                sso: async (req, res) => {
                    try {
                        const { SAMLRequest, RelayState } = req.query;
                        const partnerURL = this.config.partnerMetadataURL;

                        if (!partnerURL) {
                            throw new Error('Partner metadata URL not configured');
                        }

                        const sp = await this.loadPartnerMetadata(partnerURL, 'sp');
                        const parsed = await this.idp.parseLoginRequest(sp, 'redirect', req);

                        // Get user data (should be provided by your authentication system)
                        const userData = req.user || req.userData || {
                            email: 'demo@example.com',
                            displayName: 'Demo User',
                            firstName: 'Demo',
                            lastName: 'User'
                        };

                        const loginResponse = await this.createLoginResponse(sp, parsed, userData);

                        const acsUrl = parsed.extract?.request?.assertionConsumerServiceUrl ||
                            sp.entityMeta.getAssertionConsumerService()[0].Location;

                        res.send(`
                            <form method="POST" action="${acsUrl}" id="samlForm">
                                <input type="hidden" name="SAMLResponse" value="${loginResponse.context}">
                                <input type="hidden" name="RelayState" value="${RelayState || ''}">
                                <button type="submit">Continue to Service Provider</button>
                            </form>
                            <script>document.getElementById('samlForm').submit();</script>
                        `);
                    } catch (error) {
                        console.error('SSO Error:', error);
                        res.status(500).json({ error: error.message });
                    }
                }
                ,

                // Handle SP-initiated Single Logout (SLO) at IdP
                slo: async (req, res) => {
                    try {
                        const partnerURL = this.config.partnerMetadataURL;
                        if (!partnerURL) {
                            throw new Error('Partner metadata URL not configured');
                        }

                        const sp = await this.loadPartnerMetadata(partnerURL, 'sp');
                        const parsed = await this.parseLogoutRequest(sp, req);

                        // Optional: custom cleanup hook on IdP side
                        if (typeof this.config.onIdpLogout === 'function') {
                            try { await this.config.onIdpLogout(parsed); } catch (e) { console.warn('onIdpLogout hook error:', e.message); }
                        }

                        const { binding, response } = await this.createLogoutResponse(sp, req, {
                            relayState: req.body?.RelayState || req.query?.RelayState
                        });

                        if (binding === 'redirect') {
                            return res.redirect(response.context);
                        }
                        const sloUrl = sp.entityMeta.getSingleLogoutService('post')?.[0]?.Location;
                        return res.send(`
                            <form method="POST" action="${sloUrl}" id="sloForm">
                                <input type="hidden" name="SAMLResponse" value="${response.context}">
                                <input type="hidden" name="RelayState" value="${req.body?.RelayState || req.query?.RelayState || ''}">
                            </form>
                            <script>document.getElementById('sloForm').submit();</script>
                        `);
                    } catch (error) {
                        console.error('IdP SLO Error:', error);
                        res.status(500).json({ success: false, message: 'SLO failed', error: error.message });
                    }
                },

                // Initiate IdP-initiated logout towards SP
                initiateLogout: async (req, res) => {
                    try {
                        const partnerURL = this.config.partnerMetadataURL;
                        if (!partnerURL) {
                            throw new Error('Partner metadata URL not configured');
                        }

                        const sp = await this.loadPartnerMetadata(partnerURL, 'sp');
                        const nameID = req.body?.nameID || req.query?.nameID || req.user?.email;
                        const sessionIndex = req.body?.sessionIndex || req.query?.sessionIndex;
                        if (!nameID && !sessionIndex) {
                            return res.status(400).json({ error: 'Missing nameID or sessionIndex' });
                        }

                        const binding = 'redirect';
                        const reqObj = await this.idp.createLogoutRequest(sp, binding, { nameID, sessionIndex });
                        return res.redirect(reqObj.context);
                    } catch (error) {
                        console.error('IdP initiateLogout Error:', error);
                        res.status(500).json({ success: false, message: 'Failed to initiate SLO', error: error.message });
                    }
                }
            },

            // SP middleware  
            sp: {
                metadata: (req, res) => {
                    try {
                        const metadata = this.getMetadata('sp');
                        res.set('Content-Type', 'application/xml');
                        res.send(metadata);
                    } catch (error) {
                        res.status(500).json({ error: error.message });
                    }
                },

                login: async (req, res) => {
                    try {
                        const partnerURL = this.config.partnerMetadataURL;

                        if (!partnerURL) {
                            throw new Error('Partner metadata URL not configured');
                        }

                        const idp = await this.loadPartnerMetadata(partnerURL, 'idp');
                        const loginRequest = this.sp.createLoginRequest(idp, 'redirect');

                        res.redirect(loginRequest.context);
                    } catch (error) {
                        console.error('Login Error:', error);
                        res.status(500).json({ error: error.message });
                    }
                },

                assert: async (req, res, next) => {
                    try {
                        const partnerURL = this.config.partnerMetadataURL;

                        if (!partnerURL) {
                            throw new Error('Partner metadata URL not configured');
                        }

                        const idp = await this.loadPartnerMetadata(partnerURL, 'idp');
                        const result = await this.parseLoginResponse(idp, req);

                        // Return normalized response
                        req.sso = result;
                        // Auto-respond with JSON by default for backward compatibility
                        if (this.config.assertAutoRespond === false || req.skipAutoRespond) {
                            return next();
                        }
                        return res.status(200).json({
                            success: true,
                            message: 'SAML authentication successful',
                            user: {
                                nameID: result.nameID,
                                attributes: result.attributes || {},
                                attributesCount: Object.keys(result.attributes || {}).length
                            },
                            session: {
                                sessionIndex: result.sessionIndex || null
                            },
                            metadata: {
                                audience: result.audience || null,
                                issuer: result.issuer || null
                            },
                            encryptionEnabled: this.config.encryption
                        });
                    } catch (error) {
                        console.error('Assertion Error:', error);
                        res.status(500).json({
                            success: false,
                            message: 'SAML assertion failed',
                            encryptionEnabled: this.config.encryption,
                            error: error.message,
                            timestamp: new Date().toISOString()
                        });
                    }
                }
            }
        };
    }

    /**
     * Private helper methods
     */
    _loadCertificate(certPath, description) {
        try {
            if (fs.existsSync(certPath)) {
                return fs.readFileSync(certPath);
            } else {
                throw new Error(`Certificate file not found: ${certPath}`);
            }
        } catch (error) {
            throw new Error(`Failed to load ${description}: ${error.message}`);
        }
    }

    _generateResponseTemplate(attributes) {
        const attributeStatements = attributes.map(attr => `
            <saml:Attribute Name="${attr}" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
                <saml:AttributeValue xsi:type="xs:string">{${attr}}</saml:AttributeValue>
            </saml:Attribute>`).join('');

        return {
            context: `
            <samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="{ID}" Version="2.0" IssueInstant="{IssueInstant}" Destination="{Destination}" InResponseTo="{InResponseTo}">
                <saml:Issuer>{Issuer}</saml:Issuer>
                <samlp:Status>
                    <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
                </samlp:Status>
                <saml:Assertion xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xs="http://www.w3.org/2001/XMLSchema" ID="{AssertionID}" Version="2.0" IssueInstant="{IssueInstant}">
                    <saml:Issuer>{Issuer}</saml:Issuer>
                    <saml:Subject>
                        <saml:NameID Format="{NameIDFormat}">{NameID}</saml:NameID>
                        <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
                            <saml:SubjectConfirmationData NotOnOrAfter="{NotOnOrAfter}" Recipient="{SubjectRecipient}" InResponseTo="{InResponseTo}"/>
                        </saml:SubjectConfirmation>
                    </saml:Subject>
                    <saml:Conditions NotBefore="{NotBefore}" NotOnOrAfter="{NotOnOrAfter}">
                        <saml:AudienceRestriction>
                            <saml:Audience>{Audience}</saml:Audience>
                        </saml:AudienceRestriction>
                    </saml:Conditions>
                    <saml:AttributeStatement>${attributeStatements}
                    </saml:AttributeStatement>
                    <saml:AuthnStatement AuthnInstant="{IssueInstant}" SessionIndex="_session_{ID}">
                        <saml:AuthnContext>
                            <saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef>
                        </saml:AuthnContext>
                    </saml:AuthnStatement>
                </saml:Assertion>
            </samlp:Response>`
        };
    }
}

module.exports = SAMLHelper;
