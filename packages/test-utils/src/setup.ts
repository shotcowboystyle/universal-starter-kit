/**
 * Shared test setup for workspace packages.
 *
 * Use this as a vitest setupFile to get all the polyfills, mocks, and
 * environment patches needed for testing Tamagui + React Native Web components.
 *
 * @example
 * ```ts
 * // vitest.config.mjs
 * import { createVitestConfig } from "@repo/config/vitest";
 * export default createVitestConfig({
 *   setupFiles: ["@repo/test-utils/setup"],
 * });
 * ```
 */

// localStorage polyfill FIRST so Tamagui plugin (tamagui-extract) can run during transform
const _noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  get length() {
    return 0;
  },
  key: () => null,
};
if (typeof globalThis !== 'undefined' && typeof (globalThis as any).localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', { value: _noopStorage, writable: true });
}
if (typeof global !== 'undefined' && !('localStorage' in global)) {
  Object.defineProperty(global, 'localStorage', { value: _noopStorage, writable: true });
}

// DOM polyfills -- must run BEFORE any imports that use them
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // happy-dom exposes CSSStyleDeclaration index properties as getter-only.
  // Some RN-web/Tamagui render paths can transiently pass array-like style maps
  // during test rendering, which makes React assign style[0], style[1], etc.
  // Defining no-op numeric setters prevents hard crashes in tests.
  if (typeof CSSStyleDeclaration !== 'undefined' && CSSStyleDeclaration.prototype) {
    for (let i = 0; i <= 64; i++) {
      const key = String(i);
      const desc = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, key);
      if (!desc || desc.set == null) {
        Object.defineProperty(CSSStyleDeclaration.prototype, key, {
          configurable: true,
          enumerable: false,
          get() {
            return '';
          },
          set() {
            // no-op in test environment
          },
        });
      }
    }
  }

  // Fix NodeList.prototype to ensure forEach exists
  if (typeof NodeList !== 'undefined' && NodeList.prototype) {
    if (!NodeList.prototype.forEach) {
      (NodeList.prototype as any).forEach = Array.prototype.forEach;
    }
  }

  // Also add to HTMLCollection
  if (typeof HTMLCollection !== 'undefined' && HTMLCollection.prototype) {
    if (!(HTMLCollection.prototype as any).forEach) {
      (HTMLCollection.prototype as any).forEach = Array.prototype.forEach;
    }
  }

  // Element.matches polyfill
  const matchesImpl = function (this: any, selector: string) {
    if (!this || typeof this !== 'object') {
      return false;
    }
    if (this.nodeType === 1) {
      if (this.webkitMatchesSelector) {
        return this.webkitMatchesSelector(selector);
      }
      if (this.mozMatchesSelector) {
        return this.mozMatchesSelector(selector);
      }
      if (this.msMatchesSelector) {
        return this.msMatchesSelector(selector);
      }
      const matches = (this.ownerDocument || document).querySelectorAll(selector);
      let i = matches.length;
      while (--i >= 0 && matches[i] !== this) {}
      return i > -1;
    }
    return false;
  };

  if (Element.prototype && !Element.prototype.matches) {
    Object.defineProperty(Element.prototype, 'matches', {
      value: matchesImpl,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }

  if (typeof HTMLElement !== 'undefined' && HTMLElement.prototype && !HTMLElement.prototype.matches) {
    Object.defineProperty(HTMLElement.prototype, 'matches', {
      value: matchesImpl,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }

  // hasAttribute / getAttribute / setAttribute polyfills for all Node types
  const hasAttributeImpl = function (this: any, name: string): boolean {
    if (!this || this.nodeType !== 1) {
      return false;
    }
    if (Element.prototype.hasAttribute && this instanceof Element) {
      return Element.prototype.hasAttribute.call(this, name);
    }
    if (this.attributes) {
      for (let i = 0; i < this.attributes.length; i++) {
        if (this.attributes[i].name === name) {
          return true;
        }
      }
    }
    return false;
  };

  const getAttributeImpl = function (this: any, name: string): string | null {
    if (!this || this.nodeType !== 1) {
      return null;
    }
    if (Element.prototype.getAttribute && this instanceof Element) {
      return Element.prototype.getAttribute.call(this, name);
    }
    if (this.attributes) {
      for (let i = 0; i < this.attributes.length; i++) {
        if (this.attributes[i].name === name) {
          return this.attributes[i].value;
        }
      }
    }
    return null;
  };

  const nodeTypes = (
    [
      typeof Node !== 'undefined' && Node,
      typeof Element !== 'undefined' && Element,
      typeof HTMLElement !== 'undefined' && HTMLElement,
      typeof HTMLDivElement !== 'undefined' && HTMLDivElement,
      typeof HTMLSpanElement !== 'undefined' && HTMLSpanElement,
      typeof HTMLInputElement !== 'undefined' && HTMLInputElement,
      typeof HTMLButtonElement !== 'undefined' && HTMLButtonElement,
      typeof HTMLFormElement !== 'undefined' && HTMLFormElement,
      typeof HTMLLabelElement !== 'undefined' && HTMLLabelElement,
      typeof Text !== 'undefined' && Text,
      typeof Comment !== 'undefined' && Comment,
      typeof Document !== 'undefined' && Document,
      typeof DocumentFragment !== 'undefined' && DocumentFragment,
    ] as Array<false | (new (...args: any[]) => any)>
  ).filter(Boolean) as Array<new (...args: any[]) => any>;

  for (const NodeType of nodeTypes) {
    if ((NodeType as any)?.prototype) {
      if (!(NodeType as any).prototype.hasAttribute) {
        Object.defineProperty((NodeType as any).prototype, 'hasAttribute', {
          value: hasAttributeImpl,
          writable: true,
          configurable: true,
          enumerable: false,
        });
      }
      if (!(NodeType as any).prototype.getAttribute) {
        Object.defineProperty((NodeType as any).prototype, 'getAttribute', {
          value: getAttributeImpl,
          writable: true,
          configurable: true,
          enumerable: false,
        });
      }
      if (!(NodeType as any).prototype.setAttribute) {
        Object.defineProperty((NodeType as any).prototype, 'setAttribute', {
          value: function (name: string, value: string) {
            if (this.nodeType === 1 && Element.prototype.setAttribute) {
              Element.prototype.setAttribute.call(this, name, value);
            }
          },
          writable: true,
          configurable: true,
          enumerable: false,
        });
      }
    }
  }

  // Polyfill HTMLFormElement.prototype.requestSubmit for jsdom
  if (typeof HTMLFormElement !== 'undefined') {
    Object.defineProperty(HTMLFormElement.prototype, 'requestSubmit', {
      value: function (submitter?: HTMLElement) {
        if (submitter) {
          if ((submitter as HTMLButtonElement).type !== 'submit') {
            throw new TypeError('The specified element is not a submit button');
          }
          if ((submitter as HTMLButtonElement).form !== this) {
            throw new DOMException('The specified element is not owned by this form element', 'NotFoundError');
          }
        }
        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
        this.dispatchEvent(submitEvent);
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
}

// Now safe to import modules that depend on polyfills
// Must precede any tamagui import: isWebTouchable is read once at module load.
import './noTouchPolyfill';
import '@testing-library/jest-dom';
import './matchMediaPolyfill';

import { config } from '@tamagui/config';
import { cleanup } from '@testing-library/react';
import { createTamagui } from 'tamagui';
import { afterEach, beforeEach, vi } from 'vitest';

// Patch @floating-ui/react to handle missing forEach in test environment
try {
  const floatingUiUtils = await import('@floating-ui/react/utils');
  if (floatingUiUtils?.enableFocusInside) {
    const originalEnableFocusInside = floatingUiUtils.enableFocusInside;
    (floatingUiUtils as any).enableFocusInside = (container: any) => {
      if (!container || !container.querySelectorAll) {
        return;
      }
      const elements = container.querySelectorAll('[data-tabindex]');
      if (!elements.forEach) {
        elements.forEach = Array.prototype.forEach;
      }
      originalEnableFocusInside(container);
    };
  }
} catch {
  // Ignore if module not found
}

// Initialize Tamagui with config
createTamagui(config);

// No-op localStorage for Node/vitest
const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  get length() {
    return 0;
  },
  key: () => null,
};
vi.stubGlobal('localStorage', noopStorage);
Object.defineProperty(globalThis, 'localStorage', { value: noopStorage, writable: true });
if (typeof global !== 'undefined') {
  Object.defineProperty(global, 'localStorage', { value: noopStorage, writable: true });
}

// BroadcastChannel mock
if (typeof globalThis !== 'undefined' && typeof (globalThis as any).BroadcastChannel === 'undefined') {
  (globalThis as any).BroadcastChannel = class BroadcastChannelMock {
    name: string;
    onmessage: ((event: MessageEvent) => void) | null = null;
    constructor(name: string) {
      this.name = name;
    }
    postMessage(_message: any) {}
    close() {}
  };
}

// IndexedDB mock
if (typeof window !== 'undefined' && !window.indexedDB) {
  Object.defineProperty(window, 'indexedDB', {
    value: {
      open: () => ({ onsuccess: null, onerror: null, onupgradeneeded: null, result: null }),
      deleteDatabase: () => ({ onsuccess: null, onerror: null }),
    },
    writable: true,
  });
}

// Stub fetch to prevent real network calls
vi.stubGlobal(
  'fetch',
  vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  ),
);

// requestAnimationFrame / cancelAnimationFrame polyfill
global.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
  return setTimeout(callback, 0) as unknown as number;
}) as typeof window.requestAnimationFrame;

global.cancelAnimationFrame = (id: number): void => {
  clearTimeout(id);
};

// ResizeObserver mock
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = MockResizeObserver as any;

// IntersectionObserver mock
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = '0px';
  // TS7's dom lib added scrollMargin to the interface.
  readonly scrollMargin: string = '0px';
  readonly thresholds: ReadonlyArray<number> = [0];
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'IntersectionObserver', {
    value: MockIntersectionObserver,
    writable: true,
    configurable: true,
  });
}
Object.defineProperty(globalThis, 'IntersectionObserver', {
  value: MockIntersectionObserver,
  writable: true,
  configurable: true,
});
if (typeof global !== 'undefined') {
  Object.defineProperty(global, 'IntersectionObserver', {
    value: MockIntersectionObserver,
    writable: true,
    configurable: true,
  });
}
if (typeof self !== 'undefined') {
  Object.defineProperty(self, 'IntersectionObserver', {
    value: MockIntersectionObserver,
    writable: true,
    configurable: true,
  });
}

// DataTransfer mock
if (typeof DataTransfer === 'undefined') {
  (global as any).DataTransfer = class DataTransfer {
    private data: Map<string, string>;
    constructor() {
      this.data = new Map();
    }
    getData(format: string): string {
      return this.data.get(format) || '';
    }
    setData(format: string, data: string): void {
      this.data.set(format, data);
    }
    clearData(format?: string): void {
      if (format) {
        this.data.delete(format);
      } else {
        this.data.clear();
      }
    }
  };
}

// ClipboardEvent mock
if (typeof ClipboardEvent === 'undefined') {
  (global as any).ClipboardEvent = class ClipboardEvent extends Event {
    clipboardData: any;
    constructor(type: string, options?: any) {
      super(type, options);
      this.clipboardData = options?.clipboardData || {
        getData: () => '',
        setData: () => {},
      };
    }
  };
}

// TextEncoder fix for jsdom
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

// Mock @repo/theme as a passthrough partial mock: the REAL module
// is spread first, so knob/preset resolution (`useResolvedKnobs` / `Preset` /
// `useSemanticGaps` — specs assert knob totality), DEV-warn guards
// (specs assert their console.warn output, so they must stay real), the date
// formatters, chart palette, readable-color logic, and any FUTURE theme export
// all resolve through the actual implementation without touching this file.
// Only the hooks below are replaced, each because the real implementation is
// unsafe in the test environment — NOT to pin spec-friendly values. Packages
// needing different behavior re-register the mock in a later setup file /
// spec (last `vi.mock` registration for a path wins).
vi.mock('@repo/theme', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;

  const getSizeClass = actual.getLayoutSizeClass as (width: number) => string;
  const getPaneBudget = actual.defaultMaxPanes as (sizeClass: string) => 1 | 2;
  // Same SSR fallback the real hook uses (layoutBreakpoints.medium).
  const fallbackWidth = (actual.layoutBreakpoints as { medium: number }).medium;
  const viewportWidth = () => (typeof window === 'undefined' ? fallbackWidth : window.innerWidth);

  return {
    ...actual,
    // Real useLayoutSizeClass subscribes via matchMedia().addEventListener,
    // which test matchMedia polyfills / per-spec vi.fn mocks routinely lack;
    // resolve from window.innerWidth at render (the same value the real hook
    // computes at mount) through the real getLayoutSizeClass.
    useLayoutSizeClass: () => getSizeClass(viewportWidth()),
    // Rides useLayoutSizeClass (same matchMedia dependency); derive the pane
    // budget through the real defaultMaxPanes.
    useMultiPane: (maxPanes?: 1 | 2) => {
      const budget = getPaneBudget(getSizeClass(viewportWidth()));
      return (maxPanes ?? budget) >= 2 && budget >= 2;
    },
    // Real tracker installs document-level capture listeners backed by module
    // state, leaking "last input was keyboard" across tests in a file; noop.
    ensureKeyboardModalityTracking: () => {},
    // Pin pointer modality so manual focus-ring painting is deterministic.
    wasKeyboardFocus: () => false,
  };
});

