module.exports = {
  verbose: true,
  testTimeout: 30000,
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'jsdom',
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
      testMatch: [
        '**/tests/unit/**/*.test.js'
      ],
      collectCoverageFrom: [
        '**/*.js',
        '!**/node_modules/**',
        '!**/tests/**',
        '!**/coverage/**',
        '!jest.config.js'
      ],
      coverageDirectory: 'coverage'
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
      testMatch: [
        '**/tests/integration/**/*.test.js'
      ],
      collectCoverageFrom: [
        '**/*.js',
        '!**/node_modules/**',
        '!**/tests/**',
        '!**/coverage/**',
        '!jest.config.js'
      ],
      coverageDirectory: 'coverage'
    },
    {
      displayName: 'e2e',
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
      testMatch: [
        '**/tests/e2e/**/*.test.js'
      ],
      collectCoverageFrom: [
        '**/*.js',
        '!**/node_modules/**',
        '!**/tests/**',
        '!**/coverage/**',
        '!jest.config.js'
      ],
      coverageDirectory: 'coverage'
    }
  ]
};

