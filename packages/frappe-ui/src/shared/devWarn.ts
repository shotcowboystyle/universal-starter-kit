/**
 * Package-local DEV guardrails for frappe-ui, warned under a `[frappe-ui]`
 * prefix.
 *
 * The canonical catalog is `devWarn` in `@repo/theme`, whose
 * `DevWarnCode` union is closed over design-guardrail codes. Live-data
 * misconfiguration is a frappe-ui concern rather than a design-law one, so
 * it warns from here, the same way AsyncBoundary keeps its own.
 *
 * No-ops when `NODE_ENV === "production"`, and each key warns once per
 * process so a re-render never repeats a line.
 */

export type FrappeDevWarnCode = 'kpi-datasource-without-baseurl' | 'chart-datasource-without-baseurl';

export interface FrappeDevWarnDetail {
  component?: string;
  id?: string;
  doctype?: string;
  suggest?: string;
}

const seen = new Set<string>();

export function frappeDevWarn(code: FrappeDevWarnCode, detail: FrappeDevWarnDetail = {}): void {
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  const key = [code, detail.component ?? '', detail.id ?? '', detail.doctype ?? ''].join(':');
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  const bits = [
    detail.component ? `component=${detail.component}` : undefined,
    detail.id ? `id=${detail.id}` : undefined,
    detail.doctype ? `doctype=${detail.doctype}` : undefined,
    detail.suggest ? `suggest=${detail.suggest}` : undefined,
  ].filter(Boolean);
  console.warn(`[frappe-ui] ${code}${bits.length ? ` (${bits.join(', ')})` : ''}`);
}

/** @internal test helper */
export function __resetFrappeDevWarnSeen(): void {
  seen.clear();
}