// Mock 'one' package
vi.mock('one', async () => {
  const { createElement } = await import('react');
  return {
    default: {},
    // @repo/router re-exports Link from `one`; render a plain anchor in tests.
    Link: ({ href, children, ...props }: { href: unknown; children?: React.ReactNode }) =>
      createElement('a', { ...props, href: String(href) }, children),
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
    Head: ({ children }: { children: React.ReactNode }) => children,
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
    }),
  };
});

// Mock @tamagui/animations-reanimated (used by @repo/theme animations)
vi.mock('@tamagui/animations-reanimated', () => ({
  createAnimations: (config: any) => ({
    ...config,
    View: undefined,
    Text: undefined,
    isReactNative: false,
    animations: config,
    useAnimatedNumber: (initial: any) => ({ value: initial, setValue: () => {} }),
    useAnimatedNumberReaction: () => {},
    useAnimatedNumberStyle: () => ({}),
    AnimatedView: ({ children }: any) => children,
    AnimatedText: ({ children }: any) => children,
  }),
}));

// Mock react-native-reanimated to prevent ESM resolution failures
// (publicGlobals missing .js extension in ESM import from index.js)
vi.mock('react-native-reanimated', () => ({
  default: {
    useSharedValue: (init: any) => ({ value: init }),
    useAnimatedStyle: () => ({}),
    withTiming: (val: any) => val,
    withSpring: (val: any) => val,
    withDecay: (val: any) => val,
    withSequence: (...args: any[]) => args[args.length - 1],
    withDelay: (_: any, val: any) => val,
    createAnimatedComponent: (component: any) => component,
    useDerivedValue: (fn: () => any) => ({ value: fn() }),
    useAnimatedRef: () => ({ current: null }),
    runOnJS: (fn: any) => fn,
    runOnUI: (fn: any) => fn,
    Extrapolation: { CLAMP: 'clamp' },
    Layout: { duration: () => ({}) },
    FadeIn: { duration: () => ({}) },
    FadeOut: { duration: () => ({}) },
    Easing: {
      linear: (v: any) => v,
      ease: (v: any) => v,
      bezier: () => (v: any) => v,
    },
    measure: () => null,
    scrollTo: () => {},
    makeMutable: (init: any) => ({ value: init }),
  },
  useSharedValue: (init: any) => ({ value: init }),
  useAnimatedStyle: () => ({}),
  withTiming: (val: any) => val,
  withSpring: (val: any) => val,
  createAnimatedComponent: (component: any) => component,
  runOnJS: (fn: any) => fn,
  runOnUI: (fn: any) => fn,
  useDerivedValue: (fn: () => any) => ({ value: fn() }),
  useAnimatedRef: () => ({ current: null }),
  Easing: {
    linear: (v: any) => v,
    ease: (v: any) => v,
    bezier: () => (v: any) => v,
  },
  FadeIn: { duration: () => ({}) },
  FadeOut: { duration: () => ({}) },
  Layout: { duration: () => ({}) },
}));

