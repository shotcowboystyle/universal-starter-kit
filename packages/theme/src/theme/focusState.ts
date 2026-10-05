import { contrastRatio, normalizeToHex, relativeLuminance } from './colorRules';
import type { ControlStateProps } from './recipes';

/**
 * Keyboard focus-visible ring.
 * Width ≥2px; color is the theme `$outlineColor` token (scheme-aware, ≥3:1
 * against adjacent surface in both light and dark).
 */
export const FOCUS_RING_MIN_WIDTH = 2;
export const FOCUS_RING_MIN_CONTRAST = 3;

/**
 * True when a CSS color carries alpha < 1 (rgba/hsla/#rrggbbaa). Such a ring
 * cannot guarantee the ≥3:1 floor — its effective contrast depends on the
 * backdrop it composites over (this is exactly how the stock Tamagui ring,
 * `rgba(ink, 0.2)`, dropped to 1.36:1). The guard reverts these to the solid
 * `$outlineColor` token.
 */
function ringColorCarriesAlpha(color: string): boolean {
  const s = color.trim().toLowerCase();
  const fn = s.match(/^(?:rgba|hsla)\([^)]*[,/]\s*([\d.]+%?)\s*\)$/);
  if (fn) {
    const raw = fn[1];
    const a = raw.endsWith('%') ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw);
    return Number.isFinite(a) && a < 0.999;
  }
  if (/^#[0-9a-f]{8}$/.test(s)) {
    return Number.parseInt(s.slice(7, 9), 16) / 255 < 0.999;
  }
  return false;
}

/**
 * VERIFY helper: does a *resolved* ring color clear
 * the ≥3:1 contrast floor against a given surface? Both args are CSS color
 * strings (hex/hsl/named). Returns false when either can't be parsed (e.g. an
 * alpha-blended color that can't be reduced to a single hue) so callers treat
 * unresolved rings as failing.
 */
export function focusRingColorMeetsContrast(ringColor: string, surfaceColor: string): boolean {
  const ring = normalizeToHex(ringColor);
  const surface = normalizeToHex(surfaceColor);
  if (!ring || !surface) {
    return false;
  }
  return contrastRatio(relativeLuminance(ring), relativeLuminance(surface)) >= FOCUS_RING_MIN_CONTRAST;
}

/**
 * ONE ring geometry: 2px solid `$outlineColor` at
 * offset **0** — the band hugs the border box and paints OUTSIDE it, on the
 * surface behind the control (reference §10; board F1 verify pass: offset 0,
 * not −2 and not +2). Offset 0 is what makes the ≥3:1 floor computable: the
 * ring contrasts against the page ground, not the control's own fill. The
 * old flat inset (−2) painted the band INSIDE solid intent fills and sank to
 * 1.17–1.31:1 (light accent 1.27, light error 1.17, dark error 1.31) where
 * the same ring on the page ground clears 5.78–6.50:1.
 *
 * The inset did not die — it moved to `FOCUS_VISIBLE_RING_INSET`, an
 * explicit per-call-site carve-out for clipping ancestors. It names
 * the same offset `FOCUS_RING_CLIPPED_OFFSET` so call sites do not type `-2`.
 *
 * A second, shape-scoped carve-out exists on the other side:
 * `FOCUS_VISIBLE_RING_HALO` (+2) for pill/circular thumbs and inline text
 * links. The F1 "not +2" reading was about the DEFAULT — a blanket +2 on
 * every control — and it stands. The halo is a named carve-out with a written
 * shape scope, exactly as the inset is; `SANCTIONED_FOCUS_RING_OFFSETS` below
 * is the closed set of all three.
 */
export const FOCUS_RING_CLIPPED_OFFSET = -2;
export const FOCUS_VISIBLE_RING = {
  outlineWidth: FOCUS_RING_MIN_WIDTH,
  outlineStyle: 'solid' as const,
  outlineColor: '$outlineColor',
  outlineOffset: 0,
} satisfies ControlStateProps;

/**
 * The clipping carve-out: the SAME ring, pulled fully inside the
 * border box (offset −2 + width 2 ⇒ the band spans [−2, 0] from the edge, so
 * no clipping ancestor can sever it). ONLY for items inside `overflow`
 * clipping — fused/segmented groups clipped at the group radius, edge-to-edge
 * menu rows under a clipped overlay, table cells.
 * Standalone controls take `FOCUS_VISIBLE_RING`; call sites opt into the
 * inset explicitly (this constant, or
 * `ensureFocusVisibleRing({ outlineOffset: -2 })`). Verification measures the
 * painted composition, never the declared offset alone — a ring box inset
 * from the boundary reports a compliant offset while painting inside it
 * (the F1 pseudoInset trap, mpo-fields-measured.md §7).
 */
