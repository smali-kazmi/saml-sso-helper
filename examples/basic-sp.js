const express = require('express');
const SAMLHelper = require('../index');

const app = express();
app.use(express.urlencoded({ extended: true }));

// Initialize SAML Helper for Service Provider
const samlHelper = new SAMLHelper({
    encryption: true, // Must match IdP setting
    entityID: 'http://localhost:4000/metadata',
    baseURL: 'http://localhost:4000',
    partnerMetadataURL: 'http://localhost:3000/metadata',
    certificates: {
        signing: {
            key: '../certificates/sp-signing.key',
            cert: '../certificates/sp-signing.cert'
        },
        encryption: {
            key: '../certificates/sp-encrypt.key',
            cert: '../certificates/sp-encrypt.cert'
        }
    }
});

// Create SP instance
samlHelper.createServiceProvider();

// Get Express middleware
const middleware = samlHelper.getExpressMiddleware();

// Routes
app.get('/metadata', middleware.sp.metadata);
app.get('/login', middleware.sp.login);
app.post('/assert', middleware.sp.assert);

// Landing page
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><title>SAML SP Example</title></head>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
                <h1>🔐 SAML Service Provider</h1>
                <p>This is a basic Service Provider example using saml-sso-helper.</p>
                
                <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3>Configuration</h3>
                    <ul>
                        <li><strong>Entity ID:</strong> ${samlHelper.config.entityID}</li>
                        <li><strong>Base URL:</strong> ${samlHelper.config.baseURL}</li>
                        <li><strong>Encryption:</strong> ${samlHelper.config.encryption ? '✅ Enabled' : '❌ Disabled'}</li>
                        <li><strong>Partner IdP:</strong> ${samlHelper.config.partnerMetadataURL}</li>
                    </ul>
                </div>
                
                <div style="margin: 30px 0;">
                    <a href="/login" style="display: inline-block; background: #007cba; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
                        🚀 Start SAML Login
                    </a>
                </div>
                
                <div style="margin-top: 40px; font-size: 14px; color: #666;">
                    <h4>Available Endpoints:</h4>
                    <ul>
                        <li><code>GET /metadata</code> - SP metadata</li>
                        <li><code>GET /login</code> - Initiate SAML login</li>
                        <li><code>POST /assert</code> - Assertion consumer service</li>
                        <li><code>GET /health</code> - Health check</li>
                    </ul>
                </div>
            </body>
        </html>
    `);
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'SAML SP',
        encryption: samlHelper.config.encryption,
        timestamp: new Date().toISOString()
    });
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log('🚀 Basic SP Example running on http://localhost:' + PORT);
    console.log('📋 Metadata: http://localhost:' + PORT + '/metadata');
    console.log('🔐 Login: http://localhost:' + PORT + '/login');
    console.log('🔄 Encryption:', samlHelper.config.encryption ? 'Enabled' : 'Disabled');
    console.log('👀 Visit: http://localhost:' + PORT + ' to get started');
});

module.exports = app;
