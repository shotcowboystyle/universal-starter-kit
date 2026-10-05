import { forceUpdateThemes, getConfig, setConfig } from '@tamagui/web';

import type { ThemeConfig } from './shared';

/**
 * Make `themeConfig` the config Tamagui resolves theme names against.
 *
 * `createTamagui` installs every config it builds as the global one, and
 * `TamaguiProvider` never replaces it, so once two configs are loaded (the
 * full house config and its subset) the one created last wins whichever
 * config the provider is handed. Tamagui also caches resolved theme names,
 * so the cache is dropped here too: without that a name the new config lacks
 * keeps resolving to the old config's theme. Returns false when `themeConfig`
 * is already the active one.
 */
export function activateThemeConfig(themeConfig: ThemeConfig): boolean {
  if (getConfig() === themeConfig.tamagui) {
    return false;
  }
  setConfig(themeConfig.tamagui);
  forceUpdateThemes();
  return true;
}
