import { sizeRecipeForToken } from '@repo/theme';
import { isWeb } from 'tamagui';

/**
 * Switch footprint. The recipe height is the control ROW and
 * the press target (44 at `$4`); the painted switch is a glyph inside it, so
 * it takes the platform switch's own fraction of that height:
 *
 * - web: Tamagui's Switch, `getSwitchHeight` = size × 0.65 at a 2:1 aspect,
 *   thumb filling the track (tamagui.dev `$4` = 58 × 29, thumb 29).
 * - native: UISwitch's 51 × 31 pt track at the 44 medium stop (Material 3's
 *   52 × 32 sits inside the same 10 percent), Tamagui's thumb filling it: 29 pt.
 *
 * Painting the whole recipe height is what made `$4` an 86 × 44 slab once
 * the recipe was lifted from 32 to Tamagui's 44.
 */
const webSwitch = { heightRatio: 0.65, aspect: 2, rimGutter: 0 };
const nativeSwitch = { heightRatio: 31 / 44, aspect: 51 / 31, rimGutter: 1 };

export interface SwitchFootprint {
  trackHeight: number;
  trackWidth: number;
  /** Track height inside its border: the lane the thumb rides in. */
  thumbSlot: number;
  thumbInset: number;
  thumbSize: number;
  /** Thumb travel from off to on. */
  travel: number;
}

export function switchFootprint(sizeToken: string, borderWidth: number): SwitchFootprint {
  const platform = isWeb ? webSwitch : nativeSwitch;
  const trackHeight = Math.round(sizeRecipeForToken(sizeToken).height * platform.heightRatio);
  const trackWidth = Math.round(trackHeight * platform.aspect);
  const thumbSlot = trackHeight - borderWidth * 2;
  const thumbInset = Math.max(0, platform.rimGutter - borderWidth);
  return {
    trackHeight,
    trackWidth,
    thumbSlot,
    thumbInset,
    thumbSize: thumbSlot - thumbInset * 2,
    travel: trackWidth - borderWidth * 2 - thumbSlot,
  };
}
