/**
 * The `--xy-*` token bridge.
 *
 * Every paint in React Flow reads through `var(--xy-thing,
 * var(--xy-thing-default))`. We set the non-default layer from `ResolvedKnobs`
 * plus the Tamagui theme, so the library stylesheet is never edited, never
 * forked, and no specificity war is possible. A designer never touches React
 * Flow CSS — `checkGraphVarsCoverage()` in `public/config/lint.mjs` makes that
 * mechanical rather than aspirational.
 *
 * Scope, honestly: the installed sheet exposes 35 settable names and 7 of them
 * are dead for us. The `--xy-node-*` family binds ONLY to React Flow's built-in
 * node classes (style.css:454-486) and a Tamagui node never carries them; its
 * paint comes from the `knobProps` spread in `GraphNode.tsx`. So this layer
 * paints CHROME: edges, edge labels, handles, minimap, controls, background
 * pattern, selection rect, connection line, resize control.
 *
 * Design: docs/design/node-graph-editor.md section 6.2.
 */

import { MIN_PRESS_TARGET, hairlineWidth } from '@repo/theme';
import type { ResolvedKnobs } from '@repo/theme';

// ── Theme access ─────────────────────────────────────────────────────────────

/**
 * How a colour is reached, in the two forms this module needs.
 *
 * `css` is what gets emitted for a plain reference. On web it is the Tamagui
 * Variable's own `var(--…)` string, read off the live theme rather than
 * reconstructed from a guessed prefix, so a theme flip repaints without a
 * revision bump. `raw` is the literal value, and exists only because the two
 * BLENDED entries have to be computed in JS: `color-mix()` support in the
 * Android WebView images in play is unchecked, and four values would silently
 * vanish if we leaned on it (design 6.2).
 */
export interface GraphThemeAccess {
  /** CSS-ready reference for a theme key, with or without the `$`. */
  readonly css: (key: string) => string | undefined;
  /** Literal value for the same key — `#fff`, `hsl(…)`, `rgb(…)`. */
  readonly raw: (key: string) => string | undefined;
}

// ── The 7 that are dead for us ───────────────────────────────────────────────

/**
 * Names React Flow exposes that this package deliberately does not set, each
 * with the reason a reader can check against the installed sheet. The spec
 * re-derives the binding from `@xyflow/react/dist/style.css` rather than
 * trusting these strings, so a version that starts binding one of them to a
 * class we DO render fails the build.
 */
// oxlint-disable-next-line anti-slop/no-known-value-widening -- looked up by arbitrary runtime strings (knob values, var names); the open index type is the contract
export const xyVarAllowlist: Readonly<Record<string, string>> = {
  '--xy-node-background-color':
    'binds only to .react-flow__node-input/-default/-output/-group; a Tamagui GraphNode carries none of those classes and takes its fill from the knobProps spread',
  '--xy-node-border':
    "same four built-in node classes; a GraphNode's border comes from knobProps.controlBorderOutlined / .surface",
  '--xy-node-border-radius':
    "same four built-in node classes; a GraphNode's radius rides the CONTAINER-CAP law in graphNode.ts",
  '--xy-node-color': "same four built-in node classes; a GraphNode's text colour comes from knobProps.body",
  '--xy-node-boxshadow-hover':
    "same four built-in node classes, hover only; a GraphNode's elevation comes from knobProps.elevationChrome",
  '--xy-node-boxshadow-selected':
    'same four built-in node classes, selected only; selection chrome is painted by GraphNode itself',
  '--xy-node-group-background-color':
    'binds only to .react-flow__node-group; this package registers no group node type',
};

// ── Value shapes ─────────────────────────────────────────────────────────────

/**
 * A var's value, kept structured rather than pre-stringified.
 *
 * Design 6.2 asks the spec to run `isResolvableThemeValue` over "every mapped
 * value", and taken literally that is not satisfiable: two of the 28 are CSS
 * SHORTHANDS (`1px dashed <colour>`, a box-shadow), and the predicate answers
 * "is this a colour a renderer can resolve" — it says no to any shorthand, and
 * to `2px`. So the map carries the ATOMS: every `color`, and every colour
 * inside a `composite`, is put through the predicate; a `length` is a finite
 * number, which the predicate also accepts. Nothing is exempted by hand.
 */
