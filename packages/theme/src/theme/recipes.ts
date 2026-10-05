import type { ColorTokens, FontSizeTokens, TransitionProp } from 'tamagui';

import type { Knobs } from './knobs';
import type { HitSlopInsets } from './layoutTokens';

// ── State knob prop types (by concern) ───────────────────────────────────

export interface ControlStateProps {
  borderRadius?: string;
  borderWidth?: number;
  backgroundColor?: string;
  padding?: string;
  /** Focus-visible ring; always ≥2 via `ensureFocusVisibleRing`. */
  outlineWidth?: number;
  outlineStyle?: 'solid' | 'none';
  outlineColor?: string;
  outlineOffset?: number;
}

export interface TextStateProps {
  color?: string;
  fontFamily?: string;
  fontWeight?: string;
  fontSize?: string;
}

export interface ElevationPaintProps {
  shadowColor?: string;
  shadowOffset?: { width: number; height: number };
  shadowOpacity?: number;
  shadowRadius?: number;
  /** Web: raw boxShadow so paint does not depend on Tamagui's elevation variant. */
  style?: { boxShadow: string };
}

export interface ElevationStateProps extends ElevationPaintProps {
  /** Size token on web ("$1"); numeric tokens.size value on native (RN-safe). */
  elevation?: string | number;
  /** Dark-scheme surface tint (existing $color ramp). Light leaves this unset. */
  backgroundColor?: string;
}

/**
 * Complete elevation chrome to spread onto a raised frame (E-CONTROL wrappers,
 * InputParts Box). Shadows + Android dp. No fill — filled inputs read
 * `inputBackground`; overlays read `elevatedSurface.backgroundColor`.
 */
export interface ElevationChromeProps extends ElevationPaintProps {
  /** Android dp (2/4/8), not the Tamagui size token. */
  elevation?: number;
}

// ── Disabled state recipe (disabled stays visible) ───────────────────────

/** Text-bearing control chrome (Button, Chip, Input.Box): muted fill/border, no opacity. */
export interface DisabledSurfaceProps {
  backgroundColor?: string;
  borderColor?: string;
  cursor?: 'not-allowed';
}

/** Text-free control chrome (switch track, checkbox box, radio ring, stars): opacity dim. */
export interface DisabledChromeProps {
  opacity?: number;
  cursor?: 'not-allowed';
}

/** Label/value text and glyphs riding inside disabled surface chrome (stays ≥ AA). */
export interface DisabledTextProps {
  color?: string;
}

/** Whole field assembly (FieldLayout wrapper / standalone control frame). */
export interface DisabledAssemblyProps {
  opacity?: number;
}

/**
 * Resolved disabled treatment. A control
 * rendered disabled MUST be visually distinguishable from its enabled twin
 * under BOTH `disabledStyle` values. Fragments by anatomy — spread whole,
 * never cherry-pick, and only when `disabled` (read-only is a different
 * state and never dims):
 *
 * - `surfaceKnobProps` — chrome that CONTAINS text (Button, Chip, Input.Box):
 *   fill/border wash to the muted tier without opacity so the inner
 *   label/value text (via `textKnobProps`, `$color11`) keeps ≥ 4.5:1.
 * - `selectedSurfaceKnobProps` — a SELECTED segment inside disabled
 *   text-bearing chrome (ToggleGroup / segmented controls): one wash step
 *   stronger than `surfaceKnobProps` so which option is chosen stays
 *   visible while disabled (Axiom 6) — components drop their live active
 *   fill when disabled (the `active` variant beats the wash), so the
 *   recipe owns the selected tier under BOTH disabledStyle values.
 * - `chromeKnobProps` — chrome with no text of its own (switch track,
 *   checkbox box, radio ring, slider, rating stars): opacity dim.
 * - `assemblyKnobProps` — the whole assembly; populated only under
 *   `dimWhole` (FieldLayout wrapper; standalone controls spread it after
 *   their surface fragment since they are their own assembly).
 */
