import { isTouchable, isWeb, isWebTouchable } from '@repo/platform';
import type { FontSizeTokens, TransitionProp } from 'tamagui';

// Importing the class constant also mounts the corner-shape stylesheet at
// theme load (web only, idempotent) — see cornerSmoothing.ts.
import { cornerSmoothClassName } from './cornerSmoothing';
import { ensureFocusVisibleRing, STATE_LAYER_HOVER, STATE_LAYER_PRESS, withDefaultStateLayer } from './focusState';
import type { CornerSmoothing, Elevation, Knobs, PageTitleScale, StateKnobs } from './knobs';
import { pressTargetHitSlop } from './layoutTokens';
import type {
  ControlStateProps,
  DisabledRecipe,
  ElevationChromeProps,
  ElevationPaintProps,
  ElevationStateProps,
  KnobProps,
  KnobPropsOverride,
  KnobRecipe,
  ResolvedKnobs,
  TextStateProps,
} from './recipes';
import { sizeRecipeForToken } from './sizeRecipes';

// ── Density (compact) stepping ────────────────────────────────

/**
 * @deprecated Size is no longer coupled to density. Compact density
 * steps space only. Kept exported because figmaTokens historically imported it.
 */
export const compactSizeMap: Record<Knobs['size'], Knobs['size']> = {
  small: 'small',
  medium: 'small',
  large: 'medium',
};

/** Step space down one level for compact density. */
export const compactSpaceMap: Record<Knobs['space'], Knobs['space']> = {
  small: 'small',
  medium: 'small',
  large: 'medium',
};

/**
 * Apply density mode to knobs before token resolution.
 *
 * - `density: "compact"` steps **space only** (`compactSpaceMap`). Size is an
 *   independent axis — compact must not shrink controls.
 * - `compactOverride` wins over the density knob when provided:
 *   `true` forces compact space stepping; `false` forces comfortable (no step).
 */
export function applyDensity(knobs: Knobs, compactOverride?: boolean): Knobs {
  const useCompact = compactOverride !== undefined ? compactOverride : knobs.density === 'compact';
  if (!useCompact) {
    return knobs.density === 'comfortable' ? knobs : { ...knobs, density: 'comfortable' };
  }
  return {
    ...knobs,
    density: 'compact',
    space: compactSpaceMap[knobs.space],
  };
}

// ── Knob-to-token mapping tables ──────────────────────────────

export const borderRadiusMap = {
  none: '$0',
  small: '$2',
  medium: '$4',
  large: '$6',
  full: '$12',
} as const;

// Radius for chrome nested INSIDE a radius-bearing frame. Smaller than
// `borderRadiusMap` at every stop that has room to be — a child corner equal
// to its parent's reads as a second frame rather than as part of one.
// Was `outerRadiusMap`, feeding a fragment called
// `borderRadiusOuter` that every consumer used for inner chrome.
const nestedRadiusMap = {
  none: '$0',
  small: '$2',
  medium: '$3',
  large: '$4',
  full: '$5',
} as const;

const borderWidthMap = {
  none: 0,
  small: 0.5,
  medium: 1,
  large: 2,
} as const;

// ── Corner smoothing (Axiom 15 OPTICS) ────────────────────────
// `smooth` upgrades circular-arc corners to continuous curvature —
// `corner-shape: squircle` (≡ superellipse(2), ≈ Apple / Figma 0.6) — as a
// web progressive enhancement: Chromium paints it (measured from 143; WebKit
// 26 and Firefox 148 drop the unknown declaration and keep the plain
// border-radius arc — docs/design/boards/W1-corner-smoothing/).
// Delivery is a class + mounted stylesheet (cornerSmoothing.ts) because
// Tamagui strips unknown keys from the `style` prop (skipProps) but merges
// `className`. Native resolves to `round` for now (SquircleView adoption is
// phase 2); GTK has no corner-shape equivalent and stays on the plain arc.
const cornerSmoothingStyle: Record<CornerSmoothing, { className: string } | undefined> = isWeb
  ? { round: undefined, smooth: { className: cornerSmoothClassName } }
  : { round: undefined, smooth: undefined };

