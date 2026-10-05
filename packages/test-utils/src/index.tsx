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
    const { createTamagui } = require('tamagui');
    return createTamagui({ ...configWithoutAnimations, animations: animationsCSS });
  } catch {
    return configWithoutAnimations;
  }
})();

function createDefaultQueryClient(): QueryClient {
  return new QueryClient({
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
}

function enhanceRenderResult(result: RenderResult): EnhancedRenderResult {
  const container = result.container;
  return {
    ...result,
    getInput: (name?: string) => {
      if (name) {
        return (
          container.querySelector(`input[name="${name}"]`) ||
          container.querySelector(`input[aria-label*="${name}"]`) ||
          container.querySelector('input[type="text"]') ||
          container.querySelector('input:not([type])')
        );
      }
      return (
        container.querySelector('input[type="text"]') ||
        container.querySelector('input:not([type])') ||
        container.querySelector('input')
      );
    },
    getAllInputs: () => Array.from(container.querySelectorAll('input[type="text"], input:not([type]), input')),
    getButton: (text: string) => {
      const buttons = Array.from(container.querySelectorAll('button'));
      for (const btn of buttons) {
        if (btn && typeof (btn as Element).getAttribute !== 'function' && Element.prototype.getAttribute) {
          (btn as Element).getAttribute = Element.prototype.getAttribute.bind(btn);
        }
      }
      const nativeButton = buttons.find(
        (btn) => btn.textContent?.includes(text) || btn.getAttribute('aria-label')?.includes(text),
      );
      if (nativeButton) {
        return nativeButton;
      }
      const roleButtons = Array.from(container.querySelectorAll('[role="button"]'));
      for (const btn of roleButtons) {
        if (btn && typeof btn.getAttribute !== 'function' && Element.prototype.getAttribute) {
          btn.getAttribute = Element.prototype.getAttribute.bind(btn);
        }
      }
      return roleButtons.find(
        (btn) => btn.textContent?.includes(text) || btn.getAttribute('aria-label')?.includes(text),
      );
    },
    getSubmitButton: () => {
      // Look for native submit button first
      const submitByType = container.querySelector('button[type="submit"]');
      if (submitByType) {
        return submitByType;
      }
      // Look for role="button" (styled View components) with "submit" text before native buttons,
      // because native button[type="button"] may be radio/switch items, not submit buttons
      const roleButtonByText = Array.from(container.querySelectorAll('[role="button"]')).find((btn) =>
        btn.textContent?.toLowerCase().includes('submit'),
      );
      if (roleButtonByText) {
        return roleButtonByText;
      }
      // Look for native button elements with "submit" text
      const submitByText = Array.from(container.querySelectorAll('button')).find((btn) =>
        btn.textContent?.toLowerCase().includes('submit'),
      );
      if (submitByText) {
        return submitByText;
      }
      // Fallback: button[type="button"] that isn't a widget with a semantic role
      const buttonByType = Array.from(container.querySelectorAll('button[type="button"]')).find(
        (btn) => !btn.getAttribute('role') || btn.getAttribute('role') === 'button',
      );
      if (buttonByType) {
        return buttonByType;
      }
      const anyButton = Array.from(container.querySelectorAll('button')).find(
        (btn) => !btn.getAttribute('role') || btn.getAttribute('role') === 'button',
      );
      if (anyButton) {
        return anyButton;
      }
      return container.querySelector('[role="button"]');
    },
    findTextElement: (text: string) => {
      try {
        const containerQueries = within(container);
        return containerQueries.queryByText(text, { exact: false }) || undefined;
      } catch {
        const allElements = Array.from(container.querySelectorAll('*'));
        return allElements.find((el) => el.textContent?.includes(text));
      }
    },
    getTextArea: (name?: string) => {
      if (name) {
        return (
          container.querySelector(`textarea[name="${name}"]`) ||
          container.querySelector(`textarea[aria-label*="${name}"]`) ||
          container.querySelector('textarea')
        );
      }
      return container.querySelector('textarea');
    },
    getCheckbox: (name?: string) => {
      if (name) {
        return (
          container.querySelector(`[role="checkbox"][aria-labelledby*="${name}"]`) ||
          container.querySelector(`input[type="checkbox"][name="${name}"]`)
        );
      }
      return container.querySelector('[role="checkbox"]') || container.querySelector('input[type="checkbox"]');
    },
    getRadio: (value?: string) => {
      if (value) {
        return (
          container.querySelector(`input[type="radio"][value="${value}"]`) ||
          container.querySelector(`[role="radio"][aria-label*="${value}"]`)
        );
      }
      return container.querySelector('input[type="radio"]') || container.querySelector('[role="radio"]');
    },
    getSelect: (name?: string) => {
      if (name) {
        return (
          container.querySelector(`select[name="${name}"]`) ||
          container.querySelector(`[role="combobox"][aria-label*="${name}"]`)
        );
      }
      return container.querySelector('select') || container.querySelector('[role="combobox"]');
    },
    getSlider: (name?: string) => {
      if (name) {
        return (
          container.querySelector(`[role="slider"][aria-label*="${name}"]`) ||
          container.querySelector(`input[type="range"][name="${name}"]`)
        );
      }
      return container.querySelector('[role="slider"]') || container.querySelector('input[type="range"]');
    },
    getSwitch: (name?: string) => {
      if (name) {
        return (
          container.querySelector(`[role="switch"][aria-label*="${name}"]`) ||
          container.querySelector(`input[type="checkbox"][name="${name}"]`)
        );
      }
      return container.querySelector('[role="switch"]') || container.querySelector('input[type="checkbox"]');
    },
    getLabel: (text: string) => {
      return container.querySelector('label')?.textContent?.includes(text)
        ? container.querySelector('label')
        : Array.from(container.querySelectorAll('[role="label"], [aria-label]')).find(
            (el) => el.textContent?.includes(text) || el.getAttribute('aria-label')?.includes(text),
          );
    },
    getError: () => {
      return (
        container.querySelector('[role="alert"]') ||
        container.querySelector('[aria-live="polite"]') ||
        Array.from(container.querySelectorAll('*')).find(
          (el) => (el.className?.includes('error') || el.className?.includes('Error')) && el.textContent,
        )
      );
    },
  };
}

// ─── Provider Components ─────────────────────────────────────────────────────

/**
 * Standard test providers wrapper component.
 * Wraps children in TamaguiProvider + YStack.
 * Useful when you need to pass a wrapper directly to `render()`.
 */
export function TestProviders({ children }: { children: ReactNode }) {
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light" disableInjectCSS>
      <YStack flex={1} backgroundColor="$background">
        {children}
      </YStack>
    </TamaguiProvider>
  );
}

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
export function renderWithProviders(ui: ReactElement, options: RenderWithProvidersOptions = {}): EnhancedRenderResult {
  const {
    tamagui = true,
    queryClient = true,
    theme: _theme = false,
    frappe: _frappe = false,
    keycloak: _keycloak = false,
    ...renderOptions
  } = options;

  function Wrapper({ children }: { children: ReactNode }) {
    let content = children;

    // QueryClient provider (innermost standard provider)
    if (queryClient) {
      const client = queryClient instanceof QueryClient ? queryClient : createDefaultQueryClient();
      content = <QueryClientProvider client={client}>{content}</QueryClientProvider>;
    }

    // Tamagui provider (outermost standard provider)
    if (tamagui) {
      content = (
        <TamaguiProvider config={tamaguiConfig} defaultTheme="light" disableInjectCSS>
          <YStack flex={1} backgroundColor="$background">
            {content}
          </YStack>
        </TamaguiProvider>
      );
    }

    return <>{content}</>;
  }

  const result = render(ui, {
    wrapper: Wrapper,
    ...renderOptions,
  });

  return enhanceRenderResult(result);
}

// ─── DOM Helpers ─────────────────────────────────────────────────────────────

/** Find text within a container element */
export function findTextInContainer(container: HTMLElement, text: string): HTMLElement | null {
  const elements = container.querySelectorAll('*');
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    if (element.textContent?.includes(text)) {
      return element as HTMLElement;
    }
  }
  return null;
}

