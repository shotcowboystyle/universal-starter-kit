/**
 * OPTICS corner smoothing (Axiom 15): `cornerSmoothing: "smooth"` upgrades
 * circular-arc corners to continuous curvature — CSS
 * `corner-shape: squircle` (≡ `superellipse(2)`, ≈ Apple's continuous
 * corners / Figma smoothing 0.6) — as a WEB PROGRESSIVE ENHANCEMENT.
 *
 * Delivery is a class + one mounted stylesheet (the hairline pattern):
 * Tamagui strips unknown keys from the `style` prop (`style` is in
 * skipProps and `cornerShape` is not a valid style key), but merges
 * `className` into its atomic classes — so `resolveKnobs` attaches
 * `className: cornerSmoothClassName` to every radius-bearing fragment when
 * the knob is `smooth`, and this module owns the CSS those classes resolve
 * against. `CornerSmoothingStyles` (mounted from ThemeProvider, same seat
 * as FontKnobStyles) re-asserts that stylesheet and publishes the live
 * stop on `<html>` so probes do not have to guess whether the channel ran.
 *
 * Measurement (2026-08-28):
 * - Chrome 152: specified `squircle` computes as `superellipse(2)`;
 *   specified `round` computes as `superellipse(1)`. Both
 *   `getPropertyValue("corner-shape")` and the `cornerShape` IDL agree.
 * - Chromium 147.0.7727.15: `CSS.supports("corner-shape","squircle")` is
 *   TRUE — the gallery's old "Chromium 139+ only" caption is wrong. The
 *   action-feedback Button strip still computed `round` at both stops
 *   because those replicas never carried `.mp-corner-smooth`. The
 *   knob-states sheet (which does) records `cornerShape: "squircle"` on
 *   the smooth cell. Read computed values with
 *   `readComputedCornerShape` and treat `superellipse(2)` as smooth.
 * - happy-dom and engines without the property: `cssSupportsCornerShape()`
 *   is false and computed `corner-shape` is empty — the silent fallback,
 *   measured rather than assumed. Native has no `corner-shape`.
 *
 * Re-measured 2026-09-01 across seven engines — the matrix and the probe that
 * produced it live in `docs/design/boards/W1-corner-smoothing/`:
 * - The property is live from at least Chromium 143, four minor versions
 *   below the 147 the INERT caption was shot on.
 * - The computed serialization is NOT stable: it echoes the specified keyword
 *   (`round` / `squircle`) through 151 and normalizes to `superellipse(1)` /
 *   `superellipse(2)` from 152. Classify with the two helpers below; never
 *   compare a raw string.
 * - The painted corner differs at both stops on every Chromium, read as
 *   geometry (`elementFromPoint` walking in from the corner), so the channel
 *   is proven to paint and not merely to parse.
 * - WebKit 26 and Firefox 148: `CSS.supports` false, computed `corner-shape`
 *   empty, `border-radius` and the box footprint untouched, and the corner
 *   byte-identical between the stops. Silent degradation on a real engine.
 *
 * Native twin: `cornerSmoothing.native.ts` (no CSS classes — native
 * resolves to `round` until a SquircleView adoption lands, phase 2).
 */
import { useEffect } from 'react';

import type { CornerSmoothing } from './knobs';
import { defaultKnobs } from './knobs';
import { usePresetContext } from './PresetContext';

/** Class attached to radius-bearing knob fragments at `cornerSmoothing: "smooth"`. */
export const cornerSmoothClassName = 'mp-corner-smooth';

export const CORNER_SMOOTHING_STYLE_TAG_ID = 'mp-corner-smoothing-styles';

/** Live knob stop, published on `<html>` by `CornerSmoothingStyles`. */
export const CORNER_SMOOTHING_ROOT_ATTR = 'data-mp-corner-smoothing';

/** Specified `corner-shape` for the live stop, also on `<html>`. */
export const CORNER_SHAPE_CSS_VAR = '--mp-corner-shape';

/** Specified CSS value for `round` (initial / house default). */
export const CORNER_SHAPE_ROUND = 'round';

/** Specified CSS value for `smooth` — the keyword the AC names. */
export const CORNER_SHAPE_SMOOTH = 'squircle';

/** Chrome 152+ computed form of `round`. */
export const CORNER_SHAPE_ROUND_COMPUTED = 'superellipse(1)';

/** Chrome 152+ computed form of `squircle`. */
export const CORNER_SHAPE_SMOOTH_COMPUTED = 'superellipse(2)';

