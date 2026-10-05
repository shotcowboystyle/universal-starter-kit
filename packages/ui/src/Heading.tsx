/**
 * House heading voices for the components catalog — Heading and H1–H6
 * (CURATED-REEXPORT-IS-CATALOG; sibling of ./Text.tsx, see
 * its header for the full architecture note).
 *
 * The raw tamagui headings were knob-dead on native and weight/scale-dead
 * everywhere: headingFont reached them on web only (FontKnobStyles CSS
 * variables), fontWeight and pageTitleScale never. Every composed surface
 * that wanted a knob-correct title had to hand-wire the fragments
 * (PageHeader does exactly that). These shadows spread the fragments as
 * props so the knob channel reaches the TEXT NODE on every platform, with
 * consumer props last (STD-EJECT-LAST — explicit fontWeight/size/fontSize
 * ejects keep working, so PageSection's sectionHeading spread and
 * PageHeader's titleScale eject are unaffected).
 *
 * Knob channels wired here:
 *  - headingFont    → knobProps.heading.fontFamily (every platform)
 *  - fontWeight     → knobProps.heading.fontWeight (regular 400 / bold 700)
 *  - pageTitleScale → knobProps.pageTitle on H1 ONLY (the
 *    page-title step is a pinned dial — moderate $8 = 32px product default,
 *    display $10 = 64px hero opt-in). H2 is a display heading (weight 700
 *    is lawful here). H3–H6 are subordinate: house law pins them to the
 *    mono face at weight 400 — heading
 *    knobs do not restyle them. Section titles composed with the shared
 *    sectionHeading token carry the same mono/400 voice.
 *
 * Raw primitives stay reachable as TamaguiHeading / TamaguiH1..TamaguiH6
 * (./tamagui.ts escape hatches).
 */
import { useResolvedKnobs } from '@repo/theme';
import {
  H1 as RawH1,
  H2 as RawH2,
  H3 as RawH3,
  H4 as RawH4,
  H5 as RawH5,
  H6 as RawH6,
  Heading as RawHeading,
  type HeadingProps,
} from 'tamagui';

export type { HeadingProps };

/** Subordinate heading voice: mono, weight 400. Consumer props still eject. */
const SUBORDINATE_FAMILY = '$mono';
const SUBORDINATE_WEIGHT = '400';

type Weight = HeadingProps['fontWeight'];

/**
 * The heading fragment without its weight, and the weight a heading writes
 * as its last prop, so neither a `size` nor a `fontFamily` variant can paint
 * the font ramp's weight over it (./Text.tsx WEIGHT RIDES LAST).
 * That ramp is why a sized heading swapped to `headingFont: serif` fell from
 * Inter's 600 to the category font's 400.
 */
function useHeadingVoice(fontWeight: Weight) {
  const { knobProps } = useResolvedKnobs();
  const { fontWeight: knobWeight, ...heading } = knobProps.heading;
  return {
    heading,
    pageTitle: knobProps.pageTitle,
    weight: fontWeight ?? (knobWeight as Weight),
  };
}

export function Heading({ fontWeight, ...props }: HeadingProps) {
  const { heading, weight } = useHeadingVoice(fontWeight);
  return <RawHeading {...heading} {...props} fontWeight={weight} />;
}

export function H1({ fontWeight, ...props }: HeadingProps) {
  const { heading, pageTitle, weight } = useHeadingVoice(fontWeight);
  return <RawH1 {...pageTitle} {...heading} {...props} fontWeight={weight} />;
}

export function H2({ fontWeight, ...props }: HeadingProps) {
  const { heading, weight } = useHeadingVoice(fontWeight);
  return <RawH2 {...heading} {...props} fontWeight={weight} />;
}

export function H3({ fontWeight, ...props }: HeadingProps) {
  return <RawH3 fontFamily={SUBORDINATE_FAMILY} {...props} fontWeight={fontWeight ?? SUBORDINATE_WEIGHT} />;
}

export function H4({ fontWeight, ...props }: HeadingProps) {
  return <RawH4 fontFamily={SUBORDINATE_FAMILY} {...props} fontWeight={fontWeight ?? SUBORDINATE_WEIGHT} />;
}

export function H5({ fontWeight, ...props }: HeadingProps) {
  return <RawH5 fontFamily={SUBORDINATE_FAMILY} {...props} fontWeight={fontWeight ?? SUBORDINATE_WEIGHT} />;
}

export function H6({ fontWeight, ...props }: HeadingProps) {
  return <RawH6 fontFamily={SUBORDINATE_FAMILY} {...props} fontWeight={fontWeight ?? SUBORDINATE_WEIGHT} />;
}
