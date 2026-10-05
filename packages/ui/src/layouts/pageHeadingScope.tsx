/**
 * Page-heading scope — "exactly one h1 per page".
 *
 * A page shell (`Screen` here; the Desk scaffolding in a
 * consuming app) hosts one scope per page. Catalog
 * components that render a heading register their resolved semantic level;
 * when a second level-1 heading mounts under the same scope, the scope emits
 * the `multiple-h1` DEV warn from the shared devWarn catalog
 * (`@repo/theme`, no-op in production builds).
 *
 * Registration is voluntary: raw `<H1>` tags dropped in by consumers are not
 * detected — the guardrail covers the catalog path (PageHeader, frappe-ui
 * Heading) where the level is known.
 *
 * The same scope carries the page chrome inset (`insetToken`) so PageHeader
 * can bleed its hairline to the column edges without a second context.
 */

import { devWarn } from '@repo/theme';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useRef } from 'react';

/** Semantic heading levels used by catalog page components. */
export type PageHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

interface PageHeadingRegistry {
  /** Register a mounted level-1 heading; returns the unregister cleanup. */
  registerH1: (detail?: { component?: string; label?: string }) => () => void;
  /**
   * Horizontal padding the page shell applied. PageHeader bleeds its
   * hairline by this token so the rule is edge-to-edge of the column.
   */
  insetToken: string | null;
}

const PageHeadingScopeContext = createContext<PageHeadingRegistry | null>(null);

export interface PageHeadingScopeProps {
  children: ReactNode;
  /** Scope owner named in the DEV warn. Default: "Screen". */
  name?: string;
  /**
   * Horizontal padding the hosting page shell applied (`knobProps.panelPadding.padding`).
   * Omitted / null — PageHeader does not bleed (isolated / `noPadding` screens).
   */
  insetToken?: string | null;
}

/**
 * Hosts the h1 registry for one page. Renders no DOM — safe to wrap any
 * subtree. Nested scopes shadow the outer one (a nested full page shell owns
 * its own h1 budget).
 */
export function PageHeadingScope({ children, name = 'Screen', insetToken = null }: PageHeadingScopeProps) {
  const h1CountRef = useRef(0);
  const value = useMemo<PageHeadingRegistry>(
    () => ({
      insetToken: insetToken ?? null,
      registerH1: (detail) => {
        h1CountRef.current += 1;
        if (h1CountRef.current > 1) {
          devWarn('multiple-h1', {
            component: name,
            id: detail?.component,
            value: detail?.label,
            count: h1CountRef.current,
          });
        }
        return () => {
          h1CountRef.current -= 1;
        };
      },
    }),
    [name, insetToken],
  );
  return <PageHeadingScopeContext.Provider value={value}>{children}</PageHeadingScopeContext.Provider>;
}

/**
 * Horizontal inset the nearest page shell applied, or null when the header
 * is not inside a padded `Screen` (isolated stories, `noPadding`).
 */
export function usePageChromeInset(): string | null {
  return useContext(PageHeadingScopeContext)?.insetToken ?? null;
}

/**
 * Register a mounted catalog heading with the nearest PageHeadingScope.
 * Only level-1 headings count toward the `multiple-h1` guardrail; other
 * levels and unscoped mounts are no-ops.
 */
export function useRegisterPageHeading(args: {
  level: number;
  /** Component name reported in the warn (e.g. "PageHeader"). */
  component?: string;
  /** Heading text reported in the warn. */
  label?: string;
  /** Pass false when the heading is not actually rendered (skeleton, custom node). */
  enabled?: boolean;
}): void {
  const registry = useContext(PageHeadingScopeContext);
  const { level, component, label, enabled = true } = args;
  useEffect(() => {
    if (!enabled || level !== 1 || !registry) {
      return;
    }
    return registry.registerH1({ component, label });
  }, [enabled, level, registry, component, label]);
}
