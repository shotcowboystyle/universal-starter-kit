/**
 * Shared test utilities for workspace packages.
 *
 * @example
 * ```tsx
 * import { renderWithProviders, createFixture } from "@repo/test-utils";
 *
 * test("renders user card", () => {
 *   const { getByText } = renderWithProviders(<UserCard name="Ada" />);
 *   expect(getByText("Ada")).toBeInTheDocument();
 * });
 * ```
 */

import { configWithoutAnimations } from '@tamagui/config';
import { animationsCSS } from '@tamagui/config/v5-css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, within } from '@testing-library/react';
import type { RenderOptions, RenderResult } from '@testing-library/react';
import { createElement, Fragment } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { TamaguiProvider, YStack } from 'tamagui';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Wrap in TamaguiProvider. Defaults to true. */
  tamagui?: boolean;
  /** Wrap in QueryClientProvider. Defaults to true. Pass a QueryClient to use a custom one. */
  queryClient?: boolean | QueryClient;
  /** Wrap in ThemeProvider. Defaults to false. */
  theme?: boolean;
  /** Wrap in FrappeProvider with mock. Defaults to false. */
  frappe?: false | { baseURL?: string };
  /** Wrap in KeycloakProvider with mock. Defaults to false. */
  keycloak?: false | { authenticated?: boolean; roles?: string[]; token?: string };
}

/**
 * Enhanced render result with extra DOM query helpers for React Native Web
 * components (Tamagui). These helpers handle the unique DOM structure
 * produced by RNW and Tamagui.
 */
