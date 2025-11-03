const request = require('supertest');
const express = require('express');
const SAMLHelper = require('../index');

/**
 * SLO Middleware Tests
 */
describe('Single Logout (SLO) Middleware', () => {
    describe('SP middleware', () => {
        let app;
        let helper;
        let middleware;

        beforeEach(() => {
            app = express();
            app.use(express.urlencoded({ extended: true }));

            helper = new SAMLHelper({
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

            helper.createServiceProvider();
            middleware = helper.getExpressMiddleware();
        });

        test('GET /logout should initiate SP-initiated logout (redirect with SAMLRequest)', async () => {
            // Mock partner IdP metadata and createLogoutRequest flow
            helper.loadPartnerMetadata = jest.fn().mockResolvedValue({
                entityMeta: {
                    getSingleLogoutService: () => [{ Location: 'http://localhost:3000/slo' }]
                }
            });

            helper.createLogoutRequest = jest.fn().mockResolvedValue({
                binding: 'redirect',
                relayState: 'returnUrl',
                request: { context: 'http://localhost:3000/slo?SAMLRequest=mock-logout-request' }
            });

            app.get('/logout', middleware.sp.logout);

            const resp = await request(app)
                .get('/logout')
                .query({ nameID: 'user@example.com', sessionIndex: 'sess-123', RelayState: '/goodbye' })
                .expect(302);

            expect(resp.headers.location).toContain('http://localhost:3000/slo');
            expect(resp.headers.location).toContain('SAMLRequest=');
            expect(helper.loadPartnerMetadata).toHaveBeenCalled();
            expect(helper.createLogoutRequest).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
                nameID: 'user@example.com',
                sessionIndex: 'sess-123',
                binding: 'redirect'
            }));
        });

        test('ALL /logout/callback should handle LogoutResponse and destroy session', async () => {
            // Mock partner IdP and parseLogoutResponse
            helper.loadPartnerMetadata = jest.fn().mockResolvedValue({ entityMeta: {} });
            helper.parseLogoutResponse = jest.fn().mockResolvedValue({ success: true });

            // Attach a fake session with destroy
            app.use((req, _res, next) => {
                req.session = {
                    destroyed: false,
                    destroy: (cb) => { req.session.destroyed = true; cb && cb(); }
                };
                next();
            });

            app.all('/logout/callback', middleware.sp.logoutCallback);

            const resp = await request(app)
                .get('/logout/callback')
                .set('Accept', 'application/json')
                .query({ SAMLResponse: 'mock-response', RelayState: '/' })
                .expect(200);

            expect(resp.body.success).toBe(true);
            expect(helper.parseLogoutResponse).toHaveBeenCalled();
        });

        test('ALL /slo should handle IdP-initiated LogoutRequest and respond (redirect)', async () => {
            // Mock partner IdP and SP parse/create
            helper.loadPartnerMetadata = jest.fn().mockResolvedValue({
                entityMeta: {
                    getSingleLogoutService: () => [{ Location: 'http://localhost:3000/slo' }]
                }
            });

            helper.sp.parseLogoutRequest = jest.fn().mockResolvedValue({ extract: { nameID: 'user@example.com' } });
            helper.sp.createLogoutResponse = jest.fn().mockResolvedValue({ context: 'http://localhost:3000/slo?SAMLResponse=mock' });

            app.all('/slo', middleware.sp.slo);

            const resp = await request(app)
                .get('/slo')
                .query({ SAMLRequest: 'mock' })
                .expect(302);

            expect(resp.headers.location).toContain('SAMLResponse=');
            expect(helper.sp.parseLogoutRequest).toHaveBeenCalled();
            expect(helper.sp.createLogoutResponse).toHaveBeenCalled();
        });
    });

    describe('IdP middleware', () => {
        let app;
        let helper;
        let middleware;

        beforeEach(() => {
            app = express();
            app.use(express.urlencoded({ extended: true }));

            helper = new SAMLHelper({
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
                }
            });

            helper.createIdentityProvider();
            middleware = helper.getExpressMiddleware();
        });

        test('ALL /slo should handle SP-initiated LogoutRequest and respond (redirect)', async () => {
            // Mock partner SP and IdP parse/create
            helper.loadPartnerMetadata = jest.fn().mockResolvedValue({
                entityMeta: {
                    getSingleLogoutService: () => [{ Location: 'http://localhost:4000/slo' }]
                }
            });

            helper.idp.parseLogoutRequest = jest.fn().mockResolvedValue({ extract: { nameID: 'user@example.com' } });
            helper.idp.createLogoutResponse = jest.fn().mockResolvedValue({ context: 'http://localhost:4000/slo?SAMLResponse=mock' });

            app.all('/slo', middleware.idp.slo);

            const resp = await request(app)
                .get('/slo')
                .query({ SAMLRequest: 'mock' })
                .expect(302);

            expect(resp.headers.location).toContain('SAMLResponse=');
            expect(helper.idp.parseLogoutRequest).toHaveBeenCalled();
            expect(helper.idp.createLogoutResponse).toHaveBeenCalled();
        });

        test('GET /initiate-logout should initiate IdP-initiated logout (redirect with SAMLRequest)', async () => {
            // Mock partner SP and IdP createLogoutRequest
            helper.loadPartnerMetadata = jest.fn().mockResolvedValue({
                entityMeta: {
                    getSingleLogoutService: () => [{ Location: 'http://localhost:4000/slo' }]
                }
            });

            helper.idp.createLogoutRequest = jest.fn().mockResolvedValue({ context: 'http://localhost:4000/slo?SAMLRequest=mock' });

            app.get('/initiate-logout', middleware.idp.initiateLogout);

            const resp = await request(app)
                .get('/initiate-logout')
                .query({ nameID: 'user@example.com', sessionIndex: 'sess-1' })
                .expect(302);

            expect(resp.headers.location).toContain('SAMLRequest=');
            expect(helper.idp.createLogoutRequest).toHaveBeenCalled();
        });
    });
});