const panelPaddingMap = {
  small: '$3',
  medium: '$4',
  large: '$6',
} as const;

// Feature tier: the Bento recipe's $10
// radius and $6 inset at the default stops, one token per stop either side.
// Uncapped by padding: the tightest pair (full 50 over small 24) still keeps
// a child corner at the inset inside the arc (padding >= radius x 0.29).
const featureRadiusMap = {
  none: '$0',
  small: '$9',
  medium: '$10',
  large: '$11',
  full: '$12',
} as const;

const featurePaddingMap = {
  small: '$5',
  medium: '$6',
  large: '$7',
} as const;

// ── Page-title step (hero-H1 dial) ───────────────────────
// The one canonical definition of how big a page title is. On the heading
// scale (1.4x Inter, defaults/fonts.ts) $8 = 32px and $10 = 64px, so
// `moderate` lands in the page-title class while `display` keeps the
// marketing hero step. Screens never pick a heading step by hand — they
// spread `knobProps.pageTitle`, so one knob flip re-scales every title.
const pageTitleSizeMap: Record<PageTitleScale, FontSizeTokens> = {
  moderate: '$8',
  display: '$10',
};

/**
 * Resolve a page-title scale to its complete size fragment.
 *
 * Exported so a per-instance eject (`PageHeader titleScale="display"` on a
 * marketing hero) resolves through the same table as the knob — never a
 * second hardcoded step.
 */
export function resolvePageTitleScale(scale: PageTitleScale): { size: FontSizeTokens } {
  return { size: pageTitleSizeMap[scale] };
}

// ── Container radius cap (Axiom 1 CLIP) ──────────────────────
// A padded container's effective radius must not exceed its own padding:
// past that, the corner curve sweeps through the cell where children sit
// (radius > padding clips child corners). Px values mirror the
// @tamagui/themes tokens the maps above resolve to (radius $0/$2/$4/$6/$12
// = 0/5/9/16/50; space $3/$4/$6 = 13/18/32) — resolveKnobs stays a pure
// module, so the comparison happens on mirrored numbers, not live tokens.
// The cap only bites at `full` (every space) and `large` under
// `space=small`; default knobs are unchanged.

const radiusPxMap: Record<Knobs['borderRadius'], number> = {
  none: 0,
  small: 5,
  medium: 9,
  large: 16,
  full: 50,
};

const panelPaddingPxMap: Record<Knobs['space'], number> = {
  small: 13,
  medium: 18,
  large: 32,
};

/**
 * Cap a container's radius at its own padding (Axiom 1 CLIP: "my children's
 * pixel clips first → cap at padding"). Returns the radius token untouched
 * while it fits, or the padding px number once the token would exceed it.
 */
export function capContainerRadius(borderRadius: Knobs['borderRadius'], space: Knobs['space']): string | number {
  const radiusPx = radiusPxMap[borderRadius];
  const paddingPx = panelPaddingPxMap[space];
  return radiusPx > paddingPx ? paddingPx : borderRadiusMap[borderRadius];
}

/**
 * The borderRadius knob stop a `borderRadiusMap` token came from, so a part
 * can resolve its DG-RAD class at that stop. Undefined for any value the
 * knob did not produce.
 */
export function radiusStopFromToken(token: unknown): Knobs['borderRadius'] | undefined {
  return (Object.keys(borderRadiusMap) as Knobs['borderRadius'][]).find((stop) => borderRadiusMap[stop] === token);
}

/**
 * Containers the constraint audit measures against the cap.
 * `StackedRow` is one row of a vertical stack: it also carries
 * `data-stack-position`, and only its outer corners take the cap.
 * `OwnInset` pads with a fixed token instead of panelPadding, so the audit
 * caps it at its measured padding and ignores the space stop.
 */
