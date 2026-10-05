# @repo/theme

The theming engine for this monorepo: Tamagui color themes plus the **knobs
system** — structural styling (radius, spacing, elevation, typography, animation)
resolved independently of color, so one knob flip restyles a whole screen.

## Usage in this monorepo

Private workspace package. Add `"@repo/theme": "workspace:*"` to the
consuming package's `dependencies`.

Requires `react` and `tamagui` as peers.

## What it owns

- **Knobs** — `useResolvedKnobs()`, `resolveKnobs()` (the only canonical mapping
  from abstract knobs to Tamagui props), knob types and defaults
- **Presets** — `<Preset preset="…" theme="…">` bundles knobs + intents + theme;
  nested presets cascade, `overrides` merge by key
- **Intents** — contextual overrides (`error`, `accent`, `warning`, `success`),
  including intent + component overrides
- **Recipes** — control/text/elevation state recipes (hover, press, focus-visible)
- **Optics** — the `cornerSmoothing` knob (`round` | `smooth` squircle corners:
  web progressive enhancement via CSS `corner-shape: squircle`, computed
  `superellipse(2)` on Chromium 152; native stays round),
  `hairline` separator treatments (0.5 device-pixel rules with a 1px low-DPI
  fallback), and tracking-by-size in the default font faces
- **Chart palette** — `useChartPalette()`: identity-led series colors
  (single-series = theme identity, categorical cycle, semantic ramps) that
  re-anchor under tints; explicit data colors always pass through
- Theme creation (`createThemes`, `createDefaultThemeConfig`), `Tint`, layout
  tokens, focus state, cookie persistence for SSR-safe knobs

## What it must not do

- No app screens and no component catalog — components live in
  `@repo/ui`, fields in `@repo/forms`

## Usage

```tsx
import { useResolvedKnobs } from '@repo/theme';
import { View } from '@repo/ui';

export function Surface({ intent, compact, ...props }) {
  const { knobProps, control } = useResolvedKnobs({ intent, component: 'Button', compact });
  return (
    <View
      {...knobProps.surface}
      {...knobProps.borderRadius}
      {...knobProps.panelPadding}
      {...knobProps.gap}
      hoverStyle={{ ...control.hoverKnobProps }}
      pressStyle={{ ...control.pressKnobProps }}
      {...props}
    />
  );
}
```

Rules that keep knobs sound:

- Always spread complete `knobProps.*` fragments — never cherry-pick resolved tokens.
- Consumer `{...props}` spread last (the only styling eject).
- Resolution order: Preset → intent → intent+component → size → density →
  reduced-motion → `resolveKnobs()` override callback.

A surface that only reaches part of the theme matrix ships only that part.
Themes are CSS in the served document, so the full 1,580-theme matrix is paid
for on every page. `subset` filters which themes exist, never what one
contains:

```ts
import { createDefaultThemeConfig } from '@repo/theme';

export const themeConfig = createDefaultThemeConfig({
  subset: {
    components: ['Button', 'Input', 'TextArea', 'Card', 'ListItem'],
    tints: ['accent', 'active', 'alt1', 'alt2', 'error', 'success', 'warning'],
  },
});
```

A dropped component sub-theme does not crash, it renders in its parent's
colours, so list everything the surface renders and enters. `subsetThemes`
is the same filter as a pure function over a built matrix.

## License

Apache-2.0

Derived from [multiplatform.one](https://multiplatform.one) (Apache-2.0). See the package LICENSE and the repository NOTICE.
