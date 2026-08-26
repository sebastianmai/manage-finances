module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  testMatch: ['<rootDir>/src/**/*.test.jsx'],
  moduleNameMapper: {
    '\\.(svg|png|jpg|jpeg|gif|webp|avif)$': '<rootDir>/__mocks__/fileMock.cjs',
    '\\.(css|scss|sass|less)$': '<rootDir>/__mocks__/styleMock.cjs',
  },
  // d3 and its sub-packages (plus their own ESM-only deps) ship as ES
  // modules with no CommonJS build -- Jest's default transformIgnorePatterns
  // excludes all of node_modules, so without this override `import`/`export`
  // in those packages reaches Jest's runtime untranspiled.
  transformIgnorePatterns: [
    '/node_modules/(?!(?:d3|d3-[a-z-]+|internmap|delaunator|robust-predicates)/)',
  ],
  clearMocks: true,
  restoreMocks: true,
};