export type GraphVarValue =
  | { readonly kind: 'color'; readonly color: string }
  | { readonly kind: 'length'; readonly px: number }
  | { readonly kind: 'composite'; readonly css: string; readonly colors: readonly string[] };

export interface GraphCssVarsOptions {
  /**
   * Pointer class the graph is being painted for. Coarse pointers get the
   * 44 px HIG/M3 press floor on the handle HIT region; the painted disc never
   * moves (design 7.1 H1/H3).
   */
  readonly pointer?: 'coarse' | 'fine';
}

// ── Mirrored token numbers ───────────────────────────────────────────────────

/**
 * Tamagui space tokens as px.
 *
 * `knobProps.gap.gap` and `knobProps.panelPadding.padding` are TOKEN strings
 * (`"$4"`), and a CSS custom property whose value is `$4` is dead — it is
 * exactly the silent no-op the repo's own token lints exist to catch. The
 * numbers are mirrored here the way `resolveKnobs.ts:148-162` mirrors them, and
 * `graph-vars.test.ts` asserts the mirror against the INSTALLED
 * `@tamagui/themes` table, which is the drift check resolveKnobs' own mirror
 * does not have.
 */
// oxlint-disable-next-line anti-slop/no-known-value-widening -- looked up by arbitrary runtime strings (knob values, var names); the open index type is the contract
export const spaceTokenPx: Readonly<Record<string, number>> = {
  $0: 0,
  $1: 2,
  $2: 7,
  $3: 13,
  $4: 18,
  $5: 24,
  $6: 32,
};

/**
 * `animation` token to a complete CSS `transition` shorthand.
 *
 * Mirrored, not imported: `animationConfig` is a platform twin
 * (`animations/index.web.ts` -> `./css` gives these strings, `./reactNative`
 * gives spring objects), and this function runs on the NATIVE host too — it
 * builds the vars that cross into the WebView. `graph-vars.test.ts` asserts the
 * mirror against the web twin.
 */
// oxlint-disable-next-line anti-slop/no-known-value-widening -- looked up by arbitrary runtime strings (knob values, var names); the open index type is the contract
export const graphTransitionCss: Readonly<Record<string, string>> = {
  bouncy: 'all ease-in 200ms',
  lazy: 'all ease-in 600ms',
  slow: 'all ease-in 500ms',
  medium: 'all ease-in 300ms',
  quick: 'all ease-in 100ms',
  tooltip: 'all ease-in 400ms',
  snappy: 'all ease-out 80ms',
  gentle: 'all ease-in-out 450ms',
};

/** GraphPort painted disc, by the `size` knob (design 11, Size). Never 44 — that is the HIT value. */
// oxlint-disable-next-line anti-slop/no-known-value-widening -- looked up by arbitrary runtime strings (knob values, var names); the open index type is the contract
export const handlePaintedPx: Readonly<Record<string, number>> = {
  small: 8,
  medium: 10,
  large: 12,
};

/**
 * Edge ink by the `borderWidth` knob (design 11, Border width): none 1, small
 * 1.5, medium 2, large 3.
 *
 * A remap, not a floor to `hairlineWidth`: an edge is a stroke, not a divider,
 * and `hairline.ts:16-21` scopes that token to dividers only. `none` still
 * paints, because a 0-width edge erases the graph's primary information.
 *
 * Keyed by `knobProps.controlBorderFilled.borderWidth`, NOT by the design's
 * `controlBorderOutlined.borderWidth`. That fragment is
 * `Math.max(borderWidthValue, 1)` (resolveKnobs.ts:599-602), which collapses
 * none / small / medium onto the single value 1 — three of the four stops are
 * not recoverable from it, so a remap off it cannot produce four widths.
 * `controlBorderFilled` carries the unclamped number (0 / 0.5 / 1 / 2) and is
 * the only post-resolution place the stop survives; `ResolvedKnobs` exposes no
 * `borderWidth` string at all.
 *
 * One measured consequence: under `fillStyle: "outlined"` the resolver already
 * promotes `borderWidth: "none"` to `small` (resolveKnobs.ts:530-533), so an
 * outlined graph paints the 1.5 px edge at BOTH stops. That is the resolver's
 * own clamp showing through, not a choice made here.
 */
