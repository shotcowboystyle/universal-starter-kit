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

// Imports are hoisted above the polyfills below by the module system anyway;
// listing them first just says so. no-touch-polyfill must precede any tamagui
// import: isWebTouchable is read once at module load.
import './no-touch-polyfill';
import '@testing-library/jest-dom';
import './match-media-polyfill';

import { config } from '@tamagui/config';
import { cleanup } from '@testing-library/react';
import { createTamagui } from 'tamagui';
import { afterEach, beforeEach, vi } from 'vitest';
import type { MockInstance } from 'vitest';

// Hoisted so vi.mock factories (which vitest hoists above imports) can use it.
const { noop } = vi.hoisted(() => ({
  noop: () => {
    // Intentionally empty: test stub.
  },
}));

interface AttributeNode extends Node {
  attributes?: Iterable<{ name: string; value: string }>;
}
interface LegacyMatchable extends Node {
  webkitMatchesSelector?: (selector: string) => boolean;
  mozMatchesSelector?: (selector: string) => boolean;
  msMatchesSelector?: (selector: string) => boolean;
}
interface AttributePolyfillTarget {
  prototype: Partial<Pick<Element, 'hasAttribute' | 'getAttribute' | 'setAttribute'>>;
}

const createNoopStorage = () => ({
  getItem: () => null,
  setItem: noop,
  removeItem: noop,
  clear: noop,
  get length() {
    return 0;
  },
  key: () => null,
});

// Element.matches polyfill
const matchesImpl = function matchesImpl(this: LegacyMatchable | null, selector: string) {
  if (this?.nodeType !== 1) {
    return false;
  }
  if (this.webkitMatchesSelector) {
    return this.webkitMatchesSelector(selector);
  }
  if (this.mozMatchesSelector) {
    return this.mozMatchesSelector(selector);
  }
  if (this.msMatchesSelector) {
    return this.msMatchesSelector(selector);
  }
  for (const match of (this.ownerDocument ?? document).querySelectorAll(selector)) {
    if (match === this) {
      return true;
    }
  }
  return false;
};

// hasAttribute / getAttribute / setAttribute polyfills for all Node types
const hasAttributeImpl = function hasAttributeImpl(this: AttributeNode | null, name: string): boolean {
  if (this?.nodeType !== 1) {
    return false;
  }
  if (this instanceof Element) {
    return Element.prototype.hasAttribute.call(this, name);
  }
  return [...(this.attributes ?? [])].some((attribute) => attribute.name === name);
};

const getAttributeImpl = function getAttributeImpl(this: AttributeNode | null, name: string): string | null {
  if (this?.nodeType !== 1) {
    return null;
  }
  if (this instanceof Element) {
    return Element.prototype.getAttribute.call(this, name);
  }
  return [...(this.attributes ?? [])].find((attribute) => attribute.name === name)?.value ?? null;
};

const setAttributeImpl = function setAttributeImpl(this: Element, name: string, value: string) {
  if (this.nodeType === 1) {
    Element.prototype.setAttribute.call(this, name, value);
  }
};

const nodeTypeNames = [
  'Node',
  'Element',
  'HTMLElement',
  'HTMLDivElement',
  'HTMLSpanElement',
  'HTMLInputElement',
  'HTMLButtonElement',
  'HTMLFormElement',
  'HTMLLabelElement',
  'Text',
  'Comment',
  'Document',
  'DocumentFragment',
];

// localStorage polyfill FIRST so Tamagui plugin (tamagui-extract) can run during transform
const earlyNoopStorage = createNoopStorage();
if ((globalThis as any).localStorage === undefined) {
  Object.defineProperty(globalThis, 'localStorage', { value: earlyNoopStorage, writable: true });
}
if (typeof global !== 'undefined' && !('localStorage' in global)) {
  Object.defineProperty(global, 'localStorage', { value: earlyNoopStorage, writable: true });
}

