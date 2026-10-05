import type { GenericFont } from '@tamagui/web';
import { createFont } from '@tamagui/web';

import { bodyFontLineHeights, bodyFontSizes, bodyLineHeightPx, categoryLineHeights } from './theme/defaults/fonts';

const defaults = {
  // The era's `$body` ladder, including `true`. A missing `true` key is what
  // collapsed `$serif`/`$mono`/`$rounded` to -apple-system 14px/normal on the
  // label text node; a DIFFERENT ladder is the follow-on defect —
  // a family knob that also resizes the label is still moving type off the
  // ramp. A consumer font registered through this helper lands exactly where
  // the built-in category fonts do.
  size: bodyFontSizes,
  // Floored at the generic body ratio. `createDefaultFont` does not
  // know which category it is building, so it takes the sans-serif floor;
  // `defaults/fonts.ts` applies the per-category ones.
  lineHeight: categoryLineHeights('sans-serif'),
  // Neutral by default: tracking is a per-family function of size,
  // so a shared constant table is always wrong for someone — the previous
  // Inter-ish table leaked +3px tracking into mono/script faces at $5/$6.
  // Explicit zeros, not
  // an empty table: an empty table emits no `--f-letterSpacing-*` and the
  // value falls through to the `:root` Inter curve.
  letterSpacing: Object.fromEntries(Object.keys(bodyFontSizes).map((k) => [k, 0])) as Record<string | number, number>,
  // The era's body weight. Was 300, which is off the reference's 400 label
  // weight in the light direction and made a bodyFont flip change weight.
  weight: {
    4: '400',
  } as const,
};

export function createDefaultFont<A extends GenericFont>(font: Partial<A> & { family: A['family'] }): A {
  const size = font.size || defaults.size;
  const lineHeight =
    size === defaults.size
      ? defaults.lineHeight
      : (Object.fromEntries(
          Object.entries(size).map(([k, v]) => [
            k,
            typeof v === 'number' ? (bodyFontLineHeights[k] ?? bodyLineHeightPx(v)) : v,
          ]),
        ) as typeof size);
  return createFont({
    lineHeight,
    letterSpacing: defaults.letterSpacing,
    weight: defaults.weight,
    ...font,
    size,
  } as unknown as A);
}