export type CappedContainer = 'PageSection' | 'TextArea' | 'StackedRow' | 'OwnInset';

export interface ContainerCapDeclaration {
  'data-constraint-container': CappedContainer;
  'data-radius-knob': Knobs['borderRadius'];
  'data-space-knob': Knobs['space'];
}

/**
 * Declare a container that spreads `containerRadius`, with the knob stops it
 * resolved, so the constraint audit checks its painted corners against
 * `capContainerRadius` for those stops. The cap is a padding px value, not a
 * radius token, so an undeclared capped container reads off-scale at `full`.
 * Returns nothing when `radiusToken` is not a `borderRadiusMap` token or
 * `space` is not a space stop: a part whose radius did not come from the knob
 * makes no claim.
 *
 * @example
 * <YStack {...knobProps.containerRadius} {...containerCapProps("PageSection", knobProps.borderRadius.borderRadius, knobProps.space)} />
 */
export function containerCapProps(
  container: CappedContainer,
  radiusToken: unknown,
  space: string,
): ContainerCapDeclaration | undefined {
  const radiusKnob = radiusStopFromToken(radiusToken);
  if (!radiusKnob || !Object.hasOwn(panelPaddingPxMap, space)) {
    return undefined;
  }
  return {
    'data-constraint-container': container,
    'data-radius-knob': radiusKnob,
    'data-space-knob': space as Knobs['space'],
  };
}

const gapMap = {
  small: '$2',
  medium: '$4',
  large: '$5',
} as const;

// gapLg stays one step above gapMap.
const gapLgMap = {
  small: '$3',
  medium: '$5',
  large: '$6',
} as const;

const sizeTokenMap = {
  small: '$3',
  medium: '$4',
  large: '$5',
} as const;

/** Control-chrome type — one step below the matching sizeToken height. */
const labelFontSizeMap = {
  small: '$2',
  medium: '$3',
  large: '$4',
} as const;

/**
 * Painted size for nested hit-targets (calendar days). Always below the
 * 44px floor; press is restored with hitSlop. Steps with `size` (compact
 * density steps space only, so nested chrome follows the size axis).
 */
const nestedControlPxMap = {
  small: 28,
  medium: 32,
  large: 36,
} as const;

const headingFontMap = {
  'sans-serif': '$heading',
  serif: '$serif',
  mono: '$mono',
  slab: '$slab',
  rounded: '$rounded',
  condensed: '$condensed',
  cursive: '$cursive',
  handwriting: '$handwriting',
  pixel: '$pixel',
  blackletter: '$blackletter',
  geometric: '$geometric',
} as const;

const bodyFontMap = {
  'sans-serif': '$body',
  serif: '$serif',
  mono: '$mono',
  slab: '$slab',
  rounded: '$rounded',
  condensed: '$condensed',
  cursive: '$cursive',
  handwriting: '$handwriting',
  pixel: '$pixel',
  blackletter: '$blackletter',
  geometric: '$geometric',
} as const;

const fontWeightMap = {
  regular: '400',
  bold: '700',
} as const;

// Web keeps Tamagui size-token strings — Tamagui resolves them to boxShadow.
// Native must emit NUMBERS: knobProps.elevation gets spread onto plain RN
// Views by non-Tamagui consumers, and Android's RCTView `elevation` prop is a
// Double — a token string kills the ReactHost with "java.lang.String cannot
// be cast to java.lang.Double". The numbers are the exact
// tokens.size values Tamagui resolves those tokens to ($1=20, $2=28, $4=44),
// so Tamagui consumers render identical shadows either way.
//
// Controls are flat at the default `small` stop (the reference
// measures no resting shadow on a button or a card), so `small` paints
// nothing on the control map and only medium / large lift a control.
// Overlay elevation is a DISTINCT ladder one step above the control map, so
// a dialog over a scrim and a Button on the page never read as the same
// distance off the surface. elevatedSurface binds
// the overlay token — not the control one.
export const elevationMap: Record<string, string | number | undefined> = isWeb
  ? { none: undefined, small: undefined, medium: '$2', large: '$4' }
  : { none: undefined, small: undefined, medium: 28, large: 44 };