// NOTE: @phosphor-icons/react is NOT mocked here. Do NOT add vi.mock() for it
// in this setup file — doing so triggers vitest to resolve the full barrel
// (3024+ icon files) before the mock factory can replace it, causing an
// infinite hang. The real icons work fine in happy-dom (they're just SVG
// components), so no mock is needed.

// Mock @react-navigation/native
vi.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: { children: React.ReactNode }) => children,
  useNavigation: () => ({}),
  useRoute: () => ({}),
  useFocusEffect: () => {},
}));

// Cleanup after each test
// Fix pointer-events: none that Tamagui sets on <html>, which causes
// @testing-library/user-event to refuse pointer interactions.
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = 'html { pointer-events: auto !important; }';
  document.head.appendChild(style);
}

const ignoredTestWarnings = [
  'React does not recognize the `scaleIcon` prop on a DOM element',
  'React does not recognize the `pressTheme` prop on a DOM element',
  'React does not recognize the `marginLeft` prop on a DOM element',
  'Received `true` for a non-boolean attribute `editable`',
  'non-boolean attribute `editable`',
  'Received `true` for a non-boolean attribute `elevate`',
  'Received `true` for a non-boolean attribute `bordered`',
  'react-i18next:: useTranslation: You will need to pass in an i18next instance',
];

