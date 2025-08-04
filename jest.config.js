module.exports = {
    testEnvironment: 'node',
    testMatch: [
        '**/test/**/*.test.js'
    ],
    collectCoverageFrom: [
        'index.js',
        'examples/**/*.js',
        '!**/node_modules/**'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: [
        'text',
        'lcov',
        'html'
    ],
    verbose: true,
    setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
    testTimeout: 30000
};
