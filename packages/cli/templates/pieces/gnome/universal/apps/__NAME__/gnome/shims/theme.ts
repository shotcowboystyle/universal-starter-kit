// GNOME-target shim for @repo/theme.
//
// The real barrel re-exports devtools, cookie and audit modules whose
// graphs reach react-dom/server, react-cookie, node:fs and
// @repo/platform (→ expo-constants). None of that belongs in
// a GJS bundle, and several fail at module init.
//
// Re-export only the pure theme-building and knob-resolution subgraph:
// @package/themes needs the theme builders and fonts, and the page-shell
// components need the knob resolver.
//
// Deep `…/src/*` paths rather than the bare package name, which is
// aliased to this file and would loop.

// DEV guardrails (devWarn + warn* helpers). The forms package's shared/
// devWarn re-exports these from THIS barrel, and its Button/Input/Chip
// import them at module scope. Pure console plumbing, no platform deps.
export * from '@repo/theme/src/devWarn';
export * from '@repo/theme/src/font';
// Shared menu-row geometry — DropdownMenu (components shim) reads it at
// module scope. Pure.
export * from '@repo/theme/src/menuRow';
export * from '@repo/theme/src/theme/createDefaultThemeConfig';
export * from '@repo/theme/src/theme/createThemes';
// Focus-visible ring guarantee (pure color math over ./colorRules).
export * from '@repo/theme/src/theme/focusState';
// Hairline width — resolves to hairline.native.ts (RN StyleSheet, which
// the react-native alias backs with the GTK compat package).
export * from '@repo/theme/src/theme/hairline';
// Intent wrapper — DropdownMenu and ConfirmDialog color their rows and
// actions through it. Pure.
export * from '@repo/theme/src/theme/Intent';
export * from '@repo/theme/src/theme/intents';
export * from '@repo/theme/src/theme/knobs';
// Press-target and hairline constants (MIN_PRESS_TARGET, hairline, …) the
// forms Chip and SearchInput read at module scope. Pure numbers/objects.
export * from '@repo/theme/src/theme/layoutTokens';
export * from '@repo/theme/src/theme/PresetContext';
export * from '@repo/theme/src/theme/presets';
// radiusClassProps — imported by layouts/page and the forms Skeleton at
// module scope since the 6.5/6.6 radius-identity wave. Pure.
export * from '@repo/theme/src/theme/radiusClass';
export * from '@repo/theme/src/theme/recipes';
export * from '@repo/theme/src/theme/resolveKnobs';
export * from '@repo/theme/src/theme/shared';
export * from '@repo/theme/src/theme/useResolvedKnobs';
