// ── Structure ──────────────────────────────────────────────

/** Structural fill. Exactly two values: `filled` | `outlined`. Ghost is a Chip/Tag variant, not this knob. */
export const FillStyle = { Filled: 'filled', Outlined: 'outlined' } as const;
export type FillStyle = (typeof FillStyle)[keyof typeof FillStyle];
/** Adding a third FillStyle member fails this lock. */
type _FillStyleExactlyTwo = FillStyle extends 'filled' | 'outlined'
  ? 'filled' | 'outlined' extends FillStyle
    ? true
    : never
  : never;
const _fillStyleExactlyTwo: _FillStyleExactlyTwo = true;
void _fillStyleExactlyTwo;

export const BorderRadius = {
  None: 'none',
  Small: 'small',
  Medium: 'medium',
  Large: 'large',
  Full: 'full',
} as const;
export type BorderRadius = (typeof BorderRadius)[keyof typeof BorderRadius];

/**
 * Corner curvature continuity (Axiom 15 OPTICS). `smooth` renders
 * continuous-curvature (superellipse/squircle) corners where the platform
 * can (web: `corner-shape: squircle`, computed `superellipse(2)` on
 * Chromium 152; engines without the property drop the declaration — that
 * fallback is measured via `cssSupportsCornerShape`, not assumed); `round`
 * is today's circular-arc border-radius everywhere.
 * Two values, not a numeric dial: every shipped smoothing system converges
 * on one blessed curve (Apple ≈ Figma 0.6 ≈ superellipse K=2), and a free
 * number invites per-screen drift (Axiom 5). `none` is not needed —
 * `borderRadius: "none"` already covers square corners.
 */
export const CornerSmoothing = {
  Round: 'round',
  Smooth: 'smooth',
} as const;
export type CornerSmoothing = (typeof CornerSmoothing)[keyof typeof CornerSmoothing];

export const BorderWidth = {
  None: 'none',
  Small: 'small',
  Medium: 'medium',
  Large: 'large',
} as const;
export type BorderWidth = (typeof BorderWidth)[keyof typeof BorderWidth];

export const Elevation = {
  None: 'none',
  Small: 'small',
  Medium: 'medium',
  Large: 'large',
} as const;
export type Elevation = (typeof Elevation)[keyof typeof Elevation];

export const Space = {
  Small: 'small',
  Medium: 'medium',
  Large: 'large',
} as const;
export type Space = (typeof Space)[keyof typeof Space];

export const Size = {
  Small: 'small',
  Medium: 'medium',
  Large: 'large',
} as const;
export type Size = (typeof Size)[keyof typeof Size];

/** Global density mode — compact steps space down one level; size is independent. */
export const Density = {
  Comfortable: 'comfortable',
  Compact: 'compact',
} as const;
export type Density = (typeof Density)[keyof typeof Density];

// ── House decisions (design-guidelines.md) ─────────────────
// Behavioral knobs with recommended defaults — not hard constraints.

/** Field label placement relative to the control. Default: top. */
export const FieldLabelPlacement = {
  Top: 'top',
  Side: 'side',
  Floating: 'floating',
} as const;
export type FieldLabelPlacement = (typeof FieldLabelPlacement)[keyof typeof FieldLabelPlacement];

/**
 * How required/optional fields are marked.
 * `minority` marks whichever is less common in the form (compute from schema).
 */
export const RequiredMarking = {
  Asterisk: 'asterisk',
  Optional: 'optional',
  Minority: 'minority',
} as const;
export type RequiredMarking = (typeof RequiredMarking)[keyof typeof RequiredMarking];

/** Alternating table row backgrounds. Default: off. */
export const TableZebra = {
  On: 'on',
  Off: 'off',
} as const;
export type TableZebra = (typeof TableZebra)[keyof typeof TableZebra];

/** Bulk-action bar placement for multi-select tables. Default: top (sticky). */
export const BulkBarPlacement = {
  Top: 'top',
  Bottom: 'bottom',
} as const;
export type BulkBarPlacement = (typeof BulkBarPlacement)[keyof typeof BulkBarPlacement];

/**
 * Timestamp display style.
 * Recommended: absolute in data tables; relative in feeds. Default: absolute.
 */
export const TimestampStyle = {
  Absolute: 'absolute',
  Relative: 'relative',
} as const;
export type TimestampStyle = (typeof TimestampStyle)[keyof typeof TimestampStyle];

/**
 * Table select-all scope: header checkbox selects the current
 * page or all filtered/matching rows. Default: page.
 */
export const SelectAllScope = {
  Page: 'page',
  Filtered: 'filtered',
} as const;
export type SelectAllScope = (typeof SelectAllScope)[keyof typeof SelectAllScope];

/**
 * Disabled control treatment. Both
 * values render a VISIBLE treatment via the resolved `disabledState` recipe:
 * `keepLabel` (default, Fluent model) washes the control chrome while
 * label/value text stays ≥ AA; `dimWhole` (Material model) dims the whole
 * assembly, label included. Read-only is a different state and never dims.
 */
export const DisabledStyle = {
  DimWhole: 'dimWhole',
  KeepLabel: 'keepLabel',
} as const;
export type DisabledStyle = (typeof DisabledStyle)[keyof typeof DisabledStyle];

/** Autofocus first field on form mount. Default: off (a11y). */
export const FormAutofocus = {
  On: 'on',
  Off: 'off',
} as const;
export type FormAutofocus = (typeof FormAutofocus)[keyof typeof FormAutofocus];

// ── Emphasis ───────────────────────────────────────────────

