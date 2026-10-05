/**
 * OPTICS corner smoothing (Axiom 15) — native twin of `cornerSmoothing.ts`.
 *
 * React Native has no `corner-shape`; native resolves `cornerSmoothing` to
 * `round` until a SquircleView adoption lands (phase 2). Exports stay
 * shape-compatible so shared code and tests can import either file.
 */
import type { CornerSmoothing } from './knobs';

/** Class attached on web only — never emitted into native fragments. */
export const cornerSmoothClassName = 'mp-corner-smooth';

export const CORNER_SMOOTHING_STYLE_TAG_ID = 'mp-corner-smoothing-styles';
export const CORNER_SMOOTHING_ROOT_ATTR = 'data-mp-corner-smoothing';
export const CORNER_SHAPE_CSS_VAR = '--mp-corner-shape';
export const CORNER_SHAPE_ROUND = 'round';
export const CORNER_SHAPE_SMOOTH = 'squircle';
export const CORNER_SHAPE_ROUND_COMPUTED = 'superellipse(1)';
export const CORNER_SHAPE_SMOOTH_COMPUTED = 'superellipse(2)';

/** Web-only stylesheet — empty on native. */
export const cornerSmoothingCss = '';

/** Native has no CSS.supports corner-shape — measured no-op, not assumed. */
export function cssSupportsCornerShape(_supports?: { supports?(property: string, value: string): boolean }): boolean {
  return false;
}

export function readComputedCornerShape(
  _style?: Pick<CSSStyleDeclaration, 'getPropertyValue'> & { cornerShape?: string },
): string {
  return '';
}

export function isSmoothComputedCornerShape(_value: string): boolean {
  return false;
}

export function isRoundComputedCornerShape(_value: string): boolean {
  return true;
}

export function applyRootCornerSmoothing(_stop?: CornerSmoothing): void {}

/** Web-only stylesheet mount — no-op on native. */
export function ensureCornerSmoothingStyles(): void {}

/** Native no-op. Web mounts the squircle stylesheet from ThemeProvider. */
export function CornerSmoothingStyles(): null {
  return null;
}