/**
 * The squircle declaration. `corner-shape` composes with the element's
 * existing `border-radius` (it reshapes the same corner box), so the
 * fallback in non-supporting engines is automatic. Exported for unit tests.
 */
export const cornerSmoothingCss = `.${cornerSmoothClassName} { corner-shape: ${CORNER_SHAPE_SMOOTH}; }`;

/**
 * `CSS.supports("corner-shape","squircle")`. Pass `null` to probe a missing
 * engine. Omit the arg to use the global `CSS` (happy-dom's `supports()`
 * currently returns true — a lie; computed `corner-shape` stays empty).
 */
export function cssSupportsCornerShape(
  supports?: { supports?(property: string, value: string): boolean } | null,
): boolean {
  const impl = supports === null ? undefined : (supports ?? (typeof CSS !== 'undefined' ? CSS : undefined));
  try {
    return Boolean(impl?.supports?.('corner-shape', CORNER_SHAPE_SMOOTH));
  } catch {
    return false;
  }
}

/**
 * Read the painted `corner-shape`. Prefer the CSS property channel over the
 * camelCase IDL — some Chromium builds expose `css.cornerShape` as the
 * initial `round` even when `getPropertyValue("corner-shape")` has moved.
 */
export function readComputedCornerShape(
  style: Pick<CSSStyleDeclaration, 'getPropertyValue'> & { cornerShape?: string },
): string {
  const fromProp = (style.getPropertyValue?.('corner-shape') ?? '').trim();
  const fromIdl = (style.cornerShape ?? '').trim();
  return fromProp || fromIdl;
}

function normalizeCornerShape(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

/** True for specified `squircle` and the measured Chrome computed form `superellipse(2)`. */
export function isSmoothComputedCornerShape(value: string): boolean {
  const n = normalizeCornerShape(value);
  return n === CORNER_SHAPE_SMOOTH || n === CORNER_SHAPE_SMOOTH_COMPUTED;
}

/** True for specified `round`, computed `superellipse(1)`, empty (unsupported), or `normal`. */
export function isRoundComputedCornerShape(value: string): boolean {
  const n = normalizeCornerShape(value);
  return n === '' || n === CORNER_SHAPE_ROUND || n === CORNER_SHAPE_ROUND_COMPUTED || n === 'normal';
}

/** Publish the live stop on `<html>` so a probe can see the channel ran. */
export function applyRootCornerSmoothing(stop: CornerSmoothing = 'round'): void {
  if (typeof document === 'undefined') {
    return;
  }
  const root = document.documentElement;
  root.setAttribute(CORNER_SMOOTHING_ROOT_ATTR, stop);
  root.style.setProperty(CORNER_SHAPE_CSS_VAR, stop === 'smooth' ? CORNER_SHAPE_SMOOTH : CORNER_SHAPE_ROUND);
}

/** Idempotently mount the corner-smoothing stylesheet (no-op off-DOM). */
export function ensureCornerSmoothingStyles(): void {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.getElementById(CORNER_SMOOTHING_STYLE_TAG_ID)) {
    return;
  }
  const tag = document.createElement('style');
  tag.id = CORNER_SMOOTHING_STYLE_TAG_ID;
  tag.textContent = cornerSmoothingCss;
  document.head.appendChild(tag);
}

/**
 * Mount ONCE near the root (inside KnobBridge / PresetContext). Re-asserts
 * the squircle stylesheet and mirrors the live `cornerSmoothing` stop onto
 * `<html>`. Renders nothing.
 */
export function CornerSmoothingStyles(): null {
  const presetCtx = usePresetContext();
  const knobs = presetCtx ? { ...presetCtx.preset.knobs, ...presetCtx.overrides } : defaultKnobs;
  const stop = knobs.cornerSmoothing ?? defaultKnobs.cornerSmoothing ?? 'round';

  useEffect(() => {
    ensureCornerSmoothingStyles();
    applyRootCornerSmoothing(stop);
  }, [stop]);

  useEffect(
    () => () => {
      if (typeof document === 'undefined') {
        return;
      }
      document.documentElement.removeAttribute(CORNER_SMOOTHING_ROOT_ATTR);
      document.documentElement.style.removeProperty(CORNER_SHAPE_CSS_VAR);
    },
    [],
  );

  return null;
}

// Static CSS (no knob/theme dependency) — mount as soon as the module loads
// in a DOM environment so the class resolves before any smooth render.
ensureCornerSmoothingStyles();
