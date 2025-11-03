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
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    
    // Metadata Signing Requirements
    authnRequestsSigned: true,           // SP: Declare if AuthnRequests will be signed
    wantAuthnRequestsSigned: false       // IdP: Declare if IdP wants signed AuthnRequests
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

### Metadata Signing Requirements

Control how metadata declares signing requirements:

**For Service Provider (SP)**:
```javascript
const samlHelper = new SAMLHelper({
    authnRequestsSigned: true,  // Declares SP signs its AuthnRequests
    // ... other config
});
```

When `authnRequestsSigned` is set, the SP metadata will contain:
```xml
<SPSSODescriptor AuthnRequestsSigned="true" ...>
```

**For Identity Provider (IdP)**:
```javascript
const samlHelper = new SAMLHelper({
    wantAuthnRequestsSigned: true,  // Declares IdP requires signed AuthnRequests
    // ... other config
});
```

When `wantAuthnRequestsSigned` is set, the IdP metadata will contain:
```xml
<IDPSSODescriptor WantAuthnRequestsSigned="true" ...>
```

**Important Notes**:
- These settings control metadata declaration only
- Both values are optional; if not specified, the attribute won't appear in metadata
- Set to `false` to explicitly declare signing is not used/required
- Actual runtime signing behavior depends on your SAML configuration

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
// SP assertion handling - the middleware sets req.sso and calls next()
app.post('/assert', middleware.sp.assert, (req, res) => {
    // Access parsed SAML data from req.sso
    const samlData = req.sso;
    
    console.log('User authenticated:', samlData.nameID);
    console.log('User attributes:', samlData.attributes);
    
    // Create session or JWT token
    req.session.user = {
        email: samlData.nameID,
        ...samlData.attributes
    };
    
    res.redirect('/dashboard');
});

// On error, the middleware automatically sends:
// {
//   success: false,
//   message: "SAML assertion failed",
//   encryptionEnabled: true,
//   error: "error details",
//   timestamp: "2025-10-20T..."
// }
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

#### Express Middleware

**SP Assert Middleware** (`middleware.sp.assert`)

Handles SAML assertions from the IdP. This is a standard Express middleware that:

- **On Success**: Sets `req.sso` with parsed user data and calls `next()`
- **On Error**: Sends 500 status with JSON error response

**req.sso Object Structure**:
```javascript
{
    success: true,
    nameID: "user@example.com",          // User identifier
    attributes: {                         // User attributes from IdP
        email: "user@example.com",
        displayName: "John Doe",
        firstName: "John",
        lastName: "Doe"
    },
    sessionIndex: "_session_abc123",      // SAML session identifier
    conditions: { /* SAML conditions */ }, // Validity conditions
    audience: "https://sp.example.com",   // Intended audience
    issuer: "https://idp.example.com",    // IdP that issued assertion
    raw: { /* original parsed response */ } // Full raw response
}
```

### Single Logout (SLO)

Add routes on both SP and IdP:

```javascript
// Service Provider (SP)
app.get('/logout', middleware.sp.logout);                   // Initiate SP-initiated logout
app.all('/logout/callback', middleware.sp.logoutCallback);  // Handle LogoutResponse from IdP
app.all('/slo', middleware.sp.slo);                         // Receive IdP-initiated LogoutRequest

// Identity Provider (IdP)
app.all('/slo', middleware.idp.slo);                        // Receive SP-initiated LogoutRequest and respond
// Optional: IdP-initiated logout towards SP
app.get('/initiate-logout', middleware.idp.initiateLogout);
```

SP-initiated flow:
1. Client calls GET `/logout` on SP
2. SP sends LogoutRequest (Redirect binding) to IdP
3. IdP responds with LogoutResponse to SP at `/logout/callback`
4. SP clears session and redirects to RelayState or `/`

IdP-initiated flow:
1. IdP sends LogoutRequest to SP `/slo`
2. SP clears session and returns LogoutResponse to IdP

Notes:
- Uses Redirect binding by default; POST is automatically supported when requests arrive via POST
- Provide `nameID`/`sessionIndex` to SP logout via session, body, or query; the middleware auto-detects
- Optional hook: `config.onIdpLogout(parsed)` for custom cleanup on IdP

**Error Response**:
```javascript
{
    success: false,
    message: "SAML assertion failed",
    encryptionEnabled: true,
    error: "Error details...",
    timestamp: "2025-10-20T12:34:56.789Z"
}
```

**Usage Example**:
```javascript
app.post('/assert', middleware.sp.assert, (req, res) => {
    // req.sso contains parsed SAML data
    const user = req.sso;
    
    // Create session
    req.session.user = {
        email: user.nameID,
        name: user.attributes.displayName,
        ...user.attributes
    };
    
    res.redirect('/dashboard');
});
```

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
