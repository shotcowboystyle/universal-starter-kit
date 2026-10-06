import '@testing-library/jest-dom';

import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  })),
});

class ESBuildAndJSDOMCompatibleTextEncoder extends TextEncoder {
  // Re-wrap in this realm's Uint8Array so esbuild's instanceof check passes;
  // the bytes stay real UTF-8.
  encode(input = '') {
    return new Uint8Array(super.encode(input));
  }
}

Object.defineProperty(global, 'TextEncoder', {
  value: ESBuildAndJSDOMCompatibleTextEncoder,
  writable: true,
});

afterEach(() => {
  cleanup();
});
