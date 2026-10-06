/**
 * Native no-op. React Native has no CSS variables, so the web-only
 * `.font_heading` / `.font_body` --f-family override cannot apply. On native,
 * components consume the font knobs through `knobProps.heading` /
 * `knobProps.body` from useResolvedKnobs (see e.g. public/components
 * layouts/page.tsx).
 */
import type { FontCategory } from './knobs';

// oxlint-disable-next-line react-doctor/only-export-components -- native twin of FontKnobStyles.tsx: it must export the same non-component helpers
export const getConfiguredFontFamily = (_category: FontCategory): string | undefined => undefined;

// oxlint-disable-next-line react-doctor/only-export-components -- native twin of FontKnobStyles.tsx: it must export the same non-component helpers
export const buildFontKnobCss = (
  _headingFont: FontCategory,
  _bodyFont: FontCategory,
  _resolveFamily?: (category: FontCategory) => string | undefined,
): string => '';

export const FontKnobStyles = () => null;