export interface EnhancedRenderResult extends RenderResult {
  getInput: (name?: string) => Element | null | undefined;
  getAllInputs: () => Element[];
  getButton: (text: string) => Element | undefined;
  getSubmitButton: () => Element | null;
  findTextElement: (text: string) => Element | undefined;
  getTextArea: (name?: string) => Element | null;
  getCheckbox: (name?: string) => Element | null | undefined;
  getRadio: (value?: string) => Element | null | undefined;
  getSelect: (name?: string) => Element | null;
  getSlider: (name?: string) => Element | null;
  getSwitch: (name?: string) => Element | null;
  getLabel: (text: string) => Element | null | undefined;
  getError: () => Element | null | undefined;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

const tamaguiConfig = (() => {
  try {
    // oxlint-disable-next-line unicorn/prefer-module, node/global-require -- deliberate CJS require: the static ESM import would reconfigure the ESM tamagui instance that setup.ts already initialized
    const { createTamagui } = require('tamagui');
    return createTamagui({ ...configWithoutAnimations, animations: animationsCSS });
  } catch {
    return configWithoutAnimations;
  }
})();

const createDefaultQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

const ROLE_BUTTON_SELECTOR = '[role="button"]';

const matchesText = (el: Element, text: string): boolean =>
  (el.textContent?.includes(text) ?? false) || (el.getAttribute('aria-label')?.includes(text) ?? false);

const isPlainButton = (btn: Element): boolean => {
  const role = btn.getAttribute('role');
  return role === null || role === '' || role === 'button';
};

const hasName = (name: string | undefined): name is string => name !== undefined && name !== '';

const enhanceRenderResult = (result: RenderResult): EnhancedRenderResult => {
  const { container } = result;
  return {
    ...result,
    getInput: (name?: string) => {
      if (hasName(name)) {
        return (
          container.querySelector(`input[name="${name}"]`) ??
          container.querySelector(`input[aria-label*="${name}"]`) ??
          container.querySelector('input[type="text"]') ??
          container.querySelector('input:not([type])')
        );
      }
      return (
        container.querySelector('input[type="text"]') ??
        container.querySelector('input:not([type])') ??
        container.querySelector('input')
      );
    },
    getAllInputs: () => [...container.querySelectorAll('input[type="text"], input:not([type]), input')],
    getButton: (text: string) => {
      const nativeButton = [...container.querySelectorAll('button')].find((btn) => matchesText(btn, text));
      if (nativeButton) {
        return nativeButton;
      }
      return [...container.querySelectorAll(ROLE_BUTTON_SELECTOR)].find((btn) => matchesText(btn, text));
    },
    getSubmitButton: () => {
      // Look for native submit button first
      const submitByType = container.querySelector('button[type="submit"]');
      if (submitByType) {
        return submitByType;
      }
      // Look for role="button" (styled View components) with "submit" text before native buttons,
      // because native button[type="button"] may be radio/switch items, not submit buttons
      const roleButtonByText = [...container.querySelectorAll(ROLE_BUTTON_SELECTOR)].find((btn) =>
        btn.textContent?.toLowerCase().includes('submit'),
      );
      if (roleButtonByText) {
        return roleButtonByText;
      }
      // Look for native button elements with "submit" text
      const submitByText = [...container.querySelectorAll('button')].find((btn) =>
        btn.textContent?.toLowerCase().includes('submit'),
      );
      if (submitByText) {
        return submitByText;
      }
      // Fallback: button[type="button"] that isn't a widget with a semantic role
      const buttonByType = [...container.querySelectorAll('button[type="button"]')].find(isPlainButton);
      if (buttonByType) {
        return buttonByType;
      }
      const anyButton = [...container.querySelectorAll('button')].find(isPlainButton);
      if (anyButton) {
        return anyButton;
      }
      return container.querySelector(ROLE_BUTTON_SELECTOR);
    },
    findTextElement: (text: string) => {
      try {
        const containerQueries = within(container);
        return containerQueries.queryByText(text, { exact: false }) ?? undefined;
      } catch {
        const allElements = [...container.querySelectorAll('*')];
        return allElements.find((el) => el.textContent?.includes(text));
      }
    },
    getTextArea: (name?: string) => {
      if (hasName(name)) {
        return (
          container.querySelector(`textarea[name="${name}"]`) ??
          container.querySelector(`textarea[aria-label*="${name}"]`) ??
          container.querySelector('textarea')
        );
      }
      return container.querySelector('textarea');
    },
    getCheckbox: (name?: string) => {
      if (hasName(name)) {
        return (
          container.querySelector(`[role="checkbox"][aria-labelledby*="${name}"]`) ??
          container.querySelector(`input[type="checkbox"][name="${name}"]`)
        );
      }
      return container.querySelector('[role="checkbox"]') ?? container.querySelector('input[type="checkbox"]');
    },
    getRadio: (value?: string) => {
      if (hasName(value)) {
        return (
          container.querySelector(`input[type="radio"][value="${value}"]`) ??
          container.querySelector(`[role="radio"][aria-label*="${value}"]`)
        );
      }
      return container.querySelector('input[type="radio"]') ?? container.querySelector('[role="radio"]');
    },
    getSelect: (name?: string) => {
      if (hasName(name)) {
        return (
          container.querySelector(`select[name="${name}"]`) ??
          container.querySelector(`[role="combobox"][aria-label*="${name}"]`)
        );
      }
      return container.querySelector('select') ?? container.querySelector('[role="combobox"]');
    },
    getSlider: (name?: string) => {
      if (hasName(name)) {
        return (
          container.querySelector(`[role="slider"][aria-label*="${name}"]`) ??
          container.querySelector(`input[type="range"][name="${name}"]`)
        );
      }
      return container.querySelector('[role="slider"]') ?? container.querySelector('input[type="range"]');
    },
    getSwitch: (name?: string) => {
      if (hasName(name)) {
        return (
          container.querySelector(`[role="switch"][aria-label*="${name}"]`) ??
          container.querySelector(`input[type="checkbox"][name="${name}"]`)
        );
      }
      return container.querySelector('[role="switch"]') ?? container.querySelector('input[type="checkbox"]');
    },
    getLabel: (text: string) =>
      container.querySelector('label')?.textContent?.includes(text)
        ? container.querySelector('label')
        : [...container.querySelectorAll('[role="label"], [aria-label]')].find((el) => matchesText(el, text)),
    getError: () =>
      container.querySelector('[role="alert"]') ??
      container.querySelector('[aria-live="polite"]') ??
      [...container.querySelectorAll('*')].find(
        (el) =>
          (el.className?.includes('error') || el.className?.includes('Error')) &&
          el.textContent !== null &&
          el.textContent !== '',
      ),
  };
};

// ─── Provider Components ─────────────────────────────────────────────────────

/**
 * Standard test providers wrapper component.
 * Wraps children in TamaguiProvider + YStack.
 * Useful when you need to pass a wrapper directly to `render()`.
 */
export const TestProviders = ({ children }: { children: ReactNode }) => (
  <TamaguiProvider
    config={tamaguiConfig}
    defaultTheme="light"
    disableInjectCSS>
    <YStack
      flex={1}
      backgroundColor="$background">
      {children}
    </YStack>
  </TamaguiProvider>
);

// ─── Render Functions ────────────────────────────────────────────────────────

/**
 * Render a React element wrapped with configurable providers.
 *
 * By default wraps with TamaguiProvider and QueryClientProvider.
 * Additional providers (theme, frappe, keycloak) can be enabled via options.
 *
 * Returns an enhanced render result with extra DOM query helpers for
 * React Native Web / Tamagui components (getInput, getButton, getSubmitButton, etc.).
 */
export const renderWithProviders = (
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
): EnhancedRenderResult => {
  const { tamagui = true, queryClient = true, ...rest } = options;
  // theme / frappe / keycloak are reserved for future providers; keep them out of RTL's render options.
  const renderOptions = { ...rest };
  delete renderOptions.theme;
  delete renderOptions.frappe;
  delete renderOptions.keycloak;

  const wrapper = ({ children }: { children: ReactNode }) => {
    let content = children;

    // QueryClient provider (innermost standard provider)
    if (queryClient !== false) {
      const client = queryClient instanceof QueryClient ? queryClient : createDefaultQueryClient();
      content = <QueryClientProvider client={client}>{content}</QueryClientProvider>;
    }

    // Tamagui provider (outermost standard provider)
    if (tamagui) {
      content = (
        <TamaguiProvider
          config={tamaguiConfig}
          defaultTheme="light"
          disableInjectCSS>
          <YStack
            flex={1}
            backgroundColor="$background">
            {content}
          </YStack>
        </TamaguiProvider>
      );
    }

    return createElement(Fragment, null, content);
  };

  const result = render(ui, {
    wrapper,
    ...renderOptions,
  });

  return enhanceRenderResult(result);
};

// ─── DOM Helpers ─────────────────────────────────────────────────────────────

/** Find text within a container element */
export const findTextInContainer = (container: HTMLElement, text: string): HTMLElement | null => {
  const elements = container.querySelectorAll('*');
  for (const element of elements) {
    if (element.textContent?.includes(text)) {
      return element as HTMLElement;
    }
  }
  return null;
};

const sleep = async (ms: number) => {
  // oxlint-disable-next-line promise/avoid-new -- wrapping setTimeout is the only way to make a Promise-based delay
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
};

/** Wait for an element to appear within a timeout */
export const waitForElement = async (getFn: () => HTMLElement | null, timeout = 3000): Promise<HTMLElement> => {
  const startTime = Date.now();
  const poll = async (): Promise<HTMLElement> => {
    if (Date.now() - startTime >= timeout) {
      throw new Error('Element not found within timeout');
    }
    const element = getFn();
    if (element) {
      return element;
    }
    await sleep(50);
    return await poll();
  };
  return await poll();
};

const showFirstFocusable = function showFirstFocusable(this: HTMLDialogElement) {
  this.setAttribute('open', '');
  const first = [...this.querySelectorAll<HTMLElement>('*')].find(
    (el) =>
      el.hasAttribute('tabindex') ||
      (el.matches('input, button, select, textarea, a[href]') && !(el as HTMLInputElement).disabled),
  );
  first?.focus();
};

/**
 * Give jsdom, which has no `<dialog>.show()`, the one Chromium and WebKit
 * ship: mark the dialog open and focus its first focusable descendant,
 * `tabindex="-1"` included. Firefox and the HTML spec take the first tab stop
 * instead, so a dialog whose first focusable is a frame opens on different
 * elements per browser. Returns the restore; call it in `afterEach`.
 */
export const modelFirstFocusableShow = (): (() => void) => {
  const proto = HTMLDialogElement.prototype as { show?: (this: HTMLDialogElement) => void };
  const original = Object.getOwnPropertyDescriptor(proto, 'show');
  proto.show = showFirstFocusable;
  return () => {
    if (original) {
      Object.defineProperty(proto, 'show', original);
    } else {
      delete proto.show;
    }
  };
};

// ─── Fixture Factories ───────────────────────────────────────────────────────

/**
 * Generate a test fixture for a Frappe doctype with auto-generated name
 * and sensible defaults. Override any field via the overrides parameter.
 *
 * @example
 * ```ts
 * interface Task {
 *   name: string;
 *   subject: string;
 *   status: "Open" | "Working" | "Completed";
 * }
 *
 * const task = createFixture<Task>("Task", { subject: "Test task", status: "Open" });
 * // Returns: { name: "Task-xxxx", subject: "Test task", status: "Open" }
 * ```
 */
export const createFixture = <T extends Record<string, unknown>>(doctype: string, overrides?: Partial<T>): T => {
  // oxlint-disable-next-line sonarjs/pseudo-random -- throwaway fixture names; uniqueness only, not security
  const suffix = Math.random().toString(36).slice(2, 6);
  const base = { name: `${doctype}-${suffix}` } as unknown as T;
  if (overrides) {
    return { ...base, ...overrides };
  }
  return base;
};

// ─── Re-exports ──────────────────────────────────────────────────────────────

export { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
export { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