/** Wait for an element to appear within a timeout */
export async function waitForElement(getFn: () => HTMLElement | null, timeout = 3000): Promise<HTMLElement> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const element = getFn();
    if (element) {
      return element;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Element not found within timeout');
}

/**
 * Give jsdom, which has no `<dialog>.show()`, the one Chromium and WebKit
 * ship: mark the dialog open and focus its first focusable descendant,
 * `tabindex="-1"` included. Firefox and the HTML spec take the first tab stop
 * instead, so a dialog whose first focusable is a frame opens on different
 * elements per browser. Returns the restore; call it in `afterEach`.
 */
export function modelFirstFocusableShow(): () => void {
  const proto = HTMLDialogElement.prototype as { show?: (this: HTMLDialogElement) => void };
  const original = Object.getOwnPropertyDescriptor(proto, 'show');
  proto.show = function show(this: HTMLDialogElement) {
    this.setAttribute('open', '');
    const first = Array.from(this.querySelectorAll<HTMLElement>('*')).find(
      (el) =>
        el.hasAttribute('tabindex') ||
        (el.matches('input, button, select, textarea, a[href]') && !(el as HTMLInputElement).disabled),
    );
    first?.focus();
  };
  return () => {
    if (original) {
      Object.defineProperty(proto, 'show', original);
    } else {
      delete proto.show;
    }
  };
}

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
export function createFixture<T extends Record<string, unknown>>(doctype: string, overrides?: Partial<T>): T {
  const suffix = Math.random().toString(36).substring(2, 6);
  const base = { name: `${doctype}-${suffix}` } as unknown as T;
  if (overrides) {
    return { ...base, ...overrides };
  }
  return base;
}

// ─── Re-exports ──────────────────────────────────────────────────────────────

export { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
export { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
