/**
 * OPTICS hairline (Axiom 15): a divider means "one device pixel", not "one
 * CSS pixel". On high-DPI web screens a 1px CSS divider paints 2–3 device
 * pixels and reads heavy; 0.5px paints a single device pixel on 2x displays.
 *
 * Engine notes (probed against Chromium 147 / WebKit / Gecko):
 * - Blink floors sub-1px BORDER widths up to 1 CSS px, but honors fractional
 *   HEIGHT/WIDTH — so standalone rules use the filled `line`/`vline`
 *   treatments (crisp everywhere), while container-owned edge borders
 *   (`bottom`/`top`/`right`/`left`) render true hairlines on WebKit/Gecko
 *   and gracefully stay 1px on Blink.
 * - Low-DPI screens (1dppx) get a 1px fallback via the resolution media
 *   query below, so hairlines never fade or vanish there.
 *
 * Scope: DIVIDERS ONLY — separators between rows/sections, menu separators,
 * table head rules, full-bleed panel rules. Control borders (inputs,
 * buttons, control groups) keep the knob-driven `borderWidth` semantics
 * from `resolveKnobs` and MUST NOT use this token.
 *
 * Native twin: `hairline.native.ts` (react-native StyleSheet.hairlineWidth,
 * no CSS classes).
 */

/** Divider line width: half a CSS pixel = one device pixel on 2x displays. */
export const hairlineWidth: number = 0.5;

/**
 * Spreadable divider treatments. Each entry pairs the 0.5px style with the
 * fallback class the low-DPI media query targets:
 *
 *   <Separator {...hairline.line} />            // horizontal rule element
 *   <Separator vertical {...hairline.vline} />  // vertical rule element
 *   <View {...hairline.height} />               // already-filled 1px line
 *   <YStack {...hairline.bottom} />             // container-owned edge rule
 */
export const hairline = {
  /**
   * Standalone horizontal rule as a FILLED line (tamagui Separator draws a
   * border, which Blink cannot paint below 1 CSS px — flip it to a filled
   * fractional-height line, crisp in every engine). Consumers may override
   * `backgroundColor` after the spread for non-default divider colors.
   */
  line: {
    height: hairlineWidth,
    maxHeight: hairlineWidth,
    // Separator is a `flex: 1` item, so in a stack the main-axis size comes
    // from flex-basis (height alone is ignored):
    flexBasis: hairlineWidth,
    borderBottomWidth: 0,
    backgroundColor: '$borderColor',
    className: 'mp-hairline-h',
  },
  /** Standalone vertical rule as a filled line (see `line`). */
  vline: {
    width: hairlineWidth,
    maxWidth: hairlineWidth,
    flexBasis: hairlineWidth,
    borderRightWidth: 0,
    backgroundColor: '$borderColor',
    className: 'mp-hairline-w',
  },
  /** Already-filled 1px line elements (e.g. menu separator views). */
  height: { height: hairlineWidth, className: 'mp-hairline-h' },
  // Container-owned edge rules. True hairline on WebKit/Gecko; Blink rounds
  // sub-1px borders up to 1 CSS px (the pre-hairline status quo there).
  bottom: { borderBottomWidth: hairlineWidth, className: 'mp-hairline-b' },
  top: { borderTopWidth: hairlineWidth, className: 'mp-hairline-t' },
  right: { borderRightWidth: hairlineWidth, className: 'mp-hairline-r' },
  left: { borderLeftWidth: hairlineWidth, className: 'mp-hairline-l' },
} as const;

const STYLE_TAG_ID = 'mp-hairline-styles';

/**
 * 1px fallback for screens where 0.5px cannot map to a whole device pixel.
 * (`-webkit-max-device-pixel-ratio` covers Safari versions without
 * `resolution` media-query support.) Exported for unit tests.
 */
export const hairlineFallbackCss = `@media (max-resolution: 1.49dppx), (-webkit-max-device-pixel-ratio: 1.49) {
  .mp-hairline-b { border-bottom-width: 1px !important; }
  .mp-hairline-t { border-top-width: 1px !important; }
  .mp-hairline-r { border-right-width: 1px !important; }
  .mp-hairline-l { border-left-width: 1px !important; }
  .mp-hairline-h { height: 1px !important; max-height: 1px !important; flex-basis: 1px !important; }
  .mp-hairline-w { width: 1px !important; max-width: 1px !important; flex-basis: 1px !important; }
  .mp-hairline-ie { border-inline-end-width: 1px !important; }
}`;

/** Idempotently mount the low-DPI fallback stylesheet (no-op off-DOM). */
export function ensureHairlineFallback(): void {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.getElementById(STYLE_TAG_ID)) {
    return;
  }
  const tag = document.createElement('style');
  tag.id = STYLE_TAG_ID;
  tag.textContent = hairlineFallbackCss;
  document.head.appendChild(tag);
}

// The fallback is static CSS (no knob/theme dependency), so mount it as soon
// as the module loads in a DOM environment.
ensureHairlineFallback();
