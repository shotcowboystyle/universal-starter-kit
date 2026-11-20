import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

export type ThemePreference = 'light' | 'dark' | 'system';

const THEME_KEY = 'theme-preference';

export const loadThemePreference = async (): Promise<ThemePreference> => {
  const stored = await AsyncStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'dark';
};

export const saveThemePreference = async (pref: ThemePreference): Promise<void> => {
  await AsyncStorage.setItem(THEME_KEY, pref);
};

export const applyThemePreference = (pref: ThemePreference): void => {
  const colorScheme: 'light' | 'dark' | null = pref === 'system' ? null : pref;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: RN accepts null at runtime to reset to the system scheme; its typings omit it
  Appearance.setColorScheme(colorScheme as Parameters<typeof Appearance.setColorScheme>[0]);
};
