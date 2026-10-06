import type { FontCategory } from './knobs';

/**
 * The one concrete family stack per headingFont/bodyFont category.
 *
 * Both paths read THIS table, so a stop cannot render one face through the
 * registered font and another through the CSS fallback:
 *
 *  - `defaults/fonts.ts` builds the registered `$serif` / `$mono` / … fonts
 *    from it (the path the knob takes on every platform).
 *  - `FontKnobStyles` falls back to it for `--f-family` when a consumer's
 *    config has no font registered for the category (live SHC console had
 *    the style tag and skipped the family).
 *
 * Distinct FIRST families throughout, because a text-node measurement reads
 * the first resolvable name — three stops that all begin at a system
 * fallback is the defect this guards against.
 *
 * Tracks `packages/config/fonts.ts` (serif/mono/geometric are system aliases,
 * the rest are shipped webfonts). `mono` is the one deliberate widening: the
 * template's bare `monospace` keyword leaves the face to the UA, so this
 * names the platform faces ahead of it and keeps the keyword last.
 */
export const fontCategoryStacks: Record<FontCategory, string> = {
  'sans-serif': 'Inter, -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: "Georgia, 'Times New Roman', Times, serif",
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  slab: "'Roboto Slab', 'Rockwell', 'Courier New', serif",
  rounded: "'Nunito', 'Varela Round', system-ui, sans-serif",
  condensed: "'Roboto Condensed', 'Arial Narrow', sans-serif",
  cursive: "'Dancing Script', 'Pacifico', cursive",
  handwriting: "'Caveat', 'Patrick Hand', 'Comic Sans MS', cursive",
  pixel: "'Silkscreen', 'Press Start 2P', monospace",
  blackletter: "'UnifrakturCook', 'Fraktur', serif",
  geometric: "'Futura', 'Poppins', 'Century Gothic', sans-serif",
};