export interface DisabledRecipe {
  surfaceKnobProps: DisabledSurfaceProps;
  selectedSurfaceKnobProps: DisabledSurfaceProps;
  chromeKnobProps: DisabledChromeProps;
  textKnobProps: DisabledTextProps;
  assemblyKnobProps: DisabledAssemblyProps;
  /** Effective `disabledStyle` knob value ("keepLabel" | "dimWhole"). */
  style: string;
}

/**
 * A recipe groups state-specific knob props by concern (control, text, elevation).
 * Each value is the actual props object to assign to hoverStyle, pressStyle, etc.
 */
export interface KnobRecipe<T> {
  hoverKnobProps: T | undefined;
  pressKnobProps: T | undefined;
  focusKnobProps: T | undefined;
  focusVisibleKnobProps: T | undefined;
}

// ── KnobProps: resolved style objects from knobs ──────────────────────────

/**
 * Corner smoothing carrier (Axiom 15 OPTICS): radius-bearing fragments gain
 * `className: "mp-corner-smooth"` when `cornerSmoothing: "smooth"` (web
 * only) — the mounted stylesheet in `cornerSmoothing.ts` resolves it to
 * `corner-shape: squircle` (computed `superellipse(2)` on Chromium 152).
 * Engines without the property drop the declaration; native is absent.
 */
export interface CornerSmoothingCarrier {
  className?: string;
}