export const overlayElevationMap: Record<string, string | number | undefined> = isWeb
  ? { none: undefined, small: '$2', medium: '$3', large: '$5' }
  : { none: undefined, small: 28, medium: 36, large: 52 };

/** Scheme the resolver was invoked with. Defaults light so unit tests stay stable. */
export type ColorScheme = 'light' | 'dark';

// Existing 12-step ramp (colorRules groups). Do not invent overlay tokens:
// dark elevation is a lighter $color step. Overlay/card rest on $color1;
// filled inputs rest on $color2 and step from there.
const elevationTintOverlay: Record<Elevation, string> = {
  none: '$color1',
  small: '$color2',
  medium: '$color3',
  large: '$color4',
};

const elevationTintInput: Record<Elevation, string> = {
  none: '$color2',
  small: '$color3',
  medium: '$color4',
  large: '$color5',
};

type ElevationKey = '$1' | '$2' | '$3' | '$4' | '$5';

// Axiom 14 light source: y-offset:blur = 0.5. Metrics match the maps
// InputParts / getElevationWrapperProps already shipped. `$3` and `$5` are
// the overlay-only stops: the reference §8 popper and dialog
// shadows. Native paints one shadow, so it takes the first web layer.
const elevationShadowMetrics: Record<ElevationKey, { offsetY: number; radius: number; android: number }> = {
  $1: { offsetY: 1, radius: 2, android: 2 },
  $2: { offsetY: 3, radius: 6, android: 4 },
  $3: { offsetY: 4, radius: 8, android: 6 },
  $4: { offsetY: 10, radius: 20, android: 8 },
  $5: { offsetY: 12, radius: 24, android: 12 },
};

const elevationKeyAlias: Record<string, ElevationKey> = {
  $1: '$1',
  $2: '$2',
  $3: '$3',
  $4: '$4',
  $5: '$5',
  '20': '$1',
  '28': '$2',
  '36': '$3',
  '44': '$4',
  '52': '$5',
};

const webShadowLight: Record<ElevationKey, string> = {
  $1: '0 1px 2px rgba(0,0,0,0.12), 0 0 1px rgba(0,0,0,0.08)',
  $2: '0 3px 6px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.10)',
  $3: '0 4px 8px rgba(0,0,0,0.10), 0 12px 32px rgba(0,0,0,0.08)',
  $4: '0 10px 20px rgba(0,0,0,0.15), 0 3px 6px rgba(0,0,0,0.10)',
  $5: '0 12px 24px rgba(0,0,0,0.12)',
};

// Dark keeps each stop's geometry and inverts the hue.
const webShadowDark: Record<ElevationKey, string> = {
  $1: '0 1px 2px rgba(255,255,255,0.08), 0 0 1px rgba(255,255,255,0.06)',
  $2: '0 3px 6px rgba(255,255,255,0.10), 0 2px 4px rgba(255,255,255,0.06)',
  $3: '0 4px 8px rgba(255,255,255,0.10), 0 12px 32px rgba(255,255,255,0.08)',
  $4: '0 10px 20px rgba(255,255,255,0.12), 0 3px 6px rgba(255,255,255,0.08)',
  $5: '0 12px 24px rgba(255,255,255,0.12)',
};

const shadowOpacityLight: Record<ElevationKey, number> = {
  $1: 0.12,
  $2: 0.15,
  $3: 0.1,
  $4: 0.15,
  $5: 0.12,
};

const shadowOpacityDark: Record<ElevationKey, number> = {
  $1: 0.08,
  $2: 0.1,
  $3: 0.1,
  $4: 0.12,
  $5: 0.12,
};

function elevationTokenKey(token: string | number | undefined): ElevationKey | undefined {
  if (token == null) {
    return undefined;
  }
  return elevationKeyAlias[String(token)];
}

