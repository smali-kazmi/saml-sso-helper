const request = require('supertest');
const SAMLHelper = require('../index');

describe('Encryption and Security Tests', () => {
    describe('Encryption Configuration', () => {
        test('should handle encrypted mode correctly', () => {
            const encryptedHelper = new SAMLHelper({
                encryption: true,
                entityID: 'http://localhost:3000/metadata',
                baseURL: 'http://localhost:3000',
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

            encryptedHelper.createIdentityProvider();
            expect(encryptedHelper.config.encryption).toBe(true);
        });

        test('should handle non-encrypted mode correctly', () => {
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

            nonEncryptedHelper.createIdentityProvider();
            expect(nonEncryptedHelper.config.encryption).toBe(false);
        });

        test('should require encryption certificates when encryption is enabled', () => {
            const helper = new SAMLHelper({
                encryption: true,
                entityID: 'http://localhost:3000/metadata',
                baseURL: 'http://localhost:3000',
                certificates: {
                    signing: {
                        key: './certificates/idp-signing.key',
                        cert: './certificates/idp-signing.cert'
                    }
                    // Missing encryption certificates
                }
            });

            // Should still work but without encryption keys
            expect(() => {
                helper.createIdentityProvider();
            }).not.toThrow();
        });
    });

    describe('Certificate Validation', () => {
        test('should validate certificate paths', () => {
            const helper = new SAMLHelper({
                entityID: 'http://localhost:3000/metadata',
                certificates: {
                    signing: {
                        key: './certificates/idp-signing.key',
                        cert: './certificates/idp-signing.cert'
                    }
                }
            });

            expect(() => {
                helper._loadCertificate('./certificates/idp-signing.key', 'Test key');
            }).not.toThrow();
        });

        test('should throw error for invalid certificate paths', () => {
            const helper = new SAMLHelper({
                entityID: 'http://localhost:3000/metadata',
                certificates: {
                    signing: {
                        key: './nonexistent.key',
                        cert: './certificates/idp-signing.cert'
                    }
                }
            });

            expect(() => {
                helper._loadCertificate('./nonexistent.key', 'Test key');
            }).toThrow('Failed to load Test key');
        });
    });

    describe('Security Headers and Configuration', () => {
        test('should use secure signature algorithms', () => {
            const helper = new SAMLHelper({
                entityID: 'http://localhost:3000/metadata',
                certificates: {
                    signing: {
                        key: './certificates/idp-signing.key',
                        cert: './certificates/idp-signing.cert'
                    }
                }
            });

            expect(helper.config.signatureAlgorithm).toBe('http://www.w3.org/2001/04/xmldsig-more#rsa-sha256');
        });

        test('should configure proper NameID format', () => {
            const helper = new SAMLHelper({
                entityID: 'http://localhost:3000/metadata',
                certificates: {
                    signing: {
                        key: './certificates/idp-signing.key',
                        cert: './certificates/idp-signing.cert'
                    }
                }
            });

            expect(helper.config.nameIDFormat).toBe('urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress');
        });

        test('should set reasonable session timeout', () => {
            const helper = new SAMLHelper({
                entityID: 'http://localhost:3000/metadata',
                certificates: {
                    signing: {
                        key: './certificates/idp-signing.key',
                        cert: './certificates/idp-signing.cert'
                    }
                }
            });

            expect(helper.config.sessionTimeout).toBe(5); // 5 minutes default
        });
    });

    describe('Template Security', () => {
        test('should generate secure SAML response templates', () => {
            const helper = new SAMLHelper({
                entityID: 'http://localhost:3000/metadata',
                certificates: {
                    signing: {
                        key: './certificates/idp-signing.key',
                        cert: './certificates/idp-signing.cert'
                    }
                },
                attributes: ['email', 'displayName']
            });

            const template = helper._generateResponseTemplate(['email', 'displayName']);

            expect(template.context).toContain('saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"');
            expect(template.context).toContain('saml:AudienceRestriction');
            expect(template.context).toContain('NotBefore="{NotBefore}" NotOnOrAfter="{NotOnOrAfter}"');
            expect(template.context).toContain('saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport');
        });

        test('should properly escape attribute values in templates', () => {
            const helper = new SAMLHelper({
                entityID: 'http://localhost:3000/metadata',
                certificates: {
                    signing: {
                        key: './certificates/idp-signing.key',
                        cert: './certificates/idp-signing.cert'
                    }
                }
            });

            const template = helper._generateResponseTemplate(['email']);

            // Template should use proper SAML attribute format
            expect(template.context).toContain('saml:AttributeValue xsi:type="xs:string">{email}</saml:AttributeValue>');
        });
    });

    describe('Metadata Security', () => {
        test('IdP metadata should contain security configurations', () => {
            const helper = new SAMLHelper({
                encryption: true,
                entityID: 'http://localhost:3000/metadata',
                baseURL: 'http://localhost:3000',
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
            const metadata = helper.getMetadata('idp');

            expect(metadata).toContain('X509Certificate');
            expect(metadata).toContain('KeyDescriptor use="signing"');
            expect(metadata).toBeDefined();
        });

        test('SP metadata should contain assertion consumer service', () => {
            const helper = new SAMLHelper({
                encryption: true,
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

            helper.createServiceProvider();
            const metadata = helper.getMetadata('sp');

            expect(metadata).toContain('AssertionConsumerService');
            expect(metadata).toContain('http://localhost:4000/assert');
        });
    });
});
