/**
 * OPTICS corner smoothing (Axiom 15) — native twin of `corner-smoothing.ts`.
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
export const cssSupportsCornerShape = (_supports?: {
  supports?: (property: string, value: string) => boolean;
}): boolean => false;

export const readComputedCornerShape = (
  _style?: Pick<CSSStyleDeclaration, 'getPropertyValue'> & { cornerShape?: string },
): string => '';

export const isSmoothComputedCornerShape = (_value: string): boolean => false;

export const isRoundComputedCornerShape = (_value: string): boolean => true;

export const applyRootCornerSmoothing = (_stop?: CornerSmoothing): void => {
  // no-op on native: no root attribute to set
};

/** Web-only stylesheet mount — no-op on native. */
export const ensureCornerSmoothingStyles = (): void => {
  // no-op on native: no stylesheet to mount
};

/** Native no-op. Web mounts the squircle stylesheet from ThemeProvider. */
// oxlint-disable-next-line sonarjs/function-name -- exported component name, mirrors the PascalCase export of corner-smoothing.ts
export const CornerSmoothingStyles = (): null => null;