export const FOCUS_VISIBLE_RING_INSET = {
  ...FOCUS_VISIBLE_RING,
  outlineOffset: FOCUS_RING_CLIPPED_OFFSET,
} satisfies ControlStateProps;

/**
 * The halo carve-out: the SAME ring,
 * pushed 2px clear of the border box, for the two shapes where a band hugging
 * the edge reads as part of the glyph instead of around it.
 *
 * Scope is by SHAPE, not by instance, and it is closed at two:
 *   - **pill / circular thumbs** — a round handle the user drags (Slider
 *     thumb, Rating star, TimeRangeScrubber handle). At offset 0 the band is
 *     concentric with the glyph's own edge and reads as a thicker glyph.
 *   - **inline text links** — a link inside a run of prose (markdown/mdx
 *     `Link`, ErrorSummary's summary link, a "View All" link). At offset 0
 *     the band crosses the line box and collides with ascenders/descenders of
 *     the surrounding text.
 *
 * NOT for standalone rectangles on the page ground — cards, tiles, rows,
 * fields. Those are the default `FOCUS_VISIBLE_RING` (offset 0), which is
 * what makes the Axiom 12 ≥3:1 floor computable against the page ground.
 *
 * Contrast is unaffected: like offset 0 the halo paints OUTSIDE the border
 * box, on the surface behind the control, so it measures against the same
 * page ground the default does — the retired 1.17–1.31:1 failures were
 * the INSET painting inside solid intent fills, a defect the halo cannot have.
 */
export const FOCUS_RING_HALO_OFFSET = 2;
export const FOCUS_VISIBLE_RING_HALO = {
  ...FOCUS_VISIBLE_RING,
  outlineOffset: FOCUS_RING_HALO_OFFSET,
} satisfies ControlStateProps;

/**
 * The CLOSED set of sanctioned focus-ring offsets. Three, and only
 * three: the default 0, the clipping inset −2, the shape halo +2. A call site
 * that wants any other number is a rule gap, not a preference — file it and
 * amend this set, do not type the number. `focusState.test.ts` asserts this set is
 * exactly what the repo paints, so a fourth offset fails a test instead of
 * shipping.
 */
export const SANCTIONED_FOCUS_RING_OFFSETS = [
  FOCUS_RING_CLIPPED_OFFSET,
  FOCUS_VISIBLE_RING.outlineOffset,
  FOCUS_RING_HALO_OFFSET,
] as const;

/** True when `offset` is one of the three sanctioned offsets. */
export function isSanctionedFocusRingOffset(offset: number): boolean {
  return (SANCTIONED_FOCUS_RING_OFFSETS as readonly number[]).includes(offset);
}

/**
 * Material-style state layers as theme tokens.
 * Ramp lives in `defaults/builderOptions` (hover/press background steps);
 * recipes overlay those tokens rather than inventing a second channel.
 */
export const STATE_LAYER_HOVER = {
  backgroundColor: '$backgroundHover',
} satisfies ControlStateProps;

export const STATE_LAYER_PRESS = {
  backgroundColor: '$backgroundPress',
} satisfies ControlStateProps;

/**
 * Merge + clamp so variants/knobs cannot remove the focus-visible ring.
 * Transparent / none / sub-2px outlines are restored to the baseline token.
 * Extra style keys (e.g. `borderColor`) are preserved for consumer merges.
 */
export function ensureFocusVisibleRing<T extends ControlStateProps>(
  override?: (T & ControlStateProps) | null,
): T & ControlStateProps {
  const merged = {
    ...FOCUS_VISIBLE_RING,
    ...override,
  } as T & ControlStateProps;
  const width = typeof merged.outlineWidth === 'number' ? merged.outlineWidth : FOCUS_RING_MIN_WIDTH;
  merged.outlineWidth = Math.max(width, FOCUS_RING_MIN_WIDTH);
  if (merged.outlineStyle !== 'solid') {
    merged.outlineStyle = 'solid';
  }
  if (
    !merged.outlineColor ||
    merged.outlineColor === 'transparent' ||
    merged.outlineColor === 'none' ||
    // Enforce COLOR, not just shape: an alpha-carrying ring can't guarantee
    // ≥3:1 (its contrast depends on the backdrop), so restore the solid token.
    (typeof merged.outlineColor === 'string' && ringColorCarriesAlpha(merged.outlineColor))
  ) {
    merged.outlineColor = FOCUS_VISIBLE_RING.outlineColor;
  }
  if (typeof merged.outlineOffset !== 'number') {
    merged.outlineOffset = FOCUS_VISIBLE_RING.outlineOffset;
  }
  return merged;
}

/** Apply default hover/press state-layer fill when knobs left background unset. */
export function withDefaultStateLayer(control: ControlStateProps, layer: ControlStateProps): ControlStateProps {
  if (control.backgroundColor !== undefined) {
    return control;
  }
  return { ...layer, ...control };
}
