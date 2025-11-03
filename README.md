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

### Complete Configuration Reference

```javascript
const samlHelper = new SAMLHelper({
    // ============================================================
    // REQUIRED OPTIONS
    // ============================================================
    
    entityID: 'http://your-domain.com/metadata',
    // Required. Your unique SAML entity identifier (usually your metadata URL)
    
    baseURL: 'http://your-domain.com',
    // Required. Base URL of your application (used to construct endpoints)
    
    certificates: {
        signing: {
            key: './path/to/signing.key',      // Required. Path to signing private key
            cert: './path/to/signing.cert'      // Required. Path to signing certificate
        },
        encryption: {
            key: './path/to/encrypt.key',      // Optional. Required if encryption=true
            cert: './path/to/encrypt.cert'      // Optional. Required if encryption=true
        }
    },
    
    // ============================================================
    // CORE OPTIONS
    // ============================================================
    
    encryption: true,
    // Optional. Enable/disable encrypted SAML assertions
    // Default: true
    // Set to false to disable encryption (not recommended for production)
    
    partnerMetadataURL: 'http://partner-domain.com/metadata',
    // Optional but recommended. URL to load partner's SAML metadata
    // For SP: IdP metadata URL
    // For IdP: SP metadata URL
    // If not provided, you'll need to handle metadata loading manually
    
    // ============================================================
    // USER ATTRIBUTES (IdP only)
    // ============================================================
    
    attributes: ['email', 'displayName', 'firstName', 'lastName'],
    // Optional. Array of user attributes to include in SAML response
    // Default: ['email', 'displayName', 'firstName', 'lastName']
    // Only used by Identity Provider
    // Common attributes: email, displayName, firstName, lastName, 
    //                    username, age, gender, department, role
    
    // ============================================================
    // SAML PROTOCOL OPTIONS
    // ============================================================
    
    nameIDFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    // Optional. Format for NameID in SAML assertions
    // Default: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'
    // Other options:
    //   - 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent'
    //   - 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient'
    //   - 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified'
    
    sessionTimeout: 5,
    // Optional. Session timeout in minutes for SAML assertions
    // Default: 5
    // Controls the NotOnOrAfter attribute in SAML response
    
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    // Optional. Algorithm used for XML signatures
    // Default: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256' (RSA-SHA256)
    // Other options:
    //   - 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha1' (not recommended)
    //   - 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha512'
    
    // ============================================================
    // METADATA SIGNING REQUIREMENTS
    // ============================================================
    
    authnRequestsSigned: true,
    // Optional. For SP: Declares if AuthnRequests will be signed
    // If set to true: Adds AuthnRequestsSigned="true" to SP metadata
    // If set to false: Adds AuthnRequestsSigned="false" to SP metadata
    // If omitted: Attribute not included in metadata
    // Note: This only controls metadata declaration, not actual signing behavior
    
    wantAuthnRequestsSigned: false,
    // Optional. For IdP: Declares if IdP requires signed AuthnRequests
    // If set to true: Adds WantAuthnRequestsSigned="true" to IdP metadata
    // If set to false: Adds WantAuthnRequestsSigned="false" to IdP metadata
    // If omitted: Attribute not included in metadata
    // Note: This only controls metadata declaration, not actual validation
    
    // ============================================================
    // MIDDLEWARE BEHAVIOR OPTIONS
    // ============================================================
    
    assertAutoRespond: true,
    // Optional. For SP: Control assert middleware behavior
    // Default: true (middleware auto-responds with JSON)
    // If true: middleware sends JSON response automatically
    // If false: middleware sets req.sso and calls next()
    // Useful if you want to add custom logic after SAML assertion
    
    // ============================================================
    // LIFECYCLE HOOKS
    // ============================================================
    
    onIdpLogout: async (logoutInfo) => {
        // Optional. Callback function executed when IdP processes logout
        // Receives: { nameID, sessionIndex, success }
        // Use for custom cleanup (clear sessions, log audit trail, etc.)
        console.log('User logged out:', logoutInfo.nameID);
    }
});
```

### Configuration Examples

#### Minimal Configuration (Development)

```javascript
const samlHelper = new SAMLHelper({
    entityID: 'http://localhost:3000/metadata',
    baseURL: 'http://localhost:3000',
    encryption: false,  // Disable encryption for testing
    certificates: {
        signing: {
            key: './certs/signing.key',
            cert: './certs/signing.cert'
        }
    }
});
```

#### Production Configuration (IdP)