function elevationPaint(token: string | number | undefined, scheme: ColorScheme): ElevationPaintProps {
  const key = elevationTokenKey(token);
  if (!key) {
    return {};
  }
  const metrics = elevationShadowMetrics[key];
  const dark = scheme === 'dark';
  const paint: ElevationPaintProps = {
    shadowColor: dark ? '$color12' : '#000',
    shadowOffset: { width: 0, height: metrics.offsetY },
    shadowOpacity: dark ? shadowOpacityDark[key] : shadowOpacityLight[key],
    shadowRadius: metrics.radius,
  };
  if (isWeb) {
    paint.style = { boxShadow: dark ? webShadowDark[key] : webShadowLight[key] };
  }
  return paint;
}

function elevationChromeFor(token: string | number | undefined, scheme: ColorScheme): ElevationChromeProps {
  const key = elevationTokenKey(token);
  if (!key) {
    return {};
  }
  return {
    ...elevationPaint(token, scheme),
    elevation: elevationShadowMetrics[key].android,
  };
}

// Legibility floor: body/label text must never land below ~4.5:1 against its
// surface. $color11 is the lowest ramp step that clears AA on color1/2
// surfaces, so "low" clamps there ($color9 measured 1.29-3.43:1 — SB-R-01).
const textAccentColorMap: Record<string, string> = {
  low: '$color11',
  medium: '$color11',
  high: '$color',
};

// ── Disabled treatment (disabled stays visible) ───────────────
// A disabled control must be visually distinguishable from its enabled twin
// under BOTH `disabledStyle` values (Axiom 6 HONEST STATE; the dial is
// Fluent keepLabel / Material dimWhole). Tiers are theme-relative
// ramp steps so intent sub-themes desaturate within their own hue instead
// of fighting it:
// - keepLabel (default): the control CHROME washes out while label/value
//   text keeps ≥ AA. Text-bearing chrome swaps fill/border to the muted
//   tiers ($color3 wash — the native `input:disabled` idiom — bordered by
//   $color6) with NO opacity so inner text, re-anchored to $color11 (the
//   documented lowest AA step, see textAccentColorMap above), stays ≥4.5:1.
//   Text-free chrome (track/box/ring/star) opacity-dims at 0.5 — the value
//   the catalog's hand-rolled treatments already shipped.
// - dimWhole: the whole ASSEMBLY (label included) dims at 0.5; control
//   fragments then carry only the not-allowed affordance so the dim is
//   applied once, by the assembly owner.

const DISABLED_CHROME_OPACITY = 0.5;
const DISABLED_ASSEMBLY_OPACITY = 0.5;

const disabledCursor = { cursor: 'not-allowed' as const };

// Selected-while-disabled tier: one ramp step stronger than the plain wash
// ($color3/$color6) so a chosen segment stays visibly chosen (Axiom 6 —
// owner-ratified recipe-level "selected wash"). Carried under BOTH
// disabledStyle values: consumers drop their live active fill when disabled
// (the `active` variant beats the wash), so without this tier a dimWhole
// assembly dim alone could not distinguish selection either.
const disabledSelectedSurface = {
  backgroundColor: '$color5',
  borderColor: '$color8',
  ...disabledCursor,
};

function resolveDisabled(disabledStyle: Knobs['disabledStyle']): DisabledRecipe {
  if (disabledStyle === 'dimWhole') {
    return {
      surfaceKnobProps: { ...disabledCursor },
      selectedSurfaceKnobProps: { ...disabledSelectedSurface },
      chromeKnobProps: { ...disabledCursor },
      textKnobProps: {},
      assemblyKnobProps: { opacity: DISABLED_ASSEMBLY_OPACITY },
      style: disabledStyle,
    };
  }
  return {
    surfaceKnobProps: {
      backgroundColor: '$color3',
      borderColor: '$color6',
      ...disabledCursor,
    },
    selectedSurfaceKnobProps: { ...disabledSelectedSurface },
    chromeKnobProps: { opacity: DISABLED_CHROME_OPACITY, ...disabledCursor },
    textKnobProps: { color: '$color11' },
    assemblyKnobProps: {},
    style: disabledStyle,
  };
}

