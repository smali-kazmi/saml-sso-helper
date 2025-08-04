# SAML SSO Helper

A simplified Node.js wrapper for SAML SSO implementation with encryption support, built on top of [samlify](https://github.com/tngan/samlify).

## Features

- 🔐 **Encryption Support**: Optional encrypted assertions with RSA key pairs
- 🎛️ **Environment Toggle**: Easy encryption on/off switching
- 🔄 **Dynamic Metadata**: Automatic partner metadata loading from URLs
- 📋 **User Attributes**: Comprehensive user profile transmission
- 🎯 **Express Middleware**: Ready-to-use Express.js endpoints
- 🧪 **Testing Tools**: Built-in validation and debugging utilities
- 📖 **Simple API**: Abstract away SAML complexity

## Quick Start

### Installation

```bash
npm install saml-sso-helper
```

### Basic Usage

#### Identity Provider (IdP)

```javascript
const express = require('express');
const SAMLHelper = require('saml-sso-helper');

const app = express();
app.use(express.urlencoded({ extended: true }));

// Initialize SAML Helper
const samlHelper = new SAMLHelper({
    encryption: true, // Enable encryption
    entityID: 'http://localhost:3000/metadata',
    baseURL: 'http://localhost:3000',
    partnerMetadataURL: 'http://localhost:4000/metadata',
    certificates: {
        signing: {
            key: './idp-signing.key',
            cert: './idp-signing.cert'
        },
        encryption: {
            key: './idp-encrypt.key',
            cert: './idp-encrypt.cert'
        }
    },
    attributes: ['email', 'displayName', 'firstName', 'lastName', 'age', 'gender', 'username']
});

// Create IdP instance
samlHelper.createIdentityProvider();

// Get Express middleware
const middleware = samlHelper.getExpressMiddleware();

// Setup routes
app.get('/metadata', middleware.idp.metadata);
app.get('/sso', middleware.idp.sso);

app.listen(3000, () => {
    console.log('🚀 IdP server running on http://localhost:3000');
});
```

#### Service Provider (SP)

```javascript
const express = require('express');
const SAMLHelper = require('saml-sso-helper');

const app = express();
app.use(express.urlencoded({ extended: true }));

// Initialize SAML Helper
const samlHelper = new SAMLHelper({
    encryption: true, // Must match IdP setting
    entityID: 'http://localhost:4000/metadata',
    baseURL: 'http://localhost:4000',
    partnerMetadataURL: 'http://localhost:3000/metadata',
    certificates: {
        signing: {
            key: './sp-signing.key',
            cert: './sp-signing.cert'
        },
        encryption: {
            key: './sp-encrypt.key',
            cert: './sp-encrypt.cert'
        }
    }
});

// Create SP instance
samlHelper.createServiceProvider();

// Get Express middleware
const middleware = samlHelper.getExpressMiddleware();

// Setup routes
app.get('/metadata', middleware.sp.metadata);
app.get('/login', middleware.sp.login);
app.post('/assert', middleware.sp.assert);

app.listen(4000, () => {
    console.log('🚀 SP server running on http://localhost:4000');
});
```

## Configuration Options

### Constructor Options

```javascript
const samlHelper = new SAMLHelper({
    // Core Settings
    encryption: true,                    // Enable/disable encryption
    entityID: 'http://your-entity-id',   // Your entity identifier
    baseURL: 'http://your-base-url',     // Your base URL
    partnerMetadataURL: 'http://...',    // Partner's metadata URL
    
    // Certificates
    certificates: {
        signing: {
            key: './path/to/signing.key',
            cert: './path/to/signing.cert'
        },
        encryption: {                    // Optional, required if encryption=true
            key: './path/to/encrypt.key',
            cert: './path/to/encrypt.cert'
        }
    },
    
    // User Attributes
    attributes: [
        'email', 'displayName', 'firstName', 
        'lastName', 'age', 'gender', 'username'
    ],
    
    // Advanced Options
    nameIDFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    sessionTimeout: 5,                   // Minutes
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'
});
```

### Environment Variables

You can also use environment variables:

```bash
# .env file
ENABLE_ENCRYPTION=true
ENTITY_ID=http://localhost:3000/metadata
BASE_URL=http://localhost:3000
PARTNER_METADATA_URL=http://localhost:4000/metadata
```

## Certificate Generation

Generate required certificates using OpenSSL:

```bash
# Signing certificates
openssl req -x509 -newkey rsa:4096 -keyout idp-signing.key -out idp-signing.cert -days 365 -nodes -subj "/CN=IdP-Signing"
openssl req -x509 -newkey rsa:4096 -keyout sp-signing.key -out sp-signing.cert -days 365 -nodes -subj "/CN=SP-Signing"

# Encryption certificates (if needed)
openssl req -x509 -newkey rsa:4096 -keyout idp-encrypt.key -out idp-encrypt.cert -days 365 -nodes -subj "/CN=IdP-Encrypt"
openssl req -x509 -newkey rsa:4096 -keyout sp-encrypt.key -out sp-encrypt.cert -days 365 -nodes -subj "/CN=SP-Encrypt"
```

## Advanced Usage

### Custom User Data Provider

```javascript
// IdP with custom user data
app.get('/sso', async (req, res) => {
    try {
        // Your authentication logic here
        const userData = await authenticateUser(req);
        
        // Attach user data to request
        req.userData = {
            email: userData.email,
            displayName: userData.fullName,
            firstName: userData.firstName,
            lastName: userData.lastName,
            age: userData.profile.age,
            gender: userData.profile.gender,
            username: userData.username
        };
        
        // Use the middleware
        const middleware = samlHelper.getExpressMiddleware();
        return middleware.idp.sso(req, res);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

### Response Parsing

```javascript
// SP assertion handling with custom processing
app.post('/assert', async (req, res) => {
    try {
        const middleware = samlHelper.getExpressMiddleware();
        
        // Custom handling before standard middleware
        req.customProcessing = true;
        
        return middleware.sp.assert(req, res);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

## Testing

### Built-in Test Script

Create a test script to validate your setup:

```javascript
const axios = require('axios');

async function testSAMLFlow() {
    try {
        console.log('🧪 Testing SAML SSO Flow...');
        
        // Step 1: Initiate login
        const loginResponse = await axios.get('http://localhost:4000/login', {
            maxRedirects: 0,
            validateStatus: status => status === 302
        });
        
        console.log('✅ Login initiated successfully');
        
        // Continue with your test logic...
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testSAMLFlow();
```

## API Reference

### Class: SAMLHelper

#### Constructor

- `new SAMLHelper(config)` - Creates a new SAML helper instance

#### Methods

- `createIdentityProvider(options)` - Initialize IdP configuration
- `createServiceProvider(options)` - Initialize SP configuration
- `loadPartnerMetadata(url, type)` - Load partner metadata dynamically
- `createLoginResponse(sp, request, userData)` - Generate SAML response (IdP)
- `parseLoginResponse(idp, request)` - Parse SAML response (SP)
- `getMetadata(type)` - Get metadata XML
- `getExpressMiddleware()` - Get Express.js middleware functions

## Troubleshooting

### Common Issues

1. **Certificate not found**
   ```
   Error: Failed to load IdP signing key
   ```
   - Ensure certificate paths are correct
   - Check file permissions

2. **Metadata loading failed**
   ```
   Error: Failed to load partner metadata
   ```
   - Verify partner URL is accessible
   - Check network connectivity

3. **Signature verification failed**
   ```
   Error: FAILED_TO_VERIFY_SIGNATURE
   ```
   - Ensure certificates match between IdP and SP
   - Verify signature algorithm compatibility

### Debug Mode

Enable detailed logging:

```javascript
const samlHelper = new SAMLHelper({
    debug: true,
    // ... other options
});
```

## Examples

Check the `/examples` directory for complete working examples:

- `examples/basic-idp.js` - Basic Identity Provider
- `examples/basic-sp.js` - Basic Service Provider
- `examples/encrypted-flow.js` - With encryption enabled
- `examples/custom-attributes.js` - Custom user attributes

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

Built on top of the excellent [samlify](https://github.com/tngan/samlify) library. Special thanks to the samlify community for their comprehensive SAML implementation.

## Support

- 📖 [Documentation](https://github.com/your-repo/saml-sso-helper/wiki)
- 🐛 [Issues](https://github.com/your-repo/saml-sso-helper/issues)
- 💬 [Discussions](https://github.com/your-repo/saml-sso-helper/discussions)
