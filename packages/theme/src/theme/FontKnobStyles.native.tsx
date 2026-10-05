/**
 * Native no-op. React Native has no CSS variables, so the web-only
 * `.font_heading` / `.font_body` --f-family override cannot apply. On native,
 * components consume the font knobs through `knobProps.heading` /
 * `knobProps.body` from useResolvedKnobs (see e.g. public/components
 * layouts/page.tsx).
 */
import type { FontCategory } from './knobs';

export function getConfiguredFontFamily(_category: FontCategory): string | undefined {
  return undefined;
}

export function buildFontKnobCss(
  _headingFont: FontCategory,
  _bodyFont: FontCategory,
  _resolveFamily?: (category: FontCategory) => string | undefined,
): string {
  return '';
}

export function FontKnobStyles() {
  return null;
}
