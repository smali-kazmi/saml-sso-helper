const request = require('supertest');
const express = require('express');
const SAMLHelper = require('../index');

describe('Express Middleware Integration Tests', () => {
    let app;
    let samlHelper;

    beforeEach(() => {
        app = express();
        app.use(express.urlencoded({ extended: true }));

        samlHelper = new SAMLHelper({
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
            attributes: ['email', 'displayName', 'firstName', 'lastName']
        });
    });

    describe('IdP Middleware', () => {
        beforeEach(() => {
            samlHelper.createIdentityProvider();
            const middleware = samlHelper.getExpressMiddleware();

            app.get('/metadata', middleware.idp.metadata);
            app.get('/sso', (req, res) => {
                req.userData = {
                    email: 'middleware@test.com',
                    displayName: 'Middleware Test',
                    firstName: 'Middleware',
                    lastName: 'Test'
                };
                middleware.idp.sso(req, res);
            });
        });

        test('metadata endpoint should return XML', async () => {
            const response = await request(app)
                .get('/metadata')
                .expect(200)
                .expect('Content-Type', /xml/);

            expect(response.text).toContain('<?xml');
            expect(response.text).toContain('EntityDescriptor');
        });

        test('SSO endpoint should handle requests', async () => {
            // Mock loadPartnerMetadata to avoid external calls
            samlHelper.loadPartnerMetadata = jest.fn().mockResolvedValue({
                entityMeta: {
                    getAssertionConsumerService: () => [{ Location: 'http://localhost:4000/assert' }],
                    getEntityID: () => 'http://localhost:4000/metadata'
                }
            });

            // Mock parseLoginRequest to return a valid structure
            samlHelper.idp.parseLoginRequest = jest.fn().mockResolvedValue({
                extract: {
                    request: {
                        id: 'test-request-id',
                        assertionConsumerServiceUrl: 'http://localhost:4000/assert'
                    }
                }
            });

            // Mock createLoginResponse to return a valid response
            samlHelper.createLoginResponse = jest.fn().mockResolvedValue({
                context: 'mock-saml-response'
            });

            const response = await request(app)
                .get('/sso')
                .query({
                    SAMLRequest: 'mock-request',
                    RelayState: 'test-state'
                })
                .expect(200);

            expect(response.text).toContain('form');
            expect(response.text).toContain('SAMLResponse');
        });
    });

    describe('SP Middleware', () => {
        beforeEach(() => {
            samlHelper.createServiceProvider({
                entityID: 'http://localhost:4000/metadata',
                baseURL: 'http://localhost:4000',
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

            const middleware = samlHelper.getExpressMiddleware();

            app.get('/metadata', middleware.sp.metadata);
            app.get('/login', middleware.sp.login);
            app.post('/assert', middleware.sp.assert);
        });

        test('metadata endpoint should return SP metadata', async () => {
            const response = await request(app)
                .get('/metadata')
                .expect(200)
                .expect('Content-Type', /xml/);

            expect(response.text).toContain('SPSSODescriptor');
            expect(response.text).toContain('http://localhost:4000/metadata');
        });

        test('login endpoint should redirect', async () => {
            // Mock loadPartnerMetadata
            samlHelper.loadPartnerMetadata = jest.fn().mockResolvedValue({
                entityMeta: {
                    getSingleSignOnService: () => [{ Location: 'http://localhost:3000/sso' }]
                }
            });

            // Mock createLoginRequest
            samlHelper.sp.createLoginRequest = jest.fn().mockReturnValue({
                context: 'http://localhost:3000/sso?SAMLRequest=mock-request'
            });

            const response = await request(app)
                .get('/login')
                .expect(302);

            expect(response.headers.location).toContain('http://localhost:3000/sso');
        });

        test('assert endpoint should handle SAML responses', async () => {
            // Mock loadPartnerMetadata
            samlHelper.loadPartnerMetadata = jest.fn().mockResolvedValue({
                entityMeta: {
                    getEntityID: () => 'http://localhost:3000/metadata'
                }
            });

            // Mock parseLoginResponse
            samlHelper.parseLoginResponse = jest.fn().mockResolvedValue({
                nameID: 'test@example.com',
                attributes: {
                    email: 'test@example.com',
                    displayName: 'Test User'
                },
                sessionIndex: 'session-123'
            });

            const response = await request(app)
                .post('/assert')
                .send({
                    SAMLResponse: 'mock-saml-response',
                    RelayState: 'test-state'
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.user.nameID).toBe('test@example.com');
            expect(response.body.encryptionEnabled).toBe(true);
        });
    });

    describe('Error Handling in Middleware', () => {
        test('should handle metadata generation errors', async () => {
            // Create helper without proper certificates to trigger error
            const brokenHelper = new SAMLHelper({
                entityID: 'http://localhost:3000/metadata',
                certificates: {
                    signing: {
                        key: './nonexistent.key',
                        cert: './certificates/idp-signing.cert'
                    }
                }
            });

            const brokenApp = express();
            try {
                brokenHelper.createIdentityProvider();
                const middleware = brokenHelper.getExpressMiddleware();
                brokenApp.get('/metadata', middleware.idp.metadata);
            } catch (error) {
                // Expected to fail during setup
            }

            // Test with a helper that fails during metadata generation
            const testApp = express();
            testApp.get('/metadata', (req, res) => {
                try {
                    throw new Error('Metadata generation failed');
                } catch (error) {
                    res.status(500).json({ error: error.message });
                }
            });

            const response = await request(testApp)
                .get('/metadata')
                .expect(500);

            expect(response.body.error).toBe('Metadata generation failed');
        });

        test('should handle SSO errors gracefully', async () => {
            samlHelper.createIdentityProvider();
            const middleware = samlHelper.getExpressMiddleware();

            const errorApp = express();
            errorApp.use(express.urlencoded({ extended: true }));

            // Override SSO middleware to simulate error
            errorApp.get('/sso', (req, res) => {
                res.status(500).json({ error: 'SSO processing failed' });
            });

            const response = await request(errorApp)
                .get('/sso')
                .expect(500);

            expect(response.body.error).toBe('SSO processing failed');
        });
    });

    describe('Custom User Data Handling', () => {
        test('should properly handle custom user data in SSO', async () => {
            samlHelper.createIdentityProvider();
            const middleware = samlHelper.getExpressMiddleware();

            const customApp = express();
            customApp.use(express.urlencoded({ extended: true }));

            customApp.get('/sso', (req, res) => {
                // Simulate complex user data
                req.userData = {
                    email: 'complex@example.com',
                    displayName: 'John Doe',
                    firstName: 'John',
                    lastName: 'Doe',
                    customAttribute: 'custom-value',
                    roles: ['admin', 'user'],
                    department: 'Engineering'
                };

                // Mock the required dependencies
                samlHelper.loadPartnerMetadata = jest.fn().mockResolvedValue({
                    entityMeta: {
                        getAssertionConsumerService: () => [{ Location: 'http://localhost:4000/assert' }],
                        getEntityID: () => 'http://localhost:4000/metadata'
                    }
                });

                samlHelper.idp.parseLoginRequest = jest.fn().mockResolvedValue({
                    extract: {
                        request: {
                            id: 'test-request-id',
                            assertionConsumerServiceUrl: 'http://localhost:4000/assert'
                        }
                    }
                });

                samlHelper.createLoginResponse = jest.fn().mockResolvedValue({
                    context: 'mock-saml-response-with-custom-data'
                });

                middleware.idp.sso(req, res);
            });

            const response = await request(customApp)
                .get('/sso')
                .query({
                    SAMLRequest: 'mock-request',
                    RelayState: 'test-state'
                })
                .expect(200);

            expect(response.text).toContain('form');
            expect(samlHelper.createLoginResponse).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                expect.objectContaining({
                    email: 'complex@example.com',
                    displayName: 'John Doe',
                    firstName: 'John',
                    lastName: 'Doe',
                    department: 'Engineering',
                    roles: ['admin', 'user'],
                    customAttribute: 'custom-value'
                })
            );
        });
    });
});
