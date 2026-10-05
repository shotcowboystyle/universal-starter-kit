/**
 * GENERATED from the "Radius resolution" doctrine table
 * by scripts/radius-class-registry.mjs — DO NOT EDIT BY HAND.
 *
 * Regenerate: node scripts/radius-class-registry.mjs --emit
 * Verify:     node scripts/radius-class-registry.mjs --check
 *
 * The doctrine is the source; this module is the resolver's copy of it. Editing the
 * resolution here instead of in the doctrine is exactly the drift the generator exists
 * to prevent (the same contract as scripts/radius-identity-registry.mjs).
 */

export const RADIUS_RESOLUTION_STOPS = ['none', 'small', 'medium', 'large', 'full'] as const;

/** The `borderRadius` knob stops as the doctrine table spells them. */
export type RadiusResolutionStop = (typeof RADIUS_RESOLUTION_STOPS)[number];

/**
 * One doctrine table cell. `px` is a literal resolved radius; `half-height` is the
 * part's own painted height over two (a true circle/pill); `min-token-padding` and
 * `padding` are the CONTAINER-CAP spellings (Axiom 1 CLIP: never exceed own padding).
 */
export type RadiusResolutionCell =
  | { readonly kind: 'px'; readonly px: number }
  | { readonly kind: 'half-height' }
  | { readonly kind: 'min-token-padding'; readonly tokenPx: number }
  | { readonly kind: 'padding' };

export type RadiusResolutionRow = Readonly<Record<RadiusResolutionStop, RadiusResolutionCell>>;

/** Resolved radius per class per stop. */
export const RADIUS_RESOLUTION_TABLE = {
  DEFAULT: {
    none: { kind: 'px', px: 0 },
    small: { kind: 'px', px: 5 },
    medium: { kind: 'px', px: 9 },
    large: { kind: 'px', px: 16 },
    full: { kind: 'px', px: 50 },
  },
  'CIRCULAR-AT-FULL': {
    none: { kind: 'px', px: 0 },
    small: { kind: 'px', px: 5 },
    medium: { kind: 'px', px: 9 },
    large: { kind: 'px', px: 16 },
    full: { kind: 'half-height' },
  },
  BINARY: {
    none: { kind: 'px', px: 0 },
    small: { kind: 'half-height' },
    medium: { kind: 'half-height' },
    large: { kind: 'half-height' },
    full: { kind: 'half-height' },
  },
  'CONTAINER-CAP': {
    none: { kind: 'px', px: 0 },
    small: { kind: 'min-token-padding', tokenPx: 5 },
    medium: { kind: 'min-token-padding', tokenPx: 9 },
    large: { kind: 'min-token-padding', tokenPx: 16 },
    full: { kind: 'padding' },
  },
} as const satisfies Record<string, RadiusResolutionRow>;

/** A part is in exactly one class; DEFAULT unless the doctrine assigns otherwise. */
export type RadiusResolutionClass = keyof typeof RADIUS_RESOLUTION_TABLE;

export interface RadiusOverrideEntry {
  /** the component name as the doctrine's override table spells it */
  readonly component: string;
  readonly cells: RadiusResolutionRow;
  /** the recorded reason the class would destroy meaning (the override bar) */
  readonly why: string;
}

/**
 * Declared per-component overrides. A row here WINS over the part's
 * resolution class, and sweeps PASS these measurements instead of flagging them.
 */
export const RADIUS_OVERRIDE_TABLE: readonly RadiusOverrideEntry[] = [
  {
    component: 'Checkbox',
    cells: {
      none: { kind: 'px', px: 0 },
      small: { kind: 'px', px: 5 },
      medium: { kind: 'px', px: 5 },
      large: { kind: 'px', px: 5 },
      full: { kind: 'px', px: 5 },
    },
    why: 'CIRCULAR-AT-FULL kin by shape (20×20), but a circular checkbox reads as a radio — a semantic collision. Clamped at `$2` = 5, never h/2 (R2b DECIDED 2026-08-28: "NO. Checkbox never becomes full circle.")',
  },
  {
    component: 'Radio disc',
    cells: {
      none: { kind: 'half-height' },
      small: { kind: 'half-height' },
      medium: { kind: 'half-height' },
      large: { kind: 'half-height' },
      full: { kind: 'half-height' },
    },
    why: "R2b inverted: a square radio reads as a checkbox — the identical collision, mirrored. The disc's circle IS its meaning, so it stays round at every stop including `none` (R2c DECIDED 2026-08-28: always round — identity)",
  },
];

/**
 * The resolver's layering, as doctrine spells it: a declared knob-immunity
 * (R-PILL / R-IDENTITY) wins, then a declared override, then the class.
 */
export const RADIUS_RESOLUTION_COMPOSITION = ['immunity', 'override', 'class'] as const;

export interface OpenRadiusAdjudication {
  readonly id: string;
  readonly text: string;
}

/**
 * Adjudications still open: sweeps must EXCLUDE these parts
 * from cell assertions and REPORT the exclusion — never silently skip it.
 * An empty list is the closed state.
 */
export const OPEN_RADIUS_ADJUDICATIONS: readonly OpenRadiusAdjudication[] = [];
