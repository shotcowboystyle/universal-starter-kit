# @repo/storybook

Storybook glue for this monorepo: a cross-platform `action()` helper and
`createPreview()`, which wires themes, knobs, and i18n into Storybook globals
so every story runs inside the real app providers.

## Usage in this monorepo

Private workspace package. Add `"@repo/storybook": "workspace:*"` to the
consuming package's `devDependencies`.

Peers include `storybook`,
`@storybook-community/storybook-dark-mode`, `@repo/theme`, and
`tamagui`.

## What it owns

- **`action(name)`** — platform-split: re-exports `storybook/actions`
  (Storybook 10 merged addon-actions into core) on web; on native (Expo/Metro) provides a console-logging mirror so shared
  `.stories.tsx` files work on device
- **`createPreview(options)`** — builds a Storybook `Preview` with the
  framework decorator: theme + knob toolbar globals (preset, radius, space,
  elevation, …), dark-mode sync, and language switching. Pass `themeConfigs`
  (e.g. `{ subset: subsetThemeConfig }`) and a `tamaguiConfig` toolbar global
  renders any story under one of them instead of `themeConfig` (`full`, the
  default); each must build a subset of `themeConfig`'s themes
- Channel events: `themeColorsChannelEvent`, `themeColorsOppositeChannelEvent`

## What it must not do

- No stories and no components — those live next to the code they cover

## Usage

```ts
// .storybook/preview.tsx
import { createPreview } from '@repo/storybook';
import { AppProvider } from './appProvider'; // your app's root provider component
import { themeConfig } from './theme'; // produced by createDefaultThemeConfig() from @repo/theme
import { i18n } from './i18n';

export default createPreview({ themeConfig, i18n, AppProvider });
```

```ts
// any .stories.tsx (works on web and native)
import { action } from '@repo/storybook';

export const Basic = {
  args: { onPress: action('pressed') },
};
```

## License

Apache-2.0

Derived from [multiplatform.one](https://multiplatform.one) (Apache-2.0). See the package LICENSE and the repository NOTICE.
