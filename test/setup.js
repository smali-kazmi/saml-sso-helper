// Jest setup file for SAML SSO Helper tests

// Global test configuration
process.env.NODE_ENV = 'test';

// Mock console.log for cleaner test output
global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: console.error // Keep error for debugging
};

// Global test helpers
global.createMockSAMLRequest = () => {
    return Buffer.from('mock-saml-request').toString('base64');
};

global.createMockSAMLResponse = () => {
    return Buffer.from('mock-saml-response').toString('base64');
};

// Mock axios for external HTTP calls in tests
jest.mock('axios', () => ({
    get: jest.fn(() => Promise.resolve({
        data: `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="http://mock-entity">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="http://mock-sso"/>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`
    }))
}));

// Global cleanup
afterEach(() => {
    jest.clearAllMocks();
});
