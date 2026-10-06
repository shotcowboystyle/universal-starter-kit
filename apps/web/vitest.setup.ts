import '@testing-library/jest-dom/vitest';

import fs from 'node:fs';
import path from 'node:path';

import { cleanup } from '@testing-library/react';
import dotenv from 'dotenv';
import { afterEach, vi } from 'vitest';

// 1. Load Environment Variables
// Load the app-local .env.test instead of the root (which doesn't exist).
// The existence check prevents the ENOENT console noise in CI.
const envTestPath = path.resolve(import.meta.dirname, '.env.test');

if (fs.existsSync(envTestPath)) {
  dotenv.config({ path: envTestPath });
} else {
  // Fallback: ensure essential env vars are always defined for tests
  process.env.NEXT_PUBLIC_WEB_URL ??= 'http://localhost:3000';
  process.env.NEXT_PUBLIC_API_URL ??= 'http://localhost:3001';
}

// 2. Testing Library Setup
// jest-dom/vitest (imported above) already extends Vitest's expect with the matchers.

// Cleanup after each test case
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

// 3. Browser Environment Mocks
// Node.js 24+ ships a built-in localStorage that shadows jsdom's Storage
// implementation. The built-in requires --localstorage-file and its setItem
// is undefined without it. Replace it with a proper in-memory Storage mock
// so Zustand persist middleware (and any other code) can use it normally.
const localStorageMock = (() => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    get length() {
      return store.size;
    },
    key: (n: number) => [...store.keys()][n] ?? null,
  };
})();
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

// Mock ResizeObserver
window.ResizeObserver ||= vi.fn().mockImplementation(() => ({
  disconnect: vi.fn(),
  observe: vi.fn(),
  unobserve: vi.fn(),
}));

// Mock matchMedia
window.matchMedia ||= vi.fn().mockImplementation((query) => ({
  matches: false,
  media: query,
  onchange: null,
  // deprecated
  addListener: vi.fn(),
  // deprecated
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

// 4. Component & Library Mocks

// Mock next/navigation
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual('next/navigation');
  return {
    ...actual,
    useRouter: vi.fn(() => ({
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    })),
    usePathname: vi.fn(() => '/'),
    useSearchParams: vi.fn(() => new URLSearchParams()),
    redirect: vi.fn(),
    permanentRedirect: vi.fn(),
  };
});

// Mock next/cache
vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: vi.fn((fn) => fn),
  unstable_noStore: vi.fn(),
}));