```javascript
const samlHelper = new SAMLHelper({
    // Required
    entityID: 'https://idp.company.com/metadata',
    baseURL: 'https://idp.company.com',
    partnerMetadataURL: 'https://app.example.com/saml/metadata',
    
    // Certificates with encryption
    certificates: {
        signing: {
            key: '/etc/saml/idp-signing.key',
            cert: '/etc/saml/idp-signing.cert'
        },
        encryption: {
            key: '/etc/saml/idp-encrypt.key',
            cert: '/etc/saml/idp-encrypt.cert'
        }
    },
    
    // Security settings
    encryption: true,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    sessionTimeout: 30,
    
    // User attributes
    attributes: [
        'email', 'displayName', 'firstName', 'lastName',
        'department', 'role', 'employeeId'
    ],
    
    // Metadata flags
    wantAuthnRequestsSigned: true,
    
    // Hooks
    onIdpLogout: async (info) => {
        await auditLog.record('logout', info);
        await sessionStore.destroy(info.sessionIndex);
    }
});
```

#### Production Configuration (SP)

```javascript
const samlHelper = new SAMLHelper({
    // Required
    entityID: 'https://app.example.com/saml/metadata',
    baseURL: 'https://app.example.com',
    partnerMetadataURL: 'https://idp.company.com/metadata',
    
    // Certificates with encryption
    certificates: {
        signing: {
            key: '/etc/saml/sp-signing.key',
            cert: '/etc/saml/sp-signing.cert'
        },
        encryption: {
            key: '/etc/saml/sp-encrypt.key',
            cert: '/etc/saml/sp-encrypt.cert'
        }
    },
    
    // Security settings
    encryption: true,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    nameIDFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
    
    // Metadata flags
    authnRequestsSigned: true,
    
    // Custom assert handling
    assertAutoRespond: false  // Handle response in your own middleware
});
```

### Configuration Options Quick Reference

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `entityID` | string | ✅ Yes | - | Your unique SAML entity identifier |
| `baseURL` | string | ✅ Yes | - | Base URL of your application |
| `certificates.signing.key` | string | ✅ Yes | - | Path to signing private key file |
| `certificates.signing.cert` | string | ✅ Yes | - | Path to signing certificate file |
| `certificates.encryption.key` | string | ⚠️ Conditional | - | Path to encryption key (required if `encryption=true`) |
| `certificates.encryption.cert` | string | ⚠️ Conditional | - | Path to encryption cert (required if `encryption=true`) |
| `encryption` | boolean | No | `true` | Enable/disable encrypted assertions |
| `partnerMetadataURL` | string | No | - | Partner's metadata URL (IdP URL for SP, SP URL for IdP) |
| `attributes` | array | No | `['email', 'displayName', 'firstName', 'lastName']` | User attributes to include (IdP only) |
| `nameIDFormat` | string | No | `'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'` | Format for NameID in assertions |
| `sessionTimeout` | number | No | `5` | Session timeout in minutes |
| `signatureAlgorithm` | string | No | `'...rsa-sha256'` | XML signature algorithm |
| `authnRequestsSigned` | boolean | No | - | SP metadata: Declare if AuthnRequests are signed |
| `wantAuthnRequestsSigned` | boolean | No | - | IdP metadata: Declare if signed requests required |
| `assertAutoRespond` | boolean | No | `true` | SP: Auto-respond with JSON from assert middleware |
| `onIdpLogout` | function | No | - | Callback when IdP processes logout |

### Using Environment Variables

You can load configuration from environment variables:

```javascript
// Load configuration from environment
const samlHelper = new SAMLHelper({
    encryption: process.env.ENABLE_ENCRYPTION === 'true',
    entityID: process.env.ENTITY_ID,
    baseURL: process.env.BASE_URL,
    partnerMetadataURL: process.env.PARTNER_METADATA_URL,
    certificates: {
        signing: {
            key: process.env.SIGNING_KEY_PATH || './certs/signing.key',
            cert: process.env.SIGNING_CERT_PATH || './certs/signing.cert'
        },
        encryption: {
            key: process.env.ENCRYPT_KEY_PATH || './certs/encrypt.key',
            cert: process.env.ENCRYPT_CERT_PATH || './certs/encrypt.cert'
        }
    },
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '5'),
    authnRequestsSigned: process.env.AUTHN_REQUESTS_SIGNED === 'true'
});
```

Example `.env` file:

```bash
# Core Settings
ENABLE_ENCRYPTION=true
ENTITY_ID=https://app.example.com/saml/metadata
BASE_URL=https://app.example.com
PARTNER_METADATA_URL=https://idp.company.com/metadata

# Certificate Paths
SIGNING_KEY_PATH=/etc/saml/signing.key
SIGNING_CERT_PATH=/etc/saml/signing.cert
ENCRYPT_KEY_PATH=/etc/saml/encrypt.key
ENCRYPT_CERT_PATH=/etc/saml/encrypt.cert

# SAML Options
SESSION_TIMEOUT=30
AUTHN_REQUESTS_SIGNED=true
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
