import type { FontLoader, FontLoaderConfig } from './types';

export function createFontLoader(config: FontLoaderConfig): FontLoader {
  const fontMap: Record<string, number> = {};
  if (config.inter) {
    fontMap.Inter = require('@tamagui/font-inter/otf/Inter-Medium.otf');
    fontMap.InterBold = require('@tamagui/font-inter/otf/Inter-Bold.otf');
  }
  for (const font of config.fonts) {
    if (font.nativeModule) {
      fontMap[font.family] = font.nativeModule;
    }
  }
  return { importFonts: () => fontMap };
}