export const TextAccent = {
  Low: 'low',
  Medium: 'medium',
  High: 'high',
} as const;
export type TextAccent = (typeof TextAccent)[keyof typeof TextAccent];

// ── Typography ─────────────────────────────────────────────

export const FontCategory = {
  SansSerif: 'sans-serif',
  Serif: 'serif',
  Mono: 'mono',
  Slab: 'slab',
  Rounded: 'rounded',
  Condensed: 'condensed',
  Cursive: 'cursive',
  Handwriting: 'handwriting',
  Pixel: 'pixel',
  Blackletter: 'blackletter',
  Geometric: 'geometric',
} as const;
export type FontCategory = (typeof FontCategory)[keyof typeof FontCategory];

export const HeadingFont = FontCategory;
export type HeadingFont = FontCategory;

export const BodyFont = FontCategory;
export type BodyFont = FontCategory;

export const FontWeight = {
  Regular: 'regular',
  Bold: 'bold',
} as const;
export type FontWeight = (typeof FontWeight)[keyof typeof FontWeight];

/**
 * Page-title type step (hero-H1 dial).
 *
 * `moderate` ($8 = 32px) is the product default: a page title is wayfinding,
 * not content, so it does not spend the display scale's emphasis budget
 * (Axiom 10) — and the 64px step is the direct amplifier of title
 * clipping. `display` ($10 = 64px) is the deliberate marketing/hero opt-in,
 * reached through the `hero` preset or an explicit knob override; it is never
 * the ambient default.
 *
 * Two values, not a token dial: a free size invites per-screen drift
 * (Axiom 5), and the semantic level stays `headingLevel`'s job either way.
 */
export const PageTitleScale = {
  Moderate: 'moderate',
  Display: 'display',
} as const;
export type PageTitleScale = (typeof PageTitleScale)[keyof typeof PageTitleScale];

// ── Animation ──────────────────────────────────────────────

import type { AnimationName } from './animations/index';

export type Animation = 'none' | AnimationName;

// ── Interaction state overrides ────────────────────────────
// Structural knobs that can vary per interaction state.

export interface StateKnobs {
  fillStyle?: FillStyle;
  borderRadius?: BorderRadius;
  borderWidth?: BorderWidth;
  elevation?: Elevation;
  space?: Space;
  textAccent?: TextAccent;
  headingFont?: HeadingFont;
  bodyFont?: BodyFont;
  fontWeight?: FontWeight;
}

export const interactionStates = ['hover', 'press', 'focus', 'focusVisible'] as const;
export type InteractionState = (typeof interactionStates)[number];

// ── Knobs interface ────────────────────────────────────────

export interface Knobs {
  fillStyle: FillStyle;
  /**
   * Per-role radius: leftover radius maps onto DEFAULT /
   * CIRCULAR-AT-FULL / BINARY / CONTAINER-CAP. No improvised radius prop
   * and no fifth class on this interface.
   */
  borderRadius: BorderRadius;
  /**
   * Corner curvature continuity (Axiom 15 OPTICS). Optional so existing
   * preset/knob constructions stay valid; resolveKnobs defaults to `round`.
   */
  cornerSmoothing?: CornerSmoothing;
  borderWidth: BorderWidth;
  elevation: Elevation;
  space: Space;
  size: Size;
  /** Propagating density mode. Default comfortable; compact steps space only. */
  density: Density;
  textAccent: TextAccent;
  headingFont: HeadingFont;
  bodyFont: BodyFont;
  fontWeight: FontWeight;
  /**
   * Page-title step. Optional so existing preset/knob constructions
   * stay valid; resolveKnobs defaults to `moderate`.
   */
  pageTitleScale?: PageTitleScale;
  animation: Animation;
  /** House: field label placement. Default top. */
  fieldLabelPlacement: FieldLabelPlacement;
  /** House: required/optional marking. Default minority. */
  requiredMarking: RequiredMarking;
  /** House: zebra table rows. Default off. */
  tableZebra: TableZebra;
  /** House: bulk bar placement. Default top. */
  bulkBarPlacement: BulkBarPlacement;
  /** House: table select-all scope. Default page. */
  selectAllScope: SelectAllScope;
  /** House: timestamp style. Default absolute. */
  timestampStyle: TimestampStyle;
  /** House: disabled treatment. Default keepLabel. */
  disabledStyle: DisabledStyle;
  /** House: form autofocus. Default off. */
  formAutofocus: FormAutofocus;
  hover: StateKnobs;
  press: StateKnobs;
  focus: StateKnobs;
  focusVisible: StateKnobs;
}

// ── Default knobs ──────────────────────────────────────────

export const emptyStateKnobs: StateKnobs = {};

export const defaultKnobs: Knobs = {
  fillStyle: 'filled',
  borderRadius: 'medium',
  cornerSmoothing: 'round',
  borderWidth: 'medium',
  elevation: 'small',
  space: 'medium',
  size: 'medium',
  density: 'comfortable',
  textAccent: 'high',
  headingFont: 'sans-serif',
  bodyFont: 'sans-serif',
  fontWeight: 'regular',
  pageTitleScale: 'moderate',
  animation: 'quick',
  fieldLabelPlacement: 'top',
  requiredMarking: 'minority',
  tableZebra: 'off',
  bulkBarPlacement: 'top',
  selectAllScope: 'page',
  timestampStyle: 'absolute',
  disabledStyle: 'keepLabel',
  formAutofocus: 'off',
  hover: emptyStateKnobs,
  press: emptyStateKnobs,
  focus: emptyStateKnobs,
  focusVisible: emptyStateKnobs,
};