// DOM polyfills
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // happy-dom exposes CSSStyleDeclaration index properties as getter-only.
  // Some RN-web/Tamagui render paths can transiently pass array-like style maps
  // during test rendering, which makes React assign style[0], style[1], etc.
  // Defining no-op numeric setters prevents hard crashes in tests.
  if (typeof CSSStyleDeclaration !== 'undefined') {
    for (let i = 0; i <= 64; i += 1) {
      const key = String(i);
      const desc = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, key);
      if (desc?.set == null) {
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
  if (typeof NodeList !== 'undefined' && !('forEach' in NodeList.prototype)) {
    (NodeList.prototype as any).forEach = Array.prototype.forEach;
  }

  // Also add to HTMLCollection
  if (typeof HTMLCollection !== 'undefined' && !('forEach' in HTMLCollection.prototype)) {
    (HTMLCollection.prototype as any).forEach = Array.prototype.forEach;
  }

  if (!('matches' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'matches', {
      value: matchesImpl,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }

  if (typeof HTMLElement !== 'undefined' && !('matches' in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, 'matches', {
      value: matchesImpl,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }

  const nodeTypes = nodeTypeNames
    // SAFETY: each name is a DOM constructor; the AttributePolyfillTarget shape only needs its prototype.
    .map((name) => (globalThis as any)[name] as AttributePolyfillTarget | undefined)
    .filter((nodeType) => nodeType != null);

  for (const { prototype } of nodeTypes) {
    if (!prototype.hasAttribute) {
      Object.defineProperty(prototype, 'hasAttribute', {
        value: hasAttributeImpl,
        writable: true,
        configurable: true,
        enumerable: false,
      });
    }
    if (!prototype.getAttribute) {
      Object.defineProperty(prototype, 'getAttribute', {
        value: getAttributeImpl,
        writable: true,
        configurable: true,
        enumerable: false,
      });
    }
    if (!prototype.setAttribute) {
      Object.defineProperty(prototype, 'setAttribute', {
        value: setAttributeImpl,
        writable: true,
        configurable: true,
        enumerable: false,
      });
    }
  }

  // Polyfill HTMLFormElement.prototype.requestSubmit for jsdom
  if (typeof HTMLFormElement !== 'undefined') {
    Object.defineProperty(HTMLFormElement.prototype, 'requestSubmit', {
      value(submitter?: HTMLElement) {
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

// Patch @floating-ui/react to handle missing forEach in test environment
try {
  const floatingUiUtils = await import('@floating-ui/react/utils');
  if ('enableFocusInside' in floatingUiUtils) {
    const originalEnableFocusInside = floatingUiUtils.enableFocusInside;
    (floatingUiUtils as any).enableFocusInside = (container: HTMLElement | null) => {
      if (container == null || !('querySelectorAll' in container)) {
        return;
      }
      const elements = container.querySelectorAll('[data-tabindex]');
      if (!('forEach' in elements)) {
        (elements as any).forEach = Array.prototype.forEach;
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
const noopStorage = createNoopStorage();
vi.stubGlobal('localStorage', noopStorage);
Object.defineProperty(globalThis, 'localStorage', { value: noopStorage, writable: true });
if (typeof global !== 'undefined') {
  Object.defineProperty(global, 'localStorage', { value: noopStorage, writable: true });
}

// BroadcastChannel mock
if ((globalThis as any).BroadcastChannel === undefined) {
  (globalThis as any).BroadcastChannel = class BroadcastChannelMock {
    name: string;
    onmessage: ((event: MessageEvent) => void) | null = null;
    constructor(name: string) {
      this.name = name;
    }
    postMessage = noop;
    close = noop;
  };
}

// IndexedDB mock
if (typeof window !== 'undefined' && window.indexedDB == null) {
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
  // oxlint-disable-next-line eslint/require-await -- fetch must return a Promise; async keeps that contract with a sync body
  vi.fn(async () => Response.json({ data: [] }, { status: 200, headers: { 'Content-Type': 'application/json' } })),
);

// requestAnimationFrame / cancelAnimationFrame polyfill
global.requestAnimationFrame = ((onFrame: FrameRequestCallback): number =>
  setTimeout(onFrame, 0) as unknown as number) as typeof window.requestAnimationFrame;

global.cancelAnimationFrame = (id: number): void => {
  clearTimeout(id);
};

// ResizeObserver mock
class MockResizeObserver {
  observe = noop;
  unobserve = noop;
  disconnect = noop;
}
window.ResizeObserver = MockResizeObserver as any;

const noRecords = (): IntersectionObserverEntry[] => [];

// IntersectionObserver mock
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = '0px';
  // TS7's dom lib added scrollMargin to the interface.
  readonly scrollMargin: string = '0px';
  readonly thresholds: readonly number[] = [0];
  observe = noop;
  unobserve = noop;
  disconnect = noop;
  takeRecords = noRecords;
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
    private readonly data: Map<string, string>;
    constructor() {
      this.data = new Map();
    }
    getData(format: string): string {
      return this.data.get(format) ?? '';
    }
    setData(format: string, data: string): void {
      this.data.set(format, data);
    }
    clearData(format?: string): void {
      if (format !== undefined && format !== '') {
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
    constructor(type: string, options?: ClipboardEventInit) {
      super(type, options);
      this.clipboardData = options?.clipboardData ?? {
        getData: () => '',
        setData: noop,
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

// The slice of @repo/theme the mock below reads from the real module.
interface ThemeExports {
  getLayoutSizeClass: (width: number) => string;
  defaultMaxPanes: (sizeClass: string) => 1 | 2;
  layoutBreakpoints: { medium: number };
}

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
  const actual = await importOriginal<ThemeExports>();

  const getSizeClass = actual.getLayoutSizeClass;
  const getPaneBudget = actual.defaultMaxPanes;
  // Same SSR fallback the real hook uses (layoutBreakpoints.medium).
  const fallbackWidth = actual.layoutBreakpoints.medium;
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
    ensureKeyboardModalityTracking: noop,
    // Pin pointer modality so manual focus-ring painting is deterministic.
    wasKeyboardFocus: () => false,
  };
});

// Mock 'one' package
vi.mock('one', async () => {
  const { createElement, Fragment } = await import('react');
  return {
    default: {},
    // @repo/router re-exports Link from `one`; render a plain anchor in tests.
    // oxlint-disable-next-line sonarjs/function-name -- React component mock; PascalCase is the component naming convention
    Link: ({ href, children, ...props }: { href: unknown; children?: React.ReactNode }) =>
      createElement('a', { ...props, href: String(href) }, children),
    // oxlint-disable-next-line sonarjs/function-name -- React component mock; PascalCase is the component naming convention
    SafeAreaView: ({ children }: { children: React.ReactNode }) => createElement(Fragment, null, children),
    // oxlint-disable-next-line sonarjs/function-name -- React component mock; PascalCase is the component naming convention
    Head: ({ children }: { children: React.ReactNode }) => createElement(Fragment, null, children),
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
    }),
  };
});

// Mock @tamagui/animations-reanimated (used by @repo/theme animations)
vi.mock('@tamagui/animations-reanimated', () => ({
  createAnimations: (animationConfig: any) => ({
    ...animationConfig,
    // oxlint-disable-next-line sonarjs/no-undefined-assignment -- null would change destructuring-default behavior for consumers
    View: undefined,
    // oxlint-disable-next-line sonarjs/no-undefined-assignment -- null would change destructuring-default behavior for consumers
    Text: undefined,
    isReactNative: false,
    animations: animationConfig,
    useAnimatedNumber: (initial: any) => ({ value: initial, setValue: noop }),
    useAnimatedNumberReaction: noop,
    useAnimatedNumberStyle: () => ({}),
    // oxlint-disable-next-line sonarjs/function-name -- React component mock; PascalCase is the component naming convention
    AnimatedView: ({ children }: any) => children,
    // oxlint-disable-next-line sonarjs/function-name -- React component mock; PascalCase is the component naming convention
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
    withSequence: (...args: any[]) => args.at(-1),
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
    scrollTo: noop,
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
vi.mock('@react-navigation/native', async () => {
  const { createElement, Fragment } = await import('react');
  return {
    // oxlint-disable-next-line sonarjs/function-name -- React component mock; PascalCase is the component naming convention
    NavigationContainer: ({ children }: { children: React.ReactNode }) => createElement(Fragment, null, children),
    useNavigation: () => ({}),
    useRoute: () => ({}),
    useFocusEffect: noop,
  };
});

// Cleanup after each test
// Fix pointer-events: none that Tamagui sets on <html>, which causes
// @testing-library/user-event to refuse pointer interactions.
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = 'html { pointer-events: auto !important; }';
  document.head.append(style);
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
  const message = args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ');
  if (ignoredTestWarnings.some((pattern) => message.includes(pattern))) {
    return true;
  }

  // React often logs warnings with printf placeholders:
  // "Received `%s` for a non-boolean attribute `%s`." + substitution args.
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- console args are untyped external input; only a string first arg is a printf template
  const firstArg = typeof args[0] === 'string' ? args[0] : '';
  const hasNonBooleanTemplate = firstArg.includes('non-boolean attribute');
  if (hasNonBooleanTemplate) {
    const tokens = new Set(args.map(String));
    if (tokens.has('editable') || tokens.has('elevate') || tokens.has('bordered')) {
      return true;
    }
  }

  return false;
};

let consoleWarnSpy: MockInstance<typeof console.warn> | null = null;
let consoleErrorSpy: MockInstance<typeof console.error> | null = null;

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
