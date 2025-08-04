const request = require('supertest');
const express = require('express');
const SAMLHelper = require('../index');

describe('SAML SSO Helper - Core Functionality', () => {
    let samlHelper;

    beforeEach(() => {
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
            attributes: ['email', 'displayName', 'firstName', 'lastName', 'age', 'gender', 'username']
        });
    });

    describe('Initialization', () => {
        test('should create SAMLHelper instance with correct configuration', () => {
            expect(samlHelper.config.encryption).toBe(true);
            expect(samlHelper.config.entityID).toBe('http://localhost:3000/metadata');
            expect(samlHelper.config.baseURL).toBe('http://localhost:3000');
            expect(samlHelper.config.attributes).toHaveLength(7);
        });

        test('should create Identity Provider successfully', () => {
            const idp = samlHelper.createIdentityProvider();
            expect(idp).toBeDefined();
            expect(samlHelper.idp).toBeDefined();
        });

        test('should create Service Provider successfully', () => {
            const spConfig = {
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
            };
            const sp = samlHelper.createServiceProvider(spConfig);
            expect(sp).toBeDefined();
            expect(samlHelper.sp).toBeDefined();
        });
    });

    describe('Certificate Loading', () => {
        test('should throw error for missing certificate file', () => {
            const invalidHelper = new SAMLHelper({
                certificates: {
                    signing: {
                        key: './nonexistent.key',
                        cert: './certificates/idp-signing.cert'
                    }
                }
            });

            expect(() => {
                invalidHelper.createIdentityProvider();
            }).toThrow();
        });

        test('should load certificates successfully', () => {
            expect(() => {
                samlHelper.createIdentityProvider();
            }).not.toThrow();
        });
    });

    describe('Metadata Generation', () => {
        test('should generate IdP metadata', () => {
            samlHelper.createIdentityProvider();
            const metadata = samlHelper.getMetadata('idp');

            expect(metadata).toBeDefined();
            expect(typeof metadata).toBe('string');
            expect(metadata).toContain('EntityDescriptor');
            expect(metadata).toContain('IDPSSODescriptor');
        });

        test('should generate SP metadata', () => {
            const spConfig = {
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
            };

            samlHelper.createServiceProvider(spConfig);
            const metadata = samlHelper.getMetadata('sp');

            expect(metadata).toBeDefined();
            expect(typeof metadata).toBe('string');
            expect(metadata).toContain('EntityDescriptor');
            expect(metadata).toContain('SPSSODescriptor');
        });
    });

    describe('Configuration Validation', () => {
        test('should require entityID for IdP creation', () => {
            const invalidHelper = new SAMLHelper({});
            expect(() => {
                invalidHelper.createIdentityProvider();
            }).toThrow('EntityID is required for Identity Provider');
        });

        test('should require signing certificate for IdP creation', () => {
            const invalidHelper = new SAMLHelper({
                entityID: 'http://test.com'
            });
            expect(() => {
                invalidHelper.createIdentityProvider();
            }).toThrow('Signing certificate is required');
        });
    });

    describe('Template Generation', () => {
        test('should generate response template with attributes', () => {
            const attributes = ['email', 'displayName', 'firstName'];
            const template = samlHelper._generateResponseTemplate(attributes);

            expect(template).toBeDefined();
            expect(template.context).toContain('saml:Attribute Name="email"');
            expect(template.context).toContain('saml:Attribute Name="displayName"');
            expect(template.context).toContain('saml:Attribute Name="firstName"');
        });
    });
});
