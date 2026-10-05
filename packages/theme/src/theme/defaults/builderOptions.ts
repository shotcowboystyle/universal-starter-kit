import {
  contrastRatio,
  minContrastRatio,
  normalizeToHex,
  pickReadableForeground,
  relativeLuminance,
} from '../colorRules';
import type { CreateThemesBuilderOptions, GetThemeProps } from '../createThemes';

/**
 * Axiom 12 — resolve a solid `$outlineColor` for the keyboard
 * focus-visible ring that clears the ≥3:1 contrast floor against BOTH page
 * surfaces (color1/color2) in this scheme's own ramp. The house themes never
 * set `$outlineColor`, so it fell through to Tamagui's stock 20%-alpha ink
 * (measured 1.36:1) — every keyboard user got a near-invisible ring.
 *
 * Steps are tried strongest-visible-first; the first that clears 3:1 vs both
 * page steps wins, else the highest-contrast candidate. The ring sits offset
 * outside the control on the page, so page contrast is the governing pair.
 */
function pickFocusRingColorFromSteps(step: (n: number) => string | undefined): string {
  const fallback = step(11) ?? step(12) ?? step(9) ?? 'transparent';
  const bg1 = normalizeToHex(step(1) ?? '');
  const bg2 = normalizeToHex(step(2) ?? '');
  if (!bg1 || !bg2) {
    return fallback;
  }
  const l1 = relativeLuminance(bg1);
  const l2 = relativeLuminance(bg2);
  // Prefer a strong-but-not-ink neutral so the ring is clearly visible in both
  // schemes without reading as heavy black/white text.
  const candidates = [11, 10, 9, 12, 8];
  let best = fallback;
  let bestMin = 0;
  for (const key of candidates) {
    const raw = step(key);
    const hex = raw ? normalizeToHex(raw) : null;
    if (!raw || !hex) {
      continue;
    }
    const l = relativeLuminance(hex);
    const minC = Math.min(contrastRatio(l, l1), contrastRatio(l, l2));
    if (minC >= minContrastRatio) {
      return raw;
    }
    if (minC > bestMin) {
      bestMin = minC;
      best = raw;
    }
  }
  return best;
}

function pickFocusRingColor(theme: Record<string, string>): string {
  return pickFocusRingColorFromSteps((n) => theme[`color${n}`]);
}

function getBaseTheme(theme: Record<string, string>) {
  return {
    // Solid, scheme-aware focus ring (≥3:1 vs page surfaces).
    // Additive — Tamagui's own ring is `rgba(ink, 0.2)`, which measured
    // 1.36:1. This is an improvement and stays (M5).
    outlineColor: pickFocusRingColor(theme),
    // Align placeholder/disabled text with the dedicated muted slot.
    placeholderColor: theme.color10,
    //
    // SEVEN LINES DELETED HERE, deliberately.
    //
    // `backgroundPress: color5`, `backgroundFocus: color6`,
    // `backgroundActive: color4`, `borderColor: color5`,
    // `borderColorHover: color6`, `borderColorFocus: color7` and
    // `borderColorPress: color7` used to sit in this object, re-anchoring
    // Tamagui's whole interaction ramp one to three steps deeper. The only
    // justification written down was "Normalize interaction ramp across
    // components", and uniformity is an argument for HAVING a ramp, not for
    // these values. The effect was that every mpo border read heavier and
    // every focus fill landed darker than the same component in Tamagui.
    //
    // The theme builder's own templates already derive all seven from the
    // background index, so deleting the pins does not leave a hole: it hands
    // the keys back to the layer that owns them. If uniformity is wanted
    // again, it gets re-derived from the template offsets rather than pinned
    // as literal ramp steps.
    //
    // The semantic aliases below are a different thing and stay: they name
    // slots Tamagui has no token for at all, so they contradict nothing.
    // Project-level semantic aliases for palette slots not covered by Tamagui defaults.
    // textMuted sits on the $color11 tier: the lowest ramp step that keeps
    // secondary text AA-readable on color1/2 surfaces (SB-R contrast sweep).
    textMuted: theme.color11,
    textSubtle: theme.color6,
    borderStrong: theme.color7,
    borderStrongHover: theme.color8,
    borderStrongPress: theme.color6,
    surfaceStrong: theme.color7,
    surfaceMuted: theme.color10,
    surfacePressStrong: theme.color6,
  };
}

