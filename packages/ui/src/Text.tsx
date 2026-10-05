/**
 * House body-text voices for the components catalog — Text, SizableText,
 * Paragraph and Anchor.
 *
 * Before this module the barrel re-exported the RAW tamagui typography
 * primitives under bare names, registered as "typography substrate" rows in
 * ./knobImmuneExports.ts. That registry claim was a lie in three parts:
 * FontKnobStyles rescues family/leading/tracking on WEB ONLY (CSS variables),
 * fontWeight and textAccent reach the primitives on NO platform, and on
 * native nothing reaches them at all. The rule "never render app text through
 * bare typography" was unfollowable — there was no house Text to follow it
 * with.
 *
 * ARCHITECTURE (Button/Spinner shadow precedent): the thinnest legal shape
 * is a wrapper that spreads the COMPLETE knob fragments onto the raw
 * primitive and forwards consumer props LAST (STD-EJECT-LAST). The
 * fragments are props, not CSS, so the same code path styles web AND native
 * — the text node itself carries fontFamily/fontWeight/color on every
 * platform (the frame is not the text node).
 *
 * WEIGHT RIDES LAST. `size` and `fontFamily` are variants on the
 * raw primitive, and tamagui's getFontSized writes the font ramp's weight
 * (`var(--f-weight-N)`) at the position that key holds in the props object.
 * A knob weight spread before a consumer `size` lost to it, and a consumer
 * `fontWeight` sat at the knob's position too, since a spread key keeps its
 * first slot. So the weight is split off the fragment and written as the
 * final prop: the knob's, or the consumer's when one is passed.
 *
 * Knob channels wired here:
 *  - bodyFont   → knobProps.body.fontFamily  (every platform, not just web)
 *  - fontWeight → knobProps.body.fontWeight  (regular 400 / bold 700 —
 *    500/600 are not label weights)
 *  - textAccent → knobProps.textAccentColor  (high $color / medium+low
 *    $color11, the AA legibility floor) on Text/SizableText/Paragraph.
 *  - link ink → Anchor paints the accent, as the most chromatic step of the
 *    theme's accent ramp that still clears AA on both page surfaces
 *    (`useAccentOnSurface`). House Text owns link chrome (Clay 2026-09-26);
 *    a consumer `color` still ejects.
 *
 * Default body/label ramp (the $4 / $true
 * stop): 14px / 25px / 400. createInterFont's size+10 table yields 14/24;
 * house Text and Paragraph pin the measured 14/25 pair as props on the
 * TEXT NODE so the leading lands on every platform. SizableText keeps the
 * size-token scale. Consumer size/lineHeight/fontWeight ejects still win.
 *
 * Raw primitives stay reachable as TamaguiText / TamaguiSizableText /
 * TamaguiParagraph / TamaguiAnchor (./tamagui.ts escape hatches).
 */
import { useAccentOnSurface, useResolvedKnobs } from '@repo/theme';
import {
  Anchor as RawAnchor,
  type AnchorProps,
  Paragraph as RawParagraph,
  type ParagraphProps,
  SizableText as RawSizableText,
  type SizableTextProps,
  Text as RawText,
  type TextProps,
} from 'tamagui';

export type { AnchorProps, ParagraphProps, SizableTextProps, TextProps };

/** Measured $4 label ramp — Inter 14/25, weight from the fontWeight knob. */
const LABEL_RAMP = { fontSize: 14, lineHeight: 25 } as const;

type Weight = TextProps['fontWeight'];

/** The body fragment without its weight, and the weight a voice writes last. */
function useBodyVoice(fontWeight: Weight) {
  const { knobProps } = useResolvedKnobs();
  const { fontWeight: knobWeight, ...body } = knobProps.body;
  return {
    body,
    color: knobProps.textAccentColor,
    weight: fontWeight ?? (knobWeight as Weight),
  };
}

export function Text({ fontWeight, ...props }: TextProps) {
  const { body, color, weight } = useBodyVoice(fontWeight);
  return <RawText {...LABEL_RAMP} {...body} color={color} {...props} fontWeight={weight} />;
}

export function SizableText({ fontWeight, ...props }: SizableTextProps) {
  const { body, color, weight } = useBodyVoice(fontWeight);
  return <RawSizableText {...body} color={color} {...props} fontWeight={weight} />;
}

export function Paragraph({ fontWeight, ...props }: ParagraphProps) {
  const { body, color, weight } = useBodyVoice(fontWeight);
  return <RawParagraph {...LABEL_RAMP} {...body} color={color} {...props} fontWeight={weight} />;
}

export function Anchor({ fontWeight, ...props }: AnchorProps) {
  const { body, weight } = useBodyVoice(fontWeight);
  const linkInk = useAccentOnSurface();
  return <RawAnchor {...body} color={linkInk} {...props} fontWeight={weight} />;
}
