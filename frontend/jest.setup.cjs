require('@testing-library/jest-dom');

if (typeof globalThis.TextEncoder === 'undefined' || typeof globalThis.TextDecoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  if (typeof globalThis.TextEncoder === 'undefined') {
    globalThis.TextEncoder = TextEncoder;
  }
  if (typeof globalThis.TextDecoder === 'undefined') {
    globalThis.TextDecoder = TextDecoder;
  }
}

// Assigned directly (not via jest.spyOn) so it survives `restoreMocks: true`,
// which would otherwise un-silence console.log after the first test in each
// suite (jest.spyOn mocks are auto-restored between tests; plain assignment
// is not).
console.log = jest.fn();