// ── State style resolver ──────────────────────────────────────

function resolveStateKnobs(
  state: StateKnobs,
  scheme: ColorScheme,
): {
  control: ControlStateProps;
  text: TextStateProps;
  elevation: ElevationStateProps;
} {
  const control: ControlStateProps = {};
  const text: TextStateProps = {};
  const elevation: ElevationStateProps = {};

  if (state.fillStyle !== undefined) {
    control.backgroundColor = state.fillStyle === 'outlined' ? 'transparent' : '$backgroundPress';
  }
  if (state.borderWidth !== undefined) {
    control.borderWidth = borderWidthMap[state.borderWidth];
  }
  if (state.borderRadius !== undefined) {
    control.borderRadius = borderRadiusMap[state.borderRadius];
  }
  if (state.space !== undefined) {
    control.padding = gapMap[state.space];
  }
  if (state.elevation !== undefined) {
    const token = elevationMap[state.elevation];
    elevation.elevation = token;
    Object.assign(elevation, elevationPaint(token, scheme));
    if (scheme === 'dark' && state.elevation !== 'none') {
      elevation.backgroundColor = elevationTintOverlay[state.elevation];
    }
  }
  if (state.textAccent !== undefined) {
    text.color = textAccentColorMap[state.textAccent];
  }
  if (state.bodyFont !== undefined) {
    text.fontFamily = bodyFontMap[state.bodyFont];
  } else if (state.headingFont !== undefined) {
    text.fontFamily = headingFontMap[state.headingFont];
  }
  if (state.fontWeight !== undefined) {
    text.fontWeight = fontWeightMap[state.fontWeight];
  }

  return { control, text, elevation };
}

// ── Resolver ──────────────────────────────────────────────────

