const SAMLHelper = require('../index');

describe('Metadata flags: AuthnRequestsSigned / WantAuthnRequestsSigned', () => {
    test('SP metadata contains AuthnRequestsSigned="true" when configured', () => {
        const helper = new SAMLHelper({
            entityID: 'http://localhost:4000/metadata',
            baseURL: 'http://localhost:4000',
            authnRequestsSigned: true,
            certificates: {
                signing: {
                    key: './certificates/sp-signing.key',
                    cert: './certificates/sp-signing.cert'
                }
            }
        });

        helper.createServiceProvider();
        const metadata = helper.getMetadata('sp');

        expect(metadata).toContain('<SPSSODescriptor');
        expect(metadata).toMatch(/AuthnRequestsSigned="true"/);
    });

    test('SP metadata contains AuthnRequestsSigned="false" when configured', () => {
        const helper = new SAMLHelper({
            entityID: 'http://localhost:4000/metadata',
            baseURL: 'http://localhost:4000',
            authnRequestsSigned: false,
            certificates: {
                signing: {
                    key: './certificates/sp-signing.key',
                    cert: './certificates/sp-signing.cert'
                }
            }
        });

        helper.createServiceProvider();
        const metadata = helper.getMetadata('sp');

        expect(metadata).toContain('<SPSSODescriptor');
        expect(metadata).toMatch(/AuthnRequestsSigned="false"/);
    });

    test('IdP metadata contains WantAuthnRequestsSigned="true" when configured', () => {
        const helper = new SAMLHelper({
            entityID: 'http://localhost:3000/metadata',
            baseURL: 'http://localhost:3000',
            wantAuthnRequestsSigned: true,
            certificates: {
                signing: {
                    key: './certificates/idp-signing.key',
                    cert: './certificates/idp-signing.cert'
                }
            }
        });

        helper.createIdentityProvider();
        const metadata = helper.getMetadata('idp');

        expect(metadata).toContain('<IDPSSODescriptor');
        expect(metadata).toMatch(/WantAuthnRequestsSigned="true"/);
    });

    test('IdP metadata contains WantAuthnRequestsSigned="false" when configured', () => {
        const helper = new SAMLHelper({
            entityID: 'http://localhost:3000/metadata',
            baseURL: 'http://localhost:3000',
            wantAuthnRequestsSigned: false,
            certificates: {
                signing: {
                    key: './certificates/idp-signing.key',
                    cert: './certificates/idp-signing.cert'
                }
            }
        });

        helper.createIdentityProvider();
        const metadata = helper.getMetadata('idp');

        expect(metadata).toContain('<IDPSSODescriptor');
        expect(metadata).toMatch(/WantAuthnRequestsSigned="false"/);
    });

    test('SP metadata does not contain AuthnRequestsSigned when not configured', () => {
        const helper = new SAMLHelper({
            entityID: 'http://localhost:4000/metadata',
            baseURL: 'http://localhost:4000',
            certificates: {
                signing: {
                    key: './certificates/sp-signing.key',
                    cert: './certificates/sp-signing.cert'
                }
            }
        });

        helper.createServiceProvider();
        const metadata = helper.getMetadata('sp');

        expect(metadata).toContain('<SPSSODescriptor');
        // Should not contain the attribute when not configured
        expect(metadata).not.toMatch(/AuthnRequestsSigned=/);
    });

    test('IdP metadata does not contain WantAuthnRequestsSigned when not configured', () => {
        const helper = new SAMLHelper({
            entityID: 'http://localhost:3000/metadata',
            baseURL: 'http://localhost:3000',
            certificates: {
                signing: {
                    key: './certificates/idp-signing.key',
                    cert: './certificates/idp-signing.cert'
                }
            }
        });

        helper.createIdentityProvider();
        const metadata = helper.getMetadata('idp');

        expect(metadata).toContain('<IDPSSODescriptor');
        // Should not contain the attribute when not configured
        expect(metadata).not.toMatch(/WantAuthnRequestsSigned=/);
    });

    test('Both SP and IdP flags work with encryption enabled', () => {
        const spHelper = new SAMLHelper({
            entityID: 'http://localhost:4000/metadata',
            baseURL: 'http://localhost:4000',
            encryption: true,
            authnRequestsSigned: true,
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

        const idpHelper = new SAMLHelper({
            entityID: 'http://localhost:3000/metadata',
            baseURL: 'http://localhost:3000',
            encryption: true,
            wantAuthnRequestsSigned: false,
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

        spHelper.createServiceProvider();
        idpHelper.createIdentityProvider();

        const spMetadata = spHelper.getMetadata('sp');
        const idpMetadata = idpHelper.getMetadata('idp');

        // Verify flags are present
        expect(spMetadata).toMatch(/AuthnRequestsSigned="true"/);
        expect(idpMetadata).toMatch(/WantAuthnRequestsSigned="false"/);

        // Verify encryption certificates are also present
        expect(spMetadata).toContain('X509Certificate');
        expect(idpMetadata).toContain('X509Certificate');
    });

    test('Flags do not affect other metadata attributes', () => {
        const helper = new SAMLHelper({
            entityID: 'http://localhost:4000/metadata',
            baseURL: 'http://localhost:4000',
            authnRequestsSigned: true,
            certificates: {
                signing: {
                    key: './certificates/sp-signing.key',
                    cert: './certificates/sp-signing.cert'
                }
            }
        });

        helper.createServiceProvider();
        const metadata = helper.getMetadata('sp');

        // Verify flag is present
        expect(metadata).toMatch(/AuthnRequestsSigned="true"/);

        // Verify other essential elements are still present
        expect(metadata).toContain('AssertionConsumerService');
        expect(metadata).toContain('SingleLogoutService');
        expect(metadata).toContain('http://localhost:4000/assert');
        expect(metadata).toContain('http://localhost:4000/slo');
        expect(metadata).toContain('X509Certificate');
    });
});
