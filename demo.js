#!/usr/bin/env node

const { spawn } = require('child_process');
const axios = require('axios');
const path = require('path');

class SAMLWrapperDemo {
    constructor() {
        this.idpProcess = null;
        this.spProcess = null;
        this.cleanup = false;
    }

    async run() {
        console.log('🚀 SAML SSO Helper - Complete Demo');
        console.log('===================================\n');

        try {
            await this.startServers();
            await this.waitForServers();
            await this.runTests();
            await this.interactiveDemo();
        } catch (error) {
            console.error('❌ Demo failed:', error.message);
        } finally {
            await this.stopServers();
        }
    }

    async startServers() {
        console.log('🔧 Starting SAML servers...\n');

        // Start IdP server
        console.log('📋 Starting Identity Provider (IdP) on port 3000...');
        this.idpProcess = spawn('node', [path.join(__dirname, 'examples/basic-idp.js')], {
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: false
        });

        this.idpProcess.stdout.on('data', (data) => {
            const output = data.toString().trim();
            if (output) console.log('  IdP:', output);
        });

        this.idpProcess.stderr.on('data', (data) => {
            console.error('  IdP Error:', data.toString().trim());
        });

        // Start SP server  
        console.log('📋 Starting Service Provider (SP) on port 4000...');
        this.spProcess = spawn('node', [path.join(__dirname, 'examples/basic-sp.js')], {
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: false
        });

        this.spProcess.stdout.on('data', (data) => {
            const output = data.toString().trim();
            if (output) console.log('  SP:', output);
        });

        this.spProcess.stderr.on('data', (data) => {
            console.error('  SP Error:', data.toString().trim());
        });

        // Wait for servers to start
        await new Promise(resolve => setTimeout(resolve, 3000));
        console.log('');
    }

    async waitForServers() {
        console.log('⏳ Waiting for servers to be ready...\n');

        const maxRetries = 10;
        let retries = 0;

        while (retries < maxRetries) {
            try {
                const [idpHealth, spHealth] = await Promise.all([
                    axios.get('http://localhost:3000/health', { timeout: 2000 }),
                    axios.get('http://localhost:4000/health', { timeout: 2000 })
                ]);

                if (idpHealth.status === 200 && spHealth.status === 200) {
                    console.log('✅ Both servers are ready!\n');
                    return;
                }
            } catch (error) {
                retries++;
                console.log(`  Attempt ${retries}/${maxRetries} - Servers not ready yet...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        throw new Error('Servers failed to start within timeout');
    }

    async runTests() {
        console.log('🧪 Running automated tests...\n');

        try {
            // Import and run the test
            const testWrapper = require('./test-wrapper');
            await testWrapper();
            console.log('');
        } catch (error) {
            console.error('Test failed:', error.message);
        }
    }

    async interactiveDemo() {
        console.log('🎯 Interactive Demo Options:');
        console.log('============================\n');

        console.log('🌐 Available URLs:');
        console.log('  • IdP Health: http://localhost:3000/health');
        console.log('  • IdP Metadata: http://localhost:3000/metadata');
        console.log('  • SP Home: http://localhost:4000/');
        console.log('  • SP Metadata: http://localhost:4000/metadata');
        console.log('  • SP Login: http://localhost:4000/login');
        console.log('');

        console.log('🔄 Testing SAML Flow:');
        console.log('  1. Visit: http://localhost:4000/');
        console.log('  2. Click "Start SAML Login" button');
        console.log('  3. You will be redirected to IdP for authentication');
        console.log('  4. IdP will process and return SAML response');
        console.log('  5. SP will parse and display user information');
        console.log('');

        console.log('💡 What happens behind the scenes:');
        console.log('  ✅ SP generates SAML AuthnRequest');
        console.log('  ✅ User redirected to IdP SSO endpoint');
        console.log('  ✅ IdP creates encrypted SAML response');
        console.log('  ✅ SAML response posted back to SP');
        console.log('  ✅ SP decrypts and validates response');
        console.log('  ✅ User attributes extracted and displayed');
        console.log('');

        console.log('🎪 Demo Features:');
        console.log('  🔐 Encryption: Enabled');
        console.log('  📋 User Attributes: 7 (name, email, age, etc.)');
        console.log('  🔑 Signature Verification: RSA-SHA256');
        console.log('  📄 Dynamic Metadata Loading');
        console.log('  🛡️ Certificate-based Security');
        console.log('');

        // Keep servers running
        console.log('⚡ Servers will continue running for testing...');
        console.log('   Press Ctrl+C to stop the demo');

        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            if (!this.cleanup) {
                this.cleanup = true;
                console.log('\n\n🛑 Shutting down demo...');
                await this.stopServers();
                process.exit(0);
            }
        });

        // Keep the process alive
        await new Promise(() => { });
    }

    async stopServers() {
        console.log('🔧 Stopping servers...');

        if (this.idpProcess) {
            this.idpProcess.kill('SIGTERM');
            console.log('  ✅ IdP server stopped');
        }

        if (this.spProcess) {
            this.spProcess.kill('SIGTERM');
            console.log('  ✅ SP server stopped');
        }

        console.log('');
    }
}

// Run demo if this script is executed directly
if (require.main === module) {
    const demo = new SAMLWrapperDemo();
    demo.run().catch(console.error);
}

module.exports = SAMLWrapperDemo;