// Semantic intents whose Buttons render SOLID (one emphasis system with
// accent — SB-E-01). The accent theme is solid by palette shape already.
const solidIntentParents = new Set(['error', 'warning', 'success']);

/**
 * Adjust a background's lightness until it clears WCAG AA (4.5:1) against
 * the given foreground. Steps away from the foreground's lightness 1.5% at a
 * time; bails (returns the original) on unparseable colors.
 */
function clampBgForReadableText(bgRaw: string, fgRaw: string): string {
  const fgHex = normalizeToHex(fgRaw);
  let bgHex = normalizeToHex(bgRaw);
  if (!fgHex || !bgHex) {
    return bgRaw;
  }
  const fgLum = relativeLuminance(fgHex);
  const hslMatch = bgRaw.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/);
  if (!hslMatch) {
    return bgRaw;
  }
  const h = Number(hslMatch[1]);
  const s = Number(hslMatch[2]);
  let l = Number(hslMatch[3]);
  const dir = fgLum > relativeLuminance(bgHex) ? -1 : 1;
  for (let i = 0; i < 24; i++) {
    if (contrastRatio(fgLum, relativeLuminance(bgHex)) >= 4.5) {
      break;
    }
    l = Math.min(100, Math.max(0, l + dir * 1.5));
    const next = normalizeToHex(`hsl(${h}, ${s}%, ${l}%)`);
    if (!next) {
      return bgRaw;
    }
    bgHex = next;
  }
  return `hsl(${h}, ${s}%, ${l}%)`;
}

export const defaultBuilderOptions: CreateThemesBuilderOptions = {
  getTheme: ({ name, theme, palette }: GetThemeProps): Record<string, string> => {
    // Component sub-themes (t_Card, t_ListItem, t_Button, ...) are narrow
    // templates -- background/color steps only, NO colorN/border tokens. An
    // element inside one that sets borderColor="$borderColor" resolves
    // nothing and CSS falls back to currentColor: near-black borders on
    // every bordered card/row. Anchor border tokens from the scheme
    // palette (padded shape: [(len-12)/2 alpha anchors] + 12 colors +
    // [anchors]; colorN = colors[N-1]).
    if (!theme.color5) {
      if (!palette) {
        return {};
      }
      const colors0 = Math.max(0, Math.floor((palette.length - 12) / 2));
      const step = (i: number): string => palette[colors0 + i] ?? 'transparent';
      // Component sub-theme templates (t_Input, t_Button, ...) carry
      // Tamagui's stock 20%-alpha `outlineColor`, which silently overrides the
      // base theme's solid ring inside those scopes. Re-derive the solid,
      // scheme-aware ring from this sub-theme's own palette steps.
      const outlineColor = pickFocusRingColorFromSteps((n) => step(n - 1));

      // Solid semantic-intent Buttons (light_error_Button, dark_warning_Button,
      // ...): surface on the hue's step 11 with a LUMINANCE-COMPUTED foreground
      // (Axiom 15) — the hue's step-1 or step-12 anchor, whichever
      // reads better on the resting fill. The sub-theme `color` carries it so
      // labels ($color via useResolvedKnobs), icons (currentColor) and any
      // inherited text all pair correctly. Every interaction fill is then
      // darkened/lightened until it holds that foreground at the 4.5 AA floor.
      const parts = name.split('_');
      if (parts[parts.length - 1] === 'Button' && solidIntentParents.has(parts[parts.length - 2])) {
        const scheme = parts[0];
        // Luminance-computed on-fill foreground (Axiom 15): the hue's step-1
        // (pale) or step-12 (deep) anchor, whichever reads better on the fill.
        const fg = pickReadableForeground(step(10), step(0), step(11));
        const bg = clampBgForReadableText(step(10), fg);
        const hover = clampBgForReadableText(scheme === 'light' ? step(9) : step(11), fg);
        const press = clampBgForReadableText(scheme === 'light' ? step(11) : step(9), fg);
        return {
          outlineColor,
          background: bg,
          backgroundHover: hover,
          backgroundPress: press,
          backgroundFocus: hover,
          color: fg,
          colorHover: fg,
          colorPress: fg,
          colorFocus: fg,
          borderColor: bg,
          borderColorHover: hover,
          borderColorFocus: hover,
          borderColorPress: press,
        };
      }

      return {
        outlineColor,
        borderColor: step(4),
        borderColorHover: step(5),
        borderColorFocus: step(6),
        borderColorPress: step(6),
      };
    }
    return getBaseTheme(theme);
  },
};