export interface KnobProps {
  borderRadius: {
    borderRadius: string;
    borderColor: string;
    borderWidth: number;
  } & CornerSmoothingCarrier;
  /**
   * The radius for chrome NESTED INSIDE a radius-bearing frame — a tab
   * indicator inside a tab bar, a code block inside a card, a toast's action
   * strip. It resolves one or more steps SMALLER than `borderRadius` at every
   * knob stop (medium: `$3` inside `$4`, full: `$5` inside `$12`), because a
   * child corner that matched its parent's would read as a second frame.
   *
   * This was `borderRadiusOuter`, which named the
   * opposite of what it resolves to — every one of its consumers uses it for
   * inner chrome, so the name told each of them the wrong story. Renamed;
   * `borderRadiusOuter` stays as a deprecated alias for one release.
   */
  borderRadiusNested: { borderRadius: string } & CornerSmoothingCarrier;
  /** @deprecated Use `borderRadiusNested`. Removed after one release. */
  borderRadiusOuter: { borderRadius: string } & CornerSmoothingCarrier;
  /**
   * A FILLED control's border. Same width as the outlined one, so switching
   * fill style never moves a layout by 2px, but `transparent` — which is what
   * Tamagui paints and what the fill style means: the surface is the
   * affordance, so a ring around it is a second one.
   *
   * Filled controls spread the `borderRadius` fragment, whose
   * `borderColor` is `$borderColor`, so with the default `borderWidth: medium`
   * every default Button carried a visible 1px ring that stock Tamagui does
   * not draw. The width still resolves through the `borderWidth` knob — set it
   * to `none` and both fragments go to 0.
   */
  controlBorderFilled: { borderColor: string; borderWidth: number };
  /** An OUTLINED control's border: the outline IS the affordance, so it is at least a hairline. */
  controlBorderOutlined: { borderColor: string; borderWidth: number };
  /**
   * Axiom 1 child-clip cap for padded containers (Card/Panel/DialogContent):
   * the radius token while it fits, or the padding px once it would exceed
   * the container's own inset. Spread after the radius-bearing fragment.
   */
  containerRadius: { borderRadius: string | number } & CornerSmoothingCarrier;
  /** Size token on web ("$1"); numeric tokens.size value on native (RN-safe). */
  elevation: string | number | undefined;
  /**
   * Overlay elevation token (dialogs, popovers, Panel). Distinct from
   * `elevation` so an overlay over a scrim is not the same $1 stop every
   * Button carries. Spread via `elevatedSurface`; do not reuse `elevation`.
   */
  overlayElevation: string | number | undefined;
  /**
   * Complete shadow fragment for E-CONTROL / wrapper Views. Spread whole.
   * Empty when `elevation=none`. Android `elevation` here is dp (2/4/8).
   */
  elevationChrome: ElevationChromeProps;
  /** Resolved scheme the fragments were built for. */
  scheme: 'light' | 'dark';
  surface: { backgroundColor: string; borderColor: string; borderWidth: number };
  /** Content tier (Bento content card): padded frame, no border, no shadow. Radius carries the container cap. */
  cardSurface: {
    backgroundColor: string;
    borderRadius: string | number;
    padding: string;
  } & CornerSmoothingCarrier;
  /** Elevated/overlay tier (popovers, dropdowns): border + elevation. */
  elevatedSurface: {
    backgroundColor: string;
    borderColor: string;
    borderWidth: number;
    borderRadius: string;
    elevation: string | number | undefined;
  } & ElevationPaintProps &
    CornerSmoothingCarrier;
  /** Feature/marketing tier (auth, hero cards): big radius + ultra-soft wide shadow. */
  featureSurface: {
    backgroundColor: string;
    borderRadius: string;
    padding: string;
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
  } & CornerSmoothingCarrier;
  inputSurface: { borderWidth: number };
  panelPadding: { padding: string };
  gap: { gap: string };
  gapLg: { gap: string };
  /**
   * Size-recipe KEY (string "$4"), not a height scalar. styled() variants
   * switch on this token; control internals read `control` / `controlType` /
   * `controlIcon`. Radius is not on the recipe.
   */
  sizeToken: string;
  /**
   * Control-chrome type (labels, calendar digits, weekday headers). Paired
   * to `size` so nested surfaces can step type with density. NEVER pass
   * `sizeToken` as `fontSize` — that token is a control HEIGHT ($4 = 44px
   * box), not a type step ($4 font = 14px).
   */
  label: { fontSize: FontSizeTokens; fontFamily: string; fontWeight: string };
  /**
   * Nested hit-target (calendar days, overlay chips): visual box BELOW the
   * 44px floor, press restored with `hitSlop`. Spread the
   * box onto the painted cell; pass `hitSlop` to the press handler.
   */
  nestedControl: {
    px: number;
    width: number;
    height: number;
    minWidth: number;
    maxWidth: number;
    minHeight: number;
    maxHeight: number;
    hitSlop: HitSlopInsets;
  };
  /** Coordinated control box (height / padX / inner gap). Spread whole. */
  control: { height: number; paddingHorizontal: number; gap: number };
  /** Coordinated control type. Spread whole. */
  controlType: { fontSize: number };
  /** Coordinated control icon box. Spread whole. */
  controlIcon: { width: number; height: number };
  heading: { fontFamily: string; fontWeight: string };
  /**
   * Page-title type step (hero-H1 dial) — the complete size fragment for
   * the single page-title heading, spread whole onto the title node. Product
   * screens land on the moderate step; the `hero` preset (or an explicit
   * `pageTitleScale` override) re-opens the display scale for marketing.
   */
  pageTitle: { size: FontSizeTokens };
  /** color is set only for solid semantic-intent Buttons (error/warning/success). */
  body: { fontFamily: string; fontWeight: string; color?: ColorTokens };
  textWeight: { fontWeight: string };
  transition: TransitionProp | undefined;
  outlined: boolean;
  pointy: boolean;
  textAccent: string;
  textAccentColor: string;
  inputBackground: string;
  space: string;
  size: string;
  /** Effective density mode after compact override resolution. */
  density: string;
  /** House decision knobs — pass-through for consumers (forms/tables). */
  fieldLabelPlacement: string;
  requiredMarking: string;
  tableZebra: string;
  bulkBarPlacement: string;
  selectAllScope: string;
  timestampStyle: string;
  disabledStyle: string;
  formAutofocus: string;
}

// ── Return type ───────────────────────────────────────────────────────────

export interface ResolvedKnobs {
  knobProps: KnobProps;
  control: KnobRecipe<ControlStateProps>;
  text: KnobRecipe<TextStateProps>;
  elevation: KnobRecipe<ElevationStateProps>;
  /** Resolved disabled treatment (named to avoid `disabled` prop clashes). */
  disabledState: DisabledRecipe;
}

export type KnobPropsOverride = (knobProps: KnobProps, knobs: Knobs) => Partial<KnobProps>;
