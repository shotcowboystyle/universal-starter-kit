import { defaultFonts } from './fonts';

/**
 * Category fonts merged into createDefaultThemeConfig UNDER consumer
 * heading/body overrides. FontKnobStyles looks these up as `$serif` etc.
 * so headingFont=serif writes `--f-family` even when the app only customizes
 * heading/body (SHC console Operator).
 *
 * Picked out of `defaultFonts` rather than built a second time: two
 * construction paths meant `$mono` could be registered from one stack here
 * and another there, which is the same one-source failure as the category-font collapse.
 */
export const defaultCategoryFonts = {
  serif: defaultFonts.serif,
  mono: defaultFonts.mono,
  slab: defaultFonts.slab,
  rounded: defaultFonts.rounded,
  condensed: defaultFonts.condensed,
  cursive: defaultFonts.cursive,
  handwriting: defaultFonts.handwriting,
  pixel: defaultFonts.pixel,
  blackletter: defaultFonts.blackletter,
  geometric: defaultFonts.geometric,
};
