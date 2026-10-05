/**
 * The themes one surface can reach.
 *
 * Themes are emitted into the served document as CSS, so a surface pays for
 * every theme it will never enter. Measured on a live storefront:
 * 721,818 of 1,232,058 decompressed bytes were the theme sheet, 921 classes of
 * which the rendered routes asked for seven, and building the same house
 * config over a named subset cut the sheet from 697,788 to 186,158 bytes
 * (`shc/packages/themes/storefront.ts`). This is that subset as a pure
 * function over the built matrix, so every app can do it the same way.
 *
 * It filters WHICH themes exist, never what a theme contains: `$color5` means
 * the same thing in every theme that survives. A subset is a loaded gun, all
 * the same. A component whose sub-theme was dropped does not crash, it renders
 * in its parent's colours, so list everything the surface renders.
 */
export interface ThemeSubset {
  /**
   * Component sub-themes the surface renders, by Tamagui componentName
   * (`Button`, `Input`, `ListItem`, `SelectTrigger`, …). Tamagui enters one
   * by rendering the component, so this is "which components exist on this
   * surface", not a style choice.
   */
  components: readonly string[];
  /**
   * Named themes the surface can enter beside the bare `light`/`dark`
   * schemes: `accent`, the semantic children (`error`, `success`,
   * `warning`), Tamagui's state children (`active`, `alt1`, `alt2`), and any
   * decorative hue a `theme="…"` or `<Theme name="…">` on the surface names.
   */
  tints: readonly string[];
}

const SCHEMES = new Set(['light', 'dark']);

/**
 * Keep a theme when its component suffix (if any) is in `components` and
 * every other non-scheme segment of its name is in `tints`. Names are
 * `[light|dark_]<tint>*[_Component]`, so `light` and `dark` always survive.
 */
export function subsetThemes<T>(themes: Record<string, T>, subset: ThemeSubset): Record<string, T> {
  const components = new Set(subset.components);
  const tints = new Set(subset.tints);
  const kept: Record<string, T> = {};
  for (const [name, theme] of Object.entries(themes)) {
    const segments = name.split('_');
    const last = segments[segments.length - 1] ?? '';
    if (/^[A-Z]/.test(last)) {
      segments.pop();
      if (!components.has(last)) {
        continue;
      }
    }
    if (segments.some((segment) => !SCHEMES.has(segment) && !tints.has(segment))) {
      continue;
    }
    kept[name] = theme;
  }
  return kept;
}
