export const formButtonColors = {
  background: {
    base: '$color5',
    hover: '$color4',
    active: '$color6',
  },
  border: {
    base: '$color7',
    hover: '$color6',
    active: '$color8',
  },
  // Legibility floor (SB-R-01): low-accent labels clamp to the $color11
  // tier — $color7 measured 1.29:1 on the button surface.
  textLow: {
    base: '$color11',
    hover: '$color11',
    active: '$color12',
  },
} as const;

export const formInputColors = {
  background: {
    // Was `$color2`, one ramp step below Tamagui's Input, which is
    // `$background`. The argument in the git history was for ONE input
    // surface across the composer, the editor and form fields — `$background`
    // satisfies that argument and survives a surface sub-theme too.
    base: '$background',
    // Still the active/selected highlight for option lists (Combobox, Calendar,
    // TimeColumn) -- inputs themselves no longer shift background on focus.
    focus: '$color4',
  },
  border: {
    base: '$borderColor',
    hover: '$borderColorHover',
    focus: '$borderColorFocus',
  },
} as const;

export const formControlColors = {
  background: '$color5',
  border: '$color7',
  /**
   * Control BOUNDARY tier (WCAG 1.4.11): the outline that must carry
   * a control's shape against the page needs ≥3:1 — `border` ($color7)
   * measured 1.52:1 light / 1.69:1 dark vs page, fine as an inner seam but
   * invisible as the only edge. $color10 is the muted-ink tier (≥3:1 on
   * color1/2 in both schemes). Radio rings use this; single-border controls
   * that rely on their outline alone should too.
   */
  boundary: '$color10',
  thumb: {
    base: '$color10',
    hover: '$color9',
    press: '$color11',
  },
} as const;

/**
 * Selected/checked MARK channel (ONE-EMPHASIS).
 *
 * Every choice control in the field family marks its selection with the ACTIVE
 * ACCENT — the radio dot, the filled rating star and the checked Switch track
 * all resolve here — so a user learns one meaning for the accent instead of
 * decoding a per-control dialect. Ink marks selection nowhere.
 * Marks are non-text chrome, so the floor they must clear is the 3:1
 * graphical-object tier, not the 4.5:1 text tier; text placed ON this fill
 * takes `useReadableTextOn` rather than an assumed anchor.
 */
export const formSelectedColors = {
  mark: '$accentBackground',
} as const;

// Bento switch polarity: accent track when on, light thumb. Separate from
// formControlColors.thumb, which Slider still uses with inverted polarity.
// Checked state uses the accent solid so on/off reads at a glance and
// matches the accent CTAs on the same screen.
export const formSwitchColors = {
  track: {
    on: formSelectedColors.mark,
    off: '$color5',
  },
  thumb: '$color1',
  thumbBorder: '$borderColor',
} as const;

export const formCardColors = {
  background: {
    base: '$color2',
    active: '$color3',
  },
  border: {
    base: '$color6',
    hover: '$color7',
    active: '$color7',
  },
} as const;

/**
 * Dropzone (FileUpload) — bento-derived treatment.
 *
 * `bento-pickers-measured.md` §2/§4: the zone ground is TRANSPARENT, so the
 * dashed edge IS the whole control boundary and takes the legible $color9
 * step (boards media-01..04 measure 1px dashed rgb(77,77,77) light /
 * rgb(133,133,133) dark) — the `$borderColor` hairline tier measured
 * near-invisible as a dash. Picked files ride IN-ZONE rows parted by the
 * same dashed hairline; each row carries a filled $color12 remove disc with
 * the inverse ✕ ($color1). Disc hover/press step back down the ramp so the
 * dark chrome never flashes the light state-layer fills.
 */
export const formDropzoneColors = {
  border: '$color9',
  removeDisc: {
    background: {
      base: '$color12',
      hover: '$color11',
      press: '$color10',
    },
    ink: '$color1',
  },
  // Attachments / media-01 transfer bar: 11px pill, $color4 track,
  // $color11 fill — the same pair the measured attachments row draws.
  progress: {
    track: '$color4',
    fill: '$color11',
  },
} as const;

export const formCommonColors = {
  // Placeholder/muted tier climbed the ramp again (SB-R-03/04 → interact
  // resweep): $color7 measured 1.44-1.69:1 and $color10 3.95-4.36:1 as
  // Select/FileUpload/AwesomeBar placeholder-tier text — under the 4.5:1
  // AA floor for normal text. Step 11 is the lowest passing step; the muted
  // tier now differentiates from `text` by weight/size, not color.
  muted: '$color11',
  text: '$color11',
  // Same AA reason as componentColors.semantic: $red10 is under 4.5:1 for
  // small error text on color1/2 surfaces.
  error: '$red11',
  divider: '$color8',
} as const;
