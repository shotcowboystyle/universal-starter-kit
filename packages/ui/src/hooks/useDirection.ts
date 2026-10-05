/**
 * useDirection — the catalog's runtime direction source (RTL audit backlog #1).
 *
 * CSS logical properties mirror layout for free, but directional *glyphs*
 * (prev/next carets, expand arrows) and JS-measured geometry need to know the
 * writing direction at runtime. This hook is that source.
 *
 * Web: reads the document-level `dir` attribute — `<body dir>` wins over
 * `<html dir>` (the nearer attribute governs content per bidi inheritance);
 * `"auto"` and empty values fall through. A MutationObserver keeps the value
 * live, so flipping `document.dir` at runtime (e.g. the RTL probe, a locale
 * switcher) re-renders consumers. SSR-safe via `useSyncExternalStore`: the
 * server snapshot is `"ltr"`, hydration renders with it (no mismatch), and
 * React re-checks the client snapshot immediately after.
 *
 * Native (`useDirection.native.ts`): `I18nManager.isRTL`, which is fixed for
 * the app session (RN requires a reload to change direction).
 */

import { useSyncExternalStore } from 'react';

export type Direction = 'ltr' | 'rtl';

function normalizeDir(value: string | null | undefined): Direction | undefined {
  if (value === 'rtl') {
    return 'rtl';
  }
  if (value === 'ltr') {
    return 'ltr';
  }
  // "" / "auto" / unknown → not an explicit direction; keep resolving.
  return undefined;
}

function readDocumentDirection(): Direction {
  if (typeof document === 'undefined') {
    return 'ltr';
  }
  return (
    normalizeDir(document.body?.getAttribute('dir')) ??
    normalizeDir(document.documentElement?.getAttribute('dir')) ??
    'ltr'
  );
}

function subscribe(onChange: () => void): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {};
  }
  const observer = new MutationObserver(onChange);
  // One observer catches <html dir>, <body dir>, and any nested island —
  // snapshot equality in useSyncExternalStore drops the irrelevant ones.
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['dir'],
    subtree: true,
  });
  return () => {
    observer.disconnect();
  };
}

const getServerSnapshot = (): Direction => 'ltr';

/**
 * Returns the current writing direction (`"ltr"` | `"rtl"`).
 *
 * Use it to mirror directional chrome that CSS logical properties cannot
 * reach — swap paired glyphs (CaretLeft ⇄ CaretRight) when the icon encodes
 * direction-of-travel. Do NOT mirror direction-neutral glyphs (search,
 * close, checkmarks).
 */
export function useDirection(): Direction {
  return useSyncExternalStore(subscribe, readDocumentDirection, getServerSnapshot);
}
