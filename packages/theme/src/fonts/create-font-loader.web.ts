import type { FontLoader, FontLoaderConfig } from './types';

export function createFontLoader(_config: FontLoaderConfig): FontLoader {
  // On web, Inter is intentionally NOT loaded here. This module previously
  // side-effect imported @tamagui/font-inter/css/{400,700}.css, which embed
  // the faces as base64 woff (font-display: block) — ~270 KB that vite
  // bundles into every consumer's render-blocking extracted CSS (measured
  // 2026-08-12: ~200 KB gz of the SPA's style.css and ~195 KB gz of the
  // storybook iframe CSS were these two faces), duplicating the woff2
  // binaries the shells already preload and letting the later base64
  // declaration win the cascade over the preloaded files.
  //
  // Per FONT-STABLE-MOUNT the app shell owns the fonts: declare
  // @font-face with font-display: optional + preload the woff2 binaries in
  // the document head (see the app's index.html, apps/storybook
  // .storybook/preview-head.html, and core's CreateRootLayout.web.tsx
  // `interFonts` head flag). Custom font CSS must likewise be imported by
  // the consumer shell, not by this package.
  return { importFonts: () => ({}) };
}
