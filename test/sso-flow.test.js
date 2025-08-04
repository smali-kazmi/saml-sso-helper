const request = require('supertest');
const express = require('express');
const SAMLHelper = require('../index');

describe('SAML SSO Flow - Complete End-to-End Tests', () => {
    let idpApp, spApp;
    let idpHelper, spHelper;

    beforeAll(() => {
        // Setup IdP Application
        idpApp = express();
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
        const idpMiddleware = idpHelper.getExpressMiddleware();

        idpApp.get('/metadata', idpMiddleware.idp.metadata);
        idpApp.get('/sso', (req, res) => {
            req.userData = {
                email: 'test@example.com',
                displayName: 'Test User',
                firstName: 'Test',
                lastName: 'User',
                age: '25',
                gender: 'Other',
                username: 'testuser'
            };
            idpMiddleware.idp.sso(req, res);
        });
        idpApp.get('/health', (req, res) => {
            res.json({ status: 'healthy', service: 'SAML IdP', encryption: true });
        });

        // Setup SP Application
        spApp = express();
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
        const spMiddleware = spHelper.getExpressMiddleware();

        spApp.get('/metadata', spMiddleware.sp.metadata);
        spApp.get('/login', spMiddleware.sp.login);
        spApp.post('/assert', spMiddleware.sp.assert);
        spApp.get('/health', (req, res) => {
            res.json({ status: 'healthy', service: 'SAML SP', encryption: true });
        });
    });

    describe('Health Checks', () => {
        test('IdP health endpoint should return healthy status', async () => {
            const response = await request(idpApp)
                .get('/health')
                .expect(200);

            expect(response.body.status).toBe('healthy');
            expect(response.body.service).toBe('SAML IdP');
            expect(response.body.encryption).toBe(true);
        });

        test('SP health endpoint should return healthy status', async () => {
            const response = await request(spApp)
                .get('/health')
                .expect(200);

            expect(response.body.status).toBe('healthy');
            expect(response.body.service).toBe('SAML SP');
            expect(response.body.encryption).toBe(true);
        });
    });

    describe('Metadata Endpoints', () => {
        test('IdP should serve valid metadata', async () => {
            const response = await request(idpApp)
                .get('/metadata')
                .expect(200)
                .expect('Content-Type', /xml/);

            expect(response.text).toContain('EntityDescriptor');
            expect(response.text).toContain('IDPSSODescriptor');
            expect(response.text).toContain('http://localhost:3000/metadata');
        });

        test('SP should serve valid metadata', async () => {
            const response = await request(spApp)
                .get('/metadata')
                .expect(200)
                .expect('Content-Type', /xml/);

            expect(response.text).toContain('EntityDescriptor');
            expect(response.text).toContain('SPSSODescriptor');
            expect(response.text).toContain('http://localhost:4000/metadata');
        });
    });

    describe('SAML Flow Simulation', () => {
        test('SP login should redirect to IdP', async () => {
            // Mock the metadata loading to avoid external HTTP calls
            const originalLoadPartnerMetadata = spHelper.loadPartnerMetadata;
            spHelper.loadPartnerMetadata = jest.fn().mockResolvedValue(idpHelper.idp);

            const response = await request(spApp)
                .get('/login')
                .expect(302);

            expect(response.headers.location).toContain('http://localhost:3000/sso');
            expect(response.headers.location).toContain('SAMLRequest=');

            // Restore original method
            spHelper.loadPartnerMetadata = originalLoadPartnerMetadata;
        });

        test('IdP SSO should generate SAML response form', async () => {
            // Mock the metadata loading and parseLoginRequest
            const originalLoadPartnerMetadata = idpHelper.loadPartnerMetadata;
            const originalParseLoginRequest = idpHelper.idp.parseLoginRequest;

            idpHelper.loadPartnerMetadata = jest.fn().mockResolvedValue(spHelper.sp);
            idpHelper.idp.parseLoginRequest = jest.fn().mockResolvedValue({
                extract: {
                    request: {
                        id: 'test-request-id',
                        assertionConsumerServiceUrl: 'http://localhost:4000/assert'
                    }
                }
            });

            // Create a mock SAML request
            const mockSAMLRequest = 'mock-saml-request';
            const mockRelayState = 'mock-relay-state';

            const response = await request(idpApp)
                .get('/sso')
                .query({
                    SAMLRequest: mockSAMLRequest,
                    RelayState: mockRelayState
                });

            // The response should contain a form with SAMLResponse
            expect(response.text).toContain('form');
            expect(response.text).toContain('SAMLResponse');
            expect(response.text).toContain('RelayState');

            // Restore original methods
            idpHelper.loadPartnerMetadata = originalLoadPartnerMetadata;
            idpHelper.idp.parseLoginRequest = originalParseLoginRequest;
        });

        test('SP should handle invalid SAML response gracefully', async () => {
            const response = await request(spApp)
                .post('/assert')
                .send({
                    SAMLResponse: 'invalid-saml-response',
                    RelayState: 'test-state'
                })
                .expect(500);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toBe('SAML assertion failed');
            expect(response.body.encryptionEnabled).toBe(true);
        });
    });

    describe('Error Handling', () => {
        test('IdP should handle missing partner metadata gracefully', async () => {
            const tempHelper = new SAMLHelper({
                encryption: true,
                entityID: 'http://localhost:3000/metadata',
                baseURL: 'http://localhost:3000',
                // No partnerMetadataURL
                certificates: {
                    signing: {
                        key: './certificates/idp-signing.key',
                        cert: './certificates/idp-signing.cert'
                    }
                }
            });

            const tempApp = express();
            tempApp.use(express.urlencoded({ extended: true }));
            tempHelper.createIdentityProvider();
            const middleware = tempHelper.getExpressMiddleware();

            tempApp.get('/sso', middleware.idp.sso);

            const response = await request(tempApp)
                .get('/sso')
                .query({ SAMLRequest: 'test' })
                .expect(500);

            expect(response.body.error).toContain('Partner metadata URL not configured');
        });

        test('SP should handle missing partner metadata gracefully', async () => {
            const tempHelper = new SAMLHelper({
                encryption: true,
                entityID: 'http://localhost:4000/metadata',
                baseURL: 'http://localhost:4000',
                // No partnerMetadataURL
                certificates: {
                    signing: {
                        key: './certificates/sp-signing.key',
                        cert: './certificates/sp-signing.cert'
                    }
                }
            });

            const tempApp = express();
            tempApp.use(express.urlencoded({ extended: true }));
            tempHelper.createServiceProvider();
            const middleware = tempHelper.getExpressMiddleware();

            tempApp.get('/login', middleware.sp.login);

            const response = await request(tempApp)
                .get('/login')
                .expect(500);

            expect(response.body.error).toContain('Partner metadata URL not configured');
        });
    });

    describe('Configuration Tests', () => {
        test('should work with encryption disabled', () => {
            const nonEncryptedHelper = new SAMLHelper({
                encryption: false,
                entityID: 'http://localhost:3000/metadata',
                baseURL: 'http://localhost:3000',
                certificates: {
                    signing: {
                        key: './certificates/idp-signing.key',
                        cert: './certificates/idp-signing.cert'
                    }
                }
            });

            expect(() => {
                nonEncryptedHelper.createIdentityProvider();
            }).not.toThrow();

            expect(nonEncryptedHelper.config.encryption).toBe(false);
        });

        test('should handle custom attributes', () => {
            const customHelper = new SAMLHelper({
                encryption: true,
                entityID: 'http://localhost:3000/metadata',
                baseURL: 'http://localhost:3000',
                certificates: {
                    signing: {
                        key: './certificates/idp-signing.key',
                        cert: './certificates/idp-signing.cert'
                    }
                },
                attributes: ['customField1', 'customField2']
            });

            expect(customHelper.config.attributes).toEqual(['customField1', 'customField2']);
        });
    });
});