// oxlint-disable-next-line anti-slop/no-known-value-widening -- looked up by arbitrary runtime strings (knob values, var names); the open index type is the contract
export const edgeStrokeWidthPx: Readonly<Record<string, number>> = {
  '0': 1,
  '0.5': 1.5,
  '1': 2,
  '2': 3,
};

// ── Colour helpers ───────────────────────────────────────────────────────────

const clamp255 = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

const roundAlpha = (value: number): number => Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;

/**
 * The same colour at a different alpha, as `rgba()` / `hsla()`.
 *
 * No `color-mix()` and no hex out: the blends are computed here so the emitted
 * value is one every engine in play already paints. Returns `undefined` when
 * the input is not a literal colour this can read (a `var()` reference, an
 * `oklch()`), so the caller degrades visibly rather than emitting nonsense.
 */
export const withAlpha = (color: string | undefined, alpha: number): string | undefined => {
  if (color === undefined || color === '') {
    return undefined;
  }
  const text = color.trim();
  const a = roundAlpha(alpha);

  const hex = /^#(?<digits>[0-9a-fA-F]{3,8})$/u.exec(text);
  if (hex) {
    const digits = hex.groups?.digits ?? '';
    let r: number;
    let g: number;
    let b: number;
    if (digits.length === 3 || digits.length === 4) {
      r = Number.parseInt(digits[0] + digits[0], 16);
      g = Number.parseInt(digits[1] + digits[1], 16);
      b = Number.parseInt(digits[2] + digits[2], 16);
    } else if (digits.length === 6 || digits.length === 8) {
      r = Number.parseInt(digits.slice(0, 2), 16);
      g = Number.parseInt(digits.slice(2, 4), 16);
      b = Number.parseInt(digits.slice(4, 6), 16);
    } else {
      return undefined;
    }
    return `rgba(${clamp255(r)}, ${clamp255(g)}, ${clamp255(b)}, ${a})`;
  }

  const rgb = /^rgba?\((?<channels>[^)]+)\)$/u.exec(text);
  if (rgb) {
    const parts = (rgb.groups?.channels ?? '').split(/[\s,/]+/u).filter(Boolean);
    if (parts.length < 3) {
      return undefined;
    }
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${a})`;
  }

  const hsl = /^hsla?\((?<channels>[^)]+)\)$/u.exec(text);
  if (hsl) {
    const parts = (hsl.groups?.channels ?? '')
      .split(/[,/]+/u)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length < 3) {
      return undefined;
    }
    return `hsla(${parts[0]}, ${parts[1]}, ${parts[2]}, ${a})`;
  }

  return undefined;
};

/** `"$color9"` / `"color9"` resolve through the theme; anything else is already CSS. */
const toCss = (value: string | undefined, theme: GraphThemeAccess): string | undefined => {
  if (value === undefined || value === '') {
    return undefined;
  }
  if (value.startsWith('$')) {
    return theme.css(value.slice(1));
  }
  return value;
};

/**
 * A dev-only notice for a value this module could not compute.
 *
 * Not `devWarn`: its `DevWarnCode` union is closed (public/theme/src/devWarn.ts)
 * and adding a member is a change to the theme package, which this task does
 * not own. The alternative — degrading in silence — is the failure the repo's
 * whole silent-no-op lint family exists to prevent.
 */
const warnOnce = (message: string): void => {
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  console.warn(`[@repo/node-graph] ${message}`);
};

/**
 * `knobProps.elevationChrome` as a CSS box-shadow.
 *
 * On web `elevationChrome.style.boxShadow` is already the house shadow string
 * (`resolveKnobs.ts:312-322`, pure `rgba()`), so it is used verbatim. On the
 * NATIVE host that key is absent — `elevationPaint` only sets it under `isWeb`
 * — and the shadow is rebuilt from the paint props, resolving a `$token`
 * shadow colour through the theme. `elevation: "none"` resolves to an empty
 * chrome and emits `none`, which is the right answer rather than a missing one.
 */
export interface ElevationShadow {
  readonly css: string;
  readonly colors: readonly string[];
}

export const elevationBoxShadow = (resolved: ResolvedKnobs, theme: GraphThemeAccess): ElevationShadow => {
  const chrome = resolved.knobProps.elevationChrome;
  const fromWeb = chrome.style?.boxShadow;
  if (fromWeb !== undefined && fromWeb !== '') {
    return { css: fromWeb, colors: fromWeb.match(/rgba?\([^)]*\)/gu) ?? [] };
  }
  if (chrome.shadowColor === undefined || chrome.shadowColor === '' || chrome.shadowRadius == null) {
    return { css: 'none', colors: [] };
  }
  const raw = chrome.shadowColor.startsWith('$') ? theme.raw(chrome.shadowColor.slice(1)) : chrome.shadowColor;
  const tinted = withAlpha(raw, chrome.shadowOpacity ?? 0.15);
  if (tinted === undefined) {
    warnOnce(
      `elevation shadow colour ${JSON.stringify(chrome.shadowColor)} is not a literal colour this can blend, so --xy-controls-box-shadow falls back to none`,
    );
    return { css: 'none', colors: [] };
  }
  const offsetY = chrome.shadowOffset?.height ?? 0;
  const offsetX = chrome.shadowOffset?.width ?? 0;
  return {
    css: `${offsetX}px ${offsetY}px ${chrome.shadowRadius}px ${tinted}`,
    colors: [tinted],
  };
};

// ── The map ──────────────────────────────────────────────────────────────────

const color = (value: string | undefined, fallback: string): GraphVarValue => ({
  kind: 'color',
  color: value ?? fallback,
});

/**
 * Every var this package sets, structured. `graphCssVars` is the string form
 * that goes into the sheet; this is the form the spec can reason about.
 */
export const graphVarValues = (
  resolved: ResolvedKnobs,
  theme: GraphThemeAccess,
  options?: GraphCssVarsOptions,
): Record<string, GraphVarValue> => {
  const { knobProps, control, text } = resolved;
  const themeColor = (key: string, fallback = 'currentColor') => theme.css(key) ?? fallback;

  const outline = themeColor('outlineColor', themeColor('borderColor'));
  const bodyColor = toCss(knobProps.body.color, theme) ?? themeColor('color');
  const hoverBackground = toCss(control.hoverKnobProps?.backgroundColor, theme);
  // Design 6.2 reads this off `control.hoverKnobProps.color`, but
  // `ControlStateProps` carries no colour at all (recipes.ts:7-17) — text
  // colour is `TextStateProps` on the `text` recipe (recipes.ts:19-23), which
  // is where the hover label colour actually lives.
  const hoverColor = toCss(text.hoverKnobProps?.color, theme);

  const edgeStrokeWidth = edgeStrokeWidthPx[String(knobProps.controlBorderFilled.borderWidth)] ?? 2;

  const selectionFill = withAlpha(theme.raw('outlineColor') ?? theme.raw('borderColor'), 0.12);
  const maskFill = withAlpha(theme.raw('color1'), 0.7);
  const shadow = elevationBoxShadow(resolved, theme);

  const handlePainted = handlePaintedPx[knobProps.size] ?? 10;
  const handleHit = options?.pointer === 'fine' ? Math.max(handlePainted, 24) : MIN_PRESS_TARGET;
  const nodeGap = spaceTokenPx[knobProps.gap.gap] ?? 18;
  const nodePadding = spaceTokenPx[knobProps.panelPadding.padding] ?? 18;

  // oxlint-disable-next-line anti-slop/no-known-value-widening -- keyed by CSS custom-property name; the open record is the public shape
  return {
    // ── edges ──
    '--xy-edge-stroke': color(theme.css('color9'), 'currentColor'),
    '--xy-edge-stroke-selected': { kind: 'color', color: outline },
    '--xy-edge-stroke-width': { kind: 'length', px: edgeStrokeWidth },
    '--xy-connectionline-stroke': { kind: 'color', color: outline },
    '--xy-connectionline-stroke-width': { kind: 'length', px: edgeStrokeWidth + 1 },
    '--xy-edge-label-background-color': color(
      toCss(knobProps.cardSurface.backgroundColor, theme),
      themeColor('color1'),
    ),
    '--xy-edge-label-color': { kind: 'color', color: bodyColor },

    // ── handles ──
    '--xy-handle-background-color': color(theme.css('color1'), 'transparent'),
    '--xy-handle-border-color': color(theme.css('color8'), themeColor('borderColor')),

    // ── selection ──
    '--xy-selection-background-color': color(selectionFill, 'transparent'),
    '--xy-selection-border': {
      kind: 'composite',
      css: `1px dashed ${outline}`,
      colors: [outline],
    },

    // ── canvas ──
    '--xy-background-color': color(toCss(knobProps.surface.backgroundColor, theme), themeColor('color1')),
    '--xy-background-pattern-color': color(theme.css('color4'), themeColor('borderColor')),

    // ── minimap ──
    '--xy-minimap-background-color': color(
      toCss(knobProps.elevatedSurface.backgroundColor, theme),
      themeColor('color1'),
    ),
    '--xy-minimap-node-background-color': color(theme.css('color6'), themeColor('borderColor')),
    '--xy-minimap-node-stroke-color': color(theme.css('borderColor'), 'currentColor'),
    '--xy-minimap-node-stroke-width': { kind: 'length', px: knobProps.surface.borderWidth },
    '--xy-minimap-mask-background-color': color(maskFill, 'transparent'),
    '--xy-minimap-mask-stroke-color': { kind: 'color', color: outline },
    '--xy-minimap-mask-stroke-width': { kind: 'length', px: hairlineWidth },

    // ── controls ──
    '--xy-controls-button-background-color': color(
      toCss(knobProps.elevatedSurface.backgroundColor, theme),
      themeColor('color1'),
    ),
    '--xy-controls-button-background-color-hover': color(
      hoverBackground ?? theme.css('color4'),
      themeColor('borderColor'),
    ),
    '--xy-controls-button-color': { kind: 'color', color: bodyColor },
    '--xy-controls-button-color-hover': { kind: 'color', color: hoverColor ?? bodyColor },
    '--xy-controls-button-border-color': color(theme.css('borderColor'), 'currentColor'),
    '--xy-controls-box-shadow': { kind: 'composite', css: shadow.css, colors: shadow.colors },

    // ── attribution / resize ──
    '--xy-attribution-background-color': { kind: 'color', color: 'transparent' },
    '--xy-resize-background-color': { kind: 'color', color: outline },

    // ── the mpo-owned layer, for what React Flow has no variable for ──
    '--mpo-graph-handle-size': { kind: 'length', px: handlePainted },
    '--mpo-graph-handle-hit': { kind: 'length', px: handleHit },
    '--mpo-graph-guide-color': { kind: 'color', color: outline },
    // hairlineWidth, NOT divided by pixelRatio: CSS px inside a WebView are
    // already density-independent, and dividing would ask for a 0.167 px line
    // on a 3x phone. A guide is a divider, which is what the token is for.
    '--mpo-graph-guide-width': { kind: 'length', px: hairlineWidth },
    '--mpo-graph-node-gap': { kind: 'length', px: nodeGap },
    '--mpo-graph-node-padding': { kind: 'length', px: nodePadding },
    '--mpo-graph-port-spacing': { kind: 'length', px: Math.max(handleHit, nodeGap) },
    '--mpo-graph-transition': {
      kind: 'composite',
      // oxlint-disable-next-line typescript/no-base-to-string -- a spring-object transition stringifies to a key the table lacks and falls through to `none`, as intended
      css: graphTransitionCss[String(knobProps.transition ?? '')] ?? 'none',
      colors: [],
    },
  };
};

/** One var value as it appears in the sheet. */
export const graphVarCss = (value: GraphVarValue): string => {
  if (value.kind === 'color') {
    return value.color;
  }
  if (value.kind === 'length') {
    return `${value.px}px`;
  }
  return value.css;
};

/** The layer that goes into the envelope and into `<GraphVars>`. */
export const graphCssVars = (
  resolved: ResolvedKnobs,
  theme: GraphThemeAccess,
  options?: GraphCssVarsOptions,
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(graphVarValues(resolved, theme, options))) {
    out[name] = graphVarCss(value);
  }
  // oxlint-disable-next-line anti-slop/no-known-value-widening -- keyed by CSS custom-property name; the open record is the public shape
  return out;
};
