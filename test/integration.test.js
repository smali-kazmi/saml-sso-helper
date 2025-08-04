const request = require('supertest');
const express = require('express');
const SAMLHelper = require('../index');

describe('Complete SAML SSO Flow Integration', () => {
    let idpServer, spServer;
    let idpHelper, spHelper;

    beforeAll(async () => {
        // Create IdP server
        const idpApp = express();
        idpApp.use(express.urlencoded({ extended: true }));

        idpHelper = new SAMLHelper({
            encryption: true,
            entityID: 'http://localhost:3000/metadata',
            baseURL: 'http://localhost:3000',
            partnerMetadataURL: 'http://localhost:4000/metadata',
            certificates: {
                signing: {
                    key: './certificates/idp-signing.key',
                    cert: './certificates/idp-signing.cert'
                },
                encryption: {
                    key: './certificates/idp-encrypt.key',
                    cert: './certificates/idp-encrypt.cert'
                }
            },
            attributes: ['email', 'displayName', 'firstName', 'lastName', 'age', 'gender', 'username']
        });

        idpHelper.createIdentityProvider();

        // Create SP server
        const spApp = express();
        spApp.use(express.urlencoded({ extended: true }));

        spHelper = new SAMLHelper({
            encryption: true,
            entityID: 'http://localhost:4000/metadata',
            baseURL: 'http://localhost:4000',
            partnerMetadataURL: 'http://localhost:3000/metadata',
            certificates: {
                signing: {
                    key: './certificates/sp-signing.key',
                    cert: './certificates/sp-signing.cert'
                },
                encryption: {
                    key: './certificates/sp-encrypt.key',
                    cert: './certificates/sp-encrypt.cert'
                }
            }
        });

        spHelper.createServiceProvider();

        // Setup IdP routes
        const idpMiddleware = idpHelper.getExpressMiddleware();
        idpApp.get('/metadata', idpMiddleware.idp.metadata);
        idpApp.get('/sso', (req, res) => {
            req.userData = {
                email: 'integration@test.com',
                displayName: 'Integration Test User',
                firstName: 'Integration',
                lastName: 'Test',
                age: '28',
                gender: 'Other',
                username: 'integration_test'
            };
            idpMiddleware.idp.sso(req, res);
        });

        // Setup SP routes
        const spMiddleware = spHelper.getExpressMiddleware();
        spApp.get('/metadata', spMiddleware.sp.metadata);
        spApp.get('/login', spMiddleware.sp.login);
        spApp.post('/assert', spMiddleware.sp.assert);

        idpServer = idpApp;
        spServer = spApp;
    });

    describe('End-to-End SAML Flow Simulation', () => {
        test('Complete flow: SP login -> IdP SSO -> SP assertion', async () => {
            // Step 1: Mock partner metadata loading for both sides
            idpHelper.loadPartnerMetadata = jest.fn().mockResolvedValue({
                entityMeta: {
                    getAssertionConsumerService: () => [{ Location: 'http://localhost:4000/assert' }],
                    getEntityID: () => 'http://localhost:4000/metadata'
                }
            });

            spHelper.loadPartnerMetadata = jest.fn().mockResolvedValue({
                entityMeta: {
                    getSingleSignOnService: () => [{ Location: 'http://localhost:3000/sso' }],
                    getEntityID: () => 'http://localhost:3000/metadata'
                }
            });

            // Step 2: Initiate login from SP
            spHelper.sp.createLoginRequest = jest.fn().mockReturnValue({
                context: 'http://localhost:3000/sso?SAMLRequest=encodedRequest&RelayState=testState'
            });

            const loginResponse = await request(spServer)
                .get('/login')
                .expect(302);

            expect(loginResponse.headers.location).toContain('http://localhost:3000/sso');
            expect(loginResponse.headers.location).toContain('SAMLRequest=');

            // Step 3: Extract SAML request and simulate IdP processing
            const locationUrl = new URL(loginResponse.headers.location);
            const samlRequest = locationUrl.searchParams.get('SAMLRequest');
            const relayState = locationUrl.searchParams.get('RelayState');

            // Mock IdP parsing of the SAML request
            idpHelper.idp.parseLoginRequest = jest.fn().mockResolvedValue({
                extract: {
                    request: {
                        id: 'test-request-id-123',
                        assertionConsumerServiceUrl: 'http://localhost:4000/assert'
                    }
                }
            });

            // Mock IdP response creation
            idpHelper.createLoginResponse = jest.fn().mockResolvedValue({
                context: 'mock-encrypted-saml-response'
            });

            // Step 4: Process SSO at IdP
            const ssoResponse = await request(idpServer)
                .get('/sso')
                .query({
                    SAMLRequest: samlRequest,
                    RelayState: relayState
                })
                .expect(200);

            expect(ssoResponse.text).toContain('form');
            expect(ssoResponse.text).toContain('SAMLResponse');
            expect(ssoResponse.text).toContain('http://localhost:4000/assert');

            // Step 5: Extract SAML response from form
            const samlResponseMatch = ssoResponse.text.match(/name="SAMLResponse" value="([^"]+)"/);
            expect(samlResponseMatch).toBeTruthy();
            const samlResponse = samlResponseMatch[1];

            // Step 6: Mock SP parsing of SAML response
            spHelper.parseLoginResponse = jest.fn().mockResolvedValue({
                nameID: 'integration@test.com',
                attributes: {
                    email: 'integration@test.com',
                    displayName: 'Integration Test User',
                    firstName: 'Integration',
                    lastName: 'Test',
                    age: '28',
                    gender: 'Other',
                    username: 'integration_test'
                },
                sessionIndex: 'session-integration-123',
                conditions: {
                    notBefore: new Date().toISOString(),
                    notOnOrAfter: new Date(Date.now() + 5 * 60 * 1000).toISOString()
                },
                audience: 'http://localhost:4000/metadata',
                issuer: 'http://localhost:3000/metadata'
            });

            // Step 7: Submit SAML response to SP
            const assertResponse = await request(spServer)
                .post('/assert')
                .send({
                    SAMLResponse: samlResponse,
                    RelayState: relayState
                })
                .expect(200);

            // Step 8: Verify final response
            expect(assertResponse.body.success).toBe(true);
            expect(assertResponse.body.message).toBe('SAML authentication successful');
            expect(assertResponse.body.encryptionEnabled).toBe(true);
            expect(assertResponse.body.user.nameID).toBe('integration@test.com');
            expect(assertResponse.body.user.attributes.email).toBe('integration@test.com');
            expect(assertResponse.body.user.attributes.displayName).toBe('Integration Test User');
            expect(assertResponse.body.user.attributesCount).toBe(7);
            expect(assertResponse.body.session.sessionIndex).toBe('session-integration-123');
            expect(assertResponse.body.metadata.audience).toBe('http://localhost:4000/metadata');
            expect(assertResponse.body.metadata.issuer).toBe('http://localhost:3000/metadata');

            // Verify all mocked functions were called
            expect(spHelper.loadPartnerMetadata).toHaveBeenCalled();
            expect(idpHelper.loadPartnerMetadata).toHaveBeenCalled();
            expect(idpHelper.idp.parseLoginRequest).toHaveBeenCalled();
            expect(idpHelper.createLoginResponse).toHaveBeenCalled();
            expect(spHelper.parseLoginResponse).toHaveBeenCalled();
        });

        test('Flow with encryption disabled', async () => {
            // Create non-encrypted helpers
            const nonEncryptedIdpHelper = new SAMLHelper({
                encryption: false,
                entityID: 'http://localhost:3000/metadata',
                baseURL: 'http://localhost:3000',
                partnerMetadataURL: 'http://localhost:4000/metadata',
                certificates: {
                    signing: {
                        key: './certificates/idp-signing.key',
                        cert: './certificates/idp-signing.cert'
                    }
                },
                attributes: ['email', 'displayName']
            });

            const nonEncryptedSpHelper = new SAMLHelper({
                encryption: false,
                entityID: 'http://localhost:4000/metadata',
                baseURL: 'http://localhost:4000',
                partnerMetadataURL: 'http://localhost:3000/metadata',
                certificates: {
                    signing: {
                        key: './certificates/sp-signing.key',
                        cert: './certificates/sp-signing.cert'
                    }
                }
            });

            nonEncryptedIdpHelper.createIdentityProvider();
            nonEncryptedSpHelper.createServiceProvider();

            // Create non-encrypted apps
            const nonEncIdpApp = express();
            nonEncIdpApp.use(express.urlencoded({ extended: true }));

            const nonEncSpApp = express();
            nonEncSpApp.use(express.urlencoded({ extended: true }));

            const idpMw = nonEncryptedIdpHelper.getExpressMiddleware();
            const spMw = nonEncryptedSpHelper.getExpressMiddleware();

            nonEncIdpApp.get('/sso', (req, res) => {
                req.userData = { email: 'nonenc@test.com', displayName: 'Non Encrypted User' };
                idpMw.idp.sso(req, res);
            });
            nonEncSpApp.post('/assert', spMw.sp.assert);

            // Mock the dependencies
            nonEncryptedSpHelper.parseLoginResponse = jest.fn().mockResolvedValue({
                nameID: 'nonenc@test.com',
                attributes: { email: 'nonenc@test.com', displayName: 'Non Encrypted User' },
                sessionIndex: 'session-nonenc-123'
            });

            const response = await request(nonEncSpApp)
                .post('/assert')
                .send({
                    SAMLResponse: 'mock-non-encrypted-response',
                    RelayState: 'test'
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.encryptionEnabled).toBe(false);
            expect(response.body.user.nameID).toBe('nonenc@test.com');
        });

        test('Error handling in complete flow', async () => {
            // Test SP with invalid partner metadata URL
            const errorSpHelper = new SAMLHelper({
                encryption: true,
                entityID: 'http://localhost:4000/metadata',
                baseURL: 'http://localhost:4000',
                // No partner metadata URL
                certificates: {
                    signing: {
                        key: './certificates/sp-signing.key',
                        cert: './certificates/sp-signing.cert'
                    }
                }
            });

            errorSpHelper.createServiceProvider();

            const errorSpApp = express();
            const errorMw = errorSpHelper.getExpressMiddleware();
            errorSpApp.get('/login', errorMw.sp.login);

            const errorResponse = await request(errorSpApp)
                .get('/login')
                .expect(500);

            expect(errorResponse.body.error).toContain('Partner metadata URL not configured');
        });
    });

    describe('Performance and Load Testing', () => {
        test('should handle multiple concurrent requests', async () => {
            // Mock the dependencies for load testing
            spHelper.loadPartnerMetadata = jest.fn().mockResolvedValue({
                entityMeta: {
                    getSingleSignOnService: () => [{ Location: 'http://localhost:3000/sso' }]
                }
            });

            spHelper.sp.createLoginRequest = jest.fn().mockReturnValue({
                context: 'http://localhost:3000/sso?SAMLRequest=loadTestRequest'
            });

            // Create multiple concurrent requests
            const requests = Array(10).fill().map((_, i) =>
                request(spServer)
                    .get('/login')
                    .expect(302)
            );

            const responses = await Promise.all(requests);

            responses.forEach(response => {
                expect(response.headers.location).toContain('http://localhost:3000/sso');
            });

            // Verify that the mock was called for each request
            expect(spHelper.loadPartnerMetadata).toHaveBeenCalledTimes(10);
        });

        test('should handle large user data payloads', async () => {
            // Create helper with many attributes
            const largeDataHelper = new SAMLHelper({
                encryption: true,
                entityID: 'http://localhost:3000/metadata',
                baseURL: 'http://localhost:3000',
                certificates: {
                    signing: {
                        key: './certificates/idp-signing.key',
                        cert: './certificates/idp-signing.cert'
                    }
                },
                attributes: Array(50).fill().map((_, i) => `attribute${i}`)
            });

            largeDataHelper.createIdentityProvider();

            const template = largeDataHelper._generateResponseTemplate(largeDataHelper.config.attributes);

            // Verify template contains all attributes
            for (let i = 0; i < 50; i++) {
                expect(template.context).toContain(`attribute${i}`);
            }
        });
    });
});