export function resolveKnobs(
  knobs: Knobs,
  override?: KnobPropsOverride,
  scheme: ColorScheme = 'light',
  environment?: { touch?: boolean },
): ResolvedKnobs {
  const radiusToken = borderRadiusMap[knobs.borderRadius];
  const nestedRadiusToken = nestedRadiusMap[knobs.borderRadius];
  const sizeToken = sizeTokenMap[knobs.size];
  const nestedPx = nestedControlPxMap[knobs.size];
  const nestedHitSlop = pressTargetHitSlop(nestedPx);
  const sizeRecipe = sizeRecipeForToken(sizeToken, {
    touch: environment?.touch ?? (isTouchable || isWebTouchable),
    family: knobs.density === 'compact' ? 'controlCompact' : 'control',
  });
  const paddingToken = panelPaddingMap[knobs.space];
  const gapToken = gapMap[knobs.space];
  const fontWeightValue = fontWeightMap[knobs.fontWeight];
  const bodyFontValue = bodyFontMap[knobs.bodyFont] ?? '$body';
  const transition = knobs.animation === 'none' ? undefined : (knobs.animation as TransitionProp);

  const containerRadiusValue = capContainerRadius(knobs.borderRadius, knobs.space);

  // Corner smoothing rides every radius-bearing fragment so consumers need
  // zero edits (KNOB-TOTALITY). Identity guard (Axiom 3 NULL +
  // R-BINARY/R-PILL): `none` has no arc to smooth, and at `full` the
  // uncapped token turns control-tier parts into circles/capsules whose
  // shape is identity — squircle ends would distort them — so the
  // raw-radius fragments only smooth the arc classes (small/medium/large).
  // Capped container fragments stay plain arcs at every knob (the Axiom 1
  // cap = padding px, which superellipse corners under-fill, so the cap
  // remains a safe over-approximation) and smooth whenever a nonzero arc
  // exists. featureSurface smooths on the same rule: `none` has no arc.
  const smoothing = cornerSmoothingStyle[knobs.cornerSmoothing ?? 'round'];
  const scaleSmoothing = knobs.borderRadius === 'none' || knobs.borderRadius === 'full' ? undefined : smoothing;
  const containerSmoothing = knobs.borderRadius === 'none' ? undefined : smoothing;

  const outlined = knobs.fillStyle === 'outlined';
  // OUTLINED-HAIRLINE: outlined implies a minimum border. none on an
  // outlined control still draws the enumerated `small` stop (0.5). Chromeless
  // is filled + none. Components must not add a second local floor.
  const borderWidthValue =
    outlined && knobs.borderWidth === 'none' ? borderWidthMap.small : borderWidthMap[knobs.borderWidth];
  const elevationToken = elevationMap[knobs.elevation];
  const overlayElevationToken = overlayElevationMap[knobs.elevation];
  const overlayPaintProps = elevationPaint(overlayElevationToken, scheme);
  const elevationChrome = elevationChromeFor(elevationToken, scheme);
  const dark = scheme === 'dark';
  // `$background` (not `$color1`) so surface1/2/3 sub-themes move
  // the fill. Dark + elevation still steps the filled rest fill up the ramp.
  const overlayFill = dark && knobs.elevation !== 'none' ? elevationTintOverlay[knobs.elevation] : '$background';
  const textAccentColor = textAccentColorMap[knobs.textAccent] ?? '$color';
  // One input surface (Axiom 5 ONE SOURCE): Timeline's composer,
  // RichEditor and form fields agree on what an input surface is.
  // `$background` not `$color2` so a surface sub-theme can move it.
  // Dark + elevation steps the filled rest fill up the existing ramp.
  const inputBackground = outlined ? 'transparent' : dark ? elevationTintInput[knobs.elevation] : '$background';

  const hover = resolveStateKnobs(knobs.hover, scheme);
  const press = resolveStateKnobs(knobs.press, scheme);
  const focus = resolveStateKnobs(knobs.focus, scheme);
  const focusVisible = resolveStateKnobs(knobs.focusVisible, scheme);

  const nonEmpty = <T extends object>(obj: T): T | undefined => (Object.keys(obj).length > 0 ? obj : undefined);

  // Hover/press always carry on-color state-layer fills.
  // Focus-visible ring is always present and non-removable.
  const control: KnobRecipe<ControlStateProps> = {
    hoverKnobProps: withDefaultStateLayer(hover.control, STATE_LAYER_HOVER),
    pressKnobProps: withDefaultStateLayer(press.control, STATE_LAYER_PRESS),
    focusKnobProps: nonEmpty(focus.control),
    focusVisibleKnobProps: ensureFocusVisibleRing(focusVisible.control),
  };
  const text: KnobRecipe<TextStateProps> = {
    hoverKnobProps: nonEmpty(hover.text),
    pressKnobProps: nonEmpty(press.text),
    focusKnobProps: nonEmpty(focus.text),
    focusVisibleKnobProps: nonEmpty(focusVisible.text),
  };
  const elevation: KnobRecipe<ElevationStateProps> = {
    hoverKnobProps: nonEmpty(hover.elevation),
    pressKnobProps: nonEmpty(press.elevation),
    focusKnobProps: nonEmpty(focus.elevation),
    focusVisibleKnobProps: nonEmpty(focusVisible.elevation),
  };

  const nestedRadius = { borderRadius: nestedRadiusToken, ...containerSmoothing };

  const knobProps: KnobProps = {
    borderRadius: {
      borderRadius: radiusToken,
      borderColor: '$borderColor',
      borderWidth: borderWidthValue,
      ...scaleSmoothing,
    },
    borderRadiusNested: nestedRadius,
    // The old name for the same fragment, kept for one release so
    // an out-of-tree consumer does not break on the rename. Same object, so
    // the two cannot drift while both exist.
    borderRadiusOuter: nestedRadius,
    controlBorderFilled: { borderColor: 'transparent', borderWidth: borderWidthValue },
    controlBorderOutlined: {
      borderColor: '$borderColor',
      borderWidth: Math.max(borderWidthValue, 1),
    },
    // Axiom 1 child-clip cap: padded containers (Card/Panel/DialogContent)
    // spread this after their radius-bearing fragment. Non-container parts
    // keep the uncapped `borderRadius` fragment.
    containerRadius: { borderRadius: containerRadiusValue, ...containerSmoothing },
    elevation: elevationToken,
    overlayElevation: overlayElevationToken,
    elevationChrome,
    scheme,
    surface: {
      backgroundColor: '$background',
      borderColor: '$borderColor',
      borderWidth: borderWidthValue,
    },
    cardSurface: {
      backgroundColor: overlayFill,
      borderRadius: containerRadiusValue,
      padding: paddingToken,
      ...containerSmoothing,
    },
    elevatedSurface: {
      backgroundColor: overlayFill,
      borderColor: '$borderColor',
      borderWidth: borderWidthValue,
      borderRadius: radiusToken,
      elevation: overlayElevationToken,
      ...overlayPaintProps,
      ...scaleSmoothing,
    },
    featureSurface: {
      backgroundColor: '$background',
      borderRadius: featureRadiusMap[knobs.borderRadius],
      padding: featurePaddingMap[knobs.space],
      // Bento marketing/auth card shadow: ~0px 9px 12px rgba(0,0,0,0.02) —
      // softer/wider than any elevationMap token, so explicit shadow props.
      shadowColor: 'rgba(0,0,0,0.02)',
      shadowOffset: { width: 0, height: 9 },
      shadowOpacity: 1,
      shadowRadius: 12,
      ...containerSmoothing,
    },
    inputSurface: { borderWidth: borderWidthValue },
    panelPadding: { padding: paddingToken },
    gap: { gap: gapToken },
    gapLg: { gap: gapLgMap[knobs.space] },
    sizeToken,
    label: {
      fontSize: labelFontSizeMap[knobs.size],
      fontFamily: bodyFontValue,
      fontWeight: fontWeightValue,
    },
    nestedControl: {
      px: nestedPx,
      width: nestedPx,
      height: nestedPx,
      minWidth: nestedPx,
      maxWidth: nestedPx,
      minHeight: nestedPx,
      maxHeight: nestedPx,
      hitSlop: nestedHitSlop,
    },
    control: {
      height: sizeRecipe.height,
      paddingHorizontal: sizeRecipe.paddingHorizontal,
      gap: sizeRecipe.gap,
    },
    controlType: { fontSize: sizeRecipe.fontSize },
    controlIcon: { width: sizeRecipe.iconSize, height: sizeRecipe.iconSize },
    heading: {
      fontFamily: headingFontMap[knobs.headingFont],
      fontWeight: fontWeightValue,
    },
    pageTitle: resolvePageTitleScale(knobs.pageTitleScale ?? 'moderate'),
    body: {
      fontFamily: bodyFontValue,
      fontWeight: fontWeightValue,
    },
    textWeight: { fontWeight: fontWeightValue },
    transition,
    outlined,
    pointy: knobs.borderRadius === 'none',
    textAccent: knobs.textAccent,
    textAccentColor,
    inputBackground,
    space: knobs.space,
    size: knobs.size,
    density: knobs.density,
    // House decisions — behavioral pass-through (no token mapping).
    fieldLabelPlacement: knobs.fieldLabelPlacement,
    requiredMarking: knobs.requiredMarking,
    tableZebra: knobs.tableZebra,
    bulkBarPlacement: knobs.bulkBarPlacement,
    selectAllScope: knobs.selectAllScope,
    timestampStyle: knobs.timestampStyle,
    disabledStyle: knobs.disabledStyle,
    formAutofocus: knobs.formAutofocus,
  };

  const finalKnobProps = override ? { ...knobProps, ...override(knobProps, knobs) } : knobProps;

  return {
    knobProps: finalKnobProps,
    control,
    text,
    elevation,
    disabledState: resolveDisabled(knobs.disabledStyle),
  };
}
