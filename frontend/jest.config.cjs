module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  testMatch: ['<rootDir>/src/**/*.test.jsx'],
  moduleNameMapper: {
    '\\.(svg|png|jpg|jpeg|gif|webp|avif)$': '<rootDir>/__mocks__/fileMock.cjs',
    '\\.(css|scss|sass|less)$': '<rootDir>/__mocks__/styleMock.cjs',
  },
  clearMocks: true,
  restoreMocks: true,
};
