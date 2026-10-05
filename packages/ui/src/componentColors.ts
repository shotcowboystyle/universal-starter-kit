/**
 * Semantic color ramp constants for non-form components.
 *
 * Follows the same pattern as `public/forms/src/shared/colorRamps.ts`.
 * All values reference Tamagui theme tokens so they adapt to light/dark mode.
 *
 * Use these instead of hardcoding `$color3`, `$color10`, etc. in component files.
 */

export const componentColors = {
  /**
   * Surface-level backgrounds and borders (cards, panels, containers).
   *
   * `background` was `$color2` while `resolveKnobs`' own `surface`
   * fragment said `$color1` — two answers to "what colour is a surface",
   * split across two packages. Both now say `$background`, which is also the
   * token Tamagui addresses and the only one a `surface1`/`surface2`
   * sub-theme can move.
   */
  surface: {
    background: '$background',
    border: '$color6',
  },

  /** Interactive element states (buttons, clickable items, hover/press) */
  interactive: {
    background: '$color3',
    hover: '$color4',
    active: '$color5',
    border: '$color7',
  },

  /** Text color levels. */
  text: {
    // Was `$color12`, a second answer to what `resolveKnobs`'
    // `textAccent: high` already resolves to. `$color` IS the theme's ink,
    // and it tracks a sub-theme where the raw ramp step does not.
    primary: '$color',
    // `secondary` and `muted` were the same mistake one tier down —
    // a static `$color11` read into 85 `color` props, which pinned every
    // helper, caption and inactive label dim at `textAccent: high`. Secondary
    // text takes `useResolvedKnobs().knobProps.textAccentColor`, which is
    // `$color11` at low/medium (the AA floor) and `$color` at high.
    subtle: '$color8',
  },

  /** Code block styling */
  code: {
    background: '$color3',
    foreground: '$color12',
    border: '$color6',
    lineNumber: '$color8',
    highlightLine: '$yellow3',
  },

  /**
   * Dot/step indicators.
   *
   * ONE-EMPHASIS: the selected/current mark IS the active accent, so
   * every strip in the catalog (DotIndicator, Pagination dots, ProgressSteps)
   * reads one selected-state language. This is deliberately ONE key — the
   * former `active` ($color9) / `current` ($color12) pair was two dialects for
   * one concept and let the catalog drift back into ink. Completion
   * keeps its own semantic ramp; idle/track/hover stay neutral chrome.
   */
  indicator: {
    selected: '$accentBackground',
    inactive: '$color5',
    hover: '$color6',
    completed: '$green9',
    track: '$color8',
  },

  /** Tooltips and overlays */
  overlay: {
    background: '$color3',
    border: '$color6',
    text: '$color11',
  },

  /** Badge semantic colors. Step 11 (not 9) so the count text clears AA:
   * white-on-$red9 measured 3.91:1 (SB-R-02). Step 11 flips with the scheme
   * (deep hue in light, pale hue in dark), pairing with $color1 text. */
  badge: {
    red: '$red11',
    blue: '$blue11',
    green: '$green11',
    orange: '$orange11',
    gray: '$color11',
  },

  /** Semantic status colors for diff-like displays. Step 11 (not 10) for the
   * same AA reason as `badge`: these color small status/trend text (KPICard
   * trend, Timeline diffs, Attachments errors) and step 10 measured
   * 3.37–4.36:1 on color1/2 surfaces — under the 4.5:1 normal-text floor. */
  semantic: {
    error: '$red11',
    success: '$green11',
    info: '$color11',
  },

  /** Separator/divider tokens */
  divider: '$color4',

  /** Debug indicator color */
  debug: '$color9',
} as const;

/**
 * Shared section-heading scale.
 *
 * One step below the page `<H1>` title so every catalog section label
 * (PageSection title, Timeline label, Attachments label) reads at ONE
 * consistent 20px scale on a composed screen — instead of each component
 * picking its own H2/H4/Label size. Spread onto the heading node:
 *
 *   <H2 margin={0} {...sectionHeading}>{title}</H2>
 *
 * Numeric px on purpose: the token `$7` resolves per font SCOPE — 20px in
 * the `$body` scope (Label) but 28px in the `$heading` scope (H2/H4, whose
 * size table is 1.4x) — which put 28px text on this 26px leading (ratio
 * 0.93, wrapped titles overlapped). Fixed values render the same 20px/26px
 * (1.3) in every scope. Family/weight are the subordinate-heading law:
 * mono at 400, not Inter 600–800.
 */
export const sectionHeading = {
  fontFamily: '$mono',
  fontSize: 20,
  lineHeight: 26,
  fontWeight: '400',
} as const;
