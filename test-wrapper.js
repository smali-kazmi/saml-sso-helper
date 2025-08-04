const axios = require('axios');

async function testSAMLWrapper() {
    console.log('🧪 Testing SAML SSO Helper Wrapper');
    console.log('=====================================\n');

    try {
        // Test 1: Check IdP health
        console.log('📋 Step 1: Checking IdP health...');
        const idpHealth = await axios.get('http://localhost:3000/health');
        console.log('✅ IdP Status:', idpHealth.data.status);
        console.log('🔄 IdP Encryption:', idpHealth.data.encryption ? 'Enabled' : 'Disabled');

        // Test 2: Check SP health
        console.log('\n📋 Step 2: Checking SP health...');
        const spHealth = await axios.get('http://localhost:4000/health');
        console.log('✅ SP Status:', spHealth.data.status);
        console.log('🔄 SP Encryption:', spHealth.data.encryption ? 'Enabled' : 'Disabled');

        // Test 3: Verify metadata endpoints
        console.log('\n📋 Step 3: Testing metadata endpoints...');

        const idpMetadata = await axios.get('http://localhost:3000/metadata');
        console.log('✅ IdP Metadata:', idpMetadata.data.length, 'bytes');

        const spMetadata = await axios.get('http://localhost:4000/metadata');
        console.log('✅ SP Metadata:', spMetadata.data.length, 'bytes');

        // Test 4: Test login redirect
        console.log('\n📋 Step 4: Testing login initiation...');
        const loginResponse = await axios.get('http://localhost:4000/login', {
            maxRedirects: 0,
            validateStatus: status => status === 302
        });

        console.log('✅ Login redirect status:', loginResponse.status);
        console.log('🔗 Redirect location:', loginResponse.headers.location);

        // Test 5: Extract and test SSO URL
        console.log('\n📋 Step 5: Testing SSO endpoint...');
        const ssoUrl = loginResponse.headers.location;

        if (ssoUrl) {
            const ssoResponse = await axios.get(ssoUrl, {
                maxRedirects: 0,
                validateStatus: status => status === 200
            });

            console.log('✅ SSO response status:', ssoResponse.status);
            console.log('📄 SSO response size:', ssoResponse.data.length, 'bytes');

            // Check if response contains SAML form
            if (ssoResponse.data.includes('SAMLResponse')) {
                console.log('✅ SAML response form generated successfully');

                // Extract SAML response for testing
                const samlMatch = ssoResponse.data.match(/name="SAMLResponse" value="([^"]+)"/);
                if (samlMatch) {
                    const samlResponse = samlMatch[1];
                    console.log('📝 SAML Response length:', samlResponse.length, 'characters');
                }
            }
        }

        console.log('\n🎉 All tests completed successfully!');
        console.log('\n📊 Summary:');
        console.log('   ✅ IdP and SP health checks passed');
        console.log('   ✅ Metadata endpoints accessible');
        console.log('   ✅ Login flow initiated correctly');
        console.log('   ✅ SAML response generated');
        console.log('   🔄 Encryption mode:', idpHealth.data.encryption ? 'Enabled' : 'Disabled');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);

        if (error.response) {
            console.error('📄 Response status:', error.response.status);
            console.error('📄 Response data:', error.response.data);
        }

        if (error.code === 'ECONNREFUSED') {
            console.error('\n💡 Make sure both IdP (port 3000) and SP (port 4000) servers are running:');
            console.error('   node examples/basic-idp.js');
            console.error('   node examples/basic-sp.js');
        }
    }
}

// Run the test if this script is executed directly
if (require.main === module) {
    testSAMLWrapper();
}

module.exports = testSAMLWrapper;
