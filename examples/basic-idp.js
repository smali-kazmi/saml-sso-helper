const express = require('express');
const SAMLHelper = require('../index');

const app = express();
app.use(express.urlencoded({ extended: true }));

// Initialize SAML Helper for Identity Provider
const samlHelper = new SAMLHelper({
    encryption: true, // Enable encryption
    entityID: 'http://localhost:3000/metadata',
    baseURL: 'http://localhost:3000',
    partnerMetadataURL: 'http://localhost:4000/metadata',
    certificates: {
        signing: {
            key: '../certificates/idp-signing.key',
            cert: '../certificates/idp-signing.cert'
        },
        encryption: {
            key: '../certificates/idp-encrypt.key',
            cert: '../certificates/idp-encrypt.cert'
        }
    },
    attributes: ['email', 'displayName', 'firstName', 'lastName', 'age', 'gender', 'username']
});

// Create IdP instance
samlHelper.createIdentityProvider();

// Get Express middleware
const middleware = samlHelper.getExpressMiddleware();

// Routes
app.get('/metadata', middleware.idp.metadata);

// SSO endpoint with custom user data
app.get('/sso', (req, res) => {
    // Simulate user authentication and data
    req.userData = {
        email: 'john.doe@example.com',
        displayName: 'John Doe',
        firstName: 'John',
        lastName: 'Doe',
        age: '30',
        gender: 'Male',
        username: 'johndoe'
    };

    // Use the middleware
    middleware.idp.sso(req, res);
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'SAML IdP',
        encryption: samlHelper.config.encryption,
        timestamp: new Date().toISOString()
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('🚀 Basic IdP Example running on http://localhost:' + PORT);
    console.log('📋 Metadata: http://localhost:' + PORT + '/metadata');
    console.log('🔐 SSO: http://localhost:' + PORT + '/sso');
    console.log('🔄 Encryption:', samlHelper.config.encryption ? 'Enabled' : 'Disabled');
});

module.exports = app;