const originalConsoleWarn = console.warn.bind(console);
const originalConsoleError = console.error.bind(console);
const shouldIgnoreTestWarning = (args: unknown[]) => {
  const message = args
    .map((arg) => {
      if (typeof arg === 'string') {
        return arg;
      }
      if (arg instanceof Error) {
        return arg.message;
      }
      return String(arg);
    })
    .join(' ');
  if (ignoredTestWarnings.some((pattern) => message.includes(pattern))) {
    return true;
  }

  // React often logs warnings with printf placeholders:
  // "Received `%s` for a non-boolean attribute `%s`." + substitution args.
  const firstArg = typeof args[0] === 'string' ? args[0] : '';
  const hasNonBooleanTemplate = firstArg.includes('non-boolean attribute');
  if (hasNonBooleanTemplate) {
    const tokens = args.map((arg) => String(arg));
    if (tokens.includes('editable') || tokens.includes('elevate') || tokens.includes('bordered')) {
      return true;
    }
  }

  return false;
};

let consoleWarnSpy: ReturnType<typeof vi.spyOn> | null = null;
let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    value: MockIntersectionObserver,
    writable: true,
    configurable: true,
  });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'IntersectionObserver', {
      value: MockIntersectionObserver,
      writable: true,
      configurable: true,
    });
  }
  if (typeof global !== 'undefined') {
    Object.defineProperty(global, 'IntersectionObserver', {
      value: MockIntersectionObserver,
      writable: true,
      configurable: true,
    });
  }
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    if (shouldIgnoreTestWarning(args)) {
      return;
    }
    originalConsoleWarn(...args);
  });
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (shouldIgnoreTestWarning(args)) {
      return;
    }
    originalConsoleError(...args);
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    value: MockIntersectionObserver,
    writable: true,
    configurable: true,
  });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'IntersectionObserver', {
      value: MockIntersectionObserver,
      writable: true,
      configurable: true,
    });
  }
  consoleWarnSpy?.mockRestore();
  consoleErrorSpy?.mockRestore();
  consoleWarnSpy = null;
  consoleErrorSpy = null;
  cleanup();
});
