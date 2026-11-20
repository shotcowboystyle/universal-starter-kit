import type { FontLoader, FontLoaderConfig } from './types';

export const createFontLoader = (config: FontLoaderConfig): FontLoader => {
  const fontMap: Record<string, number> = {};
  if (config.inter) {
    // oxlint-disable-next-line typescript/no-unsafe-assignment, node/global-require, unicorn/prefer-module -- Metro resolves native font assets only through static require()
    fontMap.Inter = require('@tamagui/font-inter/otf/Inter-Medium.otf');
    // oxlint-disable-next-line typescript/no-unsafe-assignment, node/global-require, unicorn/prefer-module -- Metro resolves native font assets only through static require()
    fontMap.InterBold = require('@tamagui/font-inter/otf/Inter-Bold.otf');
  }
  for (const font of config.fonts) {
    if (font.nativeModule !== undefined && font.nativeModule !== 0) {
      fontMap[font.family] = font.nativeModule;
    }
  }
  return { importFonts: () => fontMap };
};
