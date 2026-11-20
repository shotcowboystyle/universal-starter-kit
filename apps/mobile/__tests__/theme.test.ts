import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { loadThemePreference, saveThemePreference, applyThemePreference } from '@/lib/theme';

vi.mock(import('@react-native-async-storage/async-storage'), () => ({
  default: {
    getItem: vi.fn<typeof AsyncStorage.getItem>(),
    setItem: vi.fn<typeof AsyncStorage.setItem>(),
    removeItem: vi.fn<typeof AsyncStorage.removeItem>(),
    mergeItem: vi.fn<typeof AsyncStorage.mergeItem>(),
    clear: vi.fn<typeof AsyncStorage.clear>(),
    getAllKeys: vi.fn<typeof AsyncStorage.getAllKeys>(),
    flushGetRequests: vi.fn<typeof AsyncStorage.flushGetRequests>(),
    multiGet: vi.fn<typeof AsyncStorage.multiGet>(),
    multiSet: vi.fn<typeof AsyncStorage.multiSet>(),
    multiRemove: vi.fn<typeof AsyncStorage.multiRemove>(),
    multiMerge: vi.fn<typeof AsyncStorage.multiMerge>(),
  },
}));

vi.mock(import('react-native'), () => ({
  Appearance: {
    setColorScheme: vi.fn<typeof Appearance.setColorScheme>(),
    getColorScheme: vi.fn<typeof Appearance.getColorScheme>(),
    addChangeListener: vi.fn<typeof Appearance.addChangeListener>(),
  },
}));

describe('theme utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should load theme preference', async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue('light');
    const pref = await loadThemePreference();
    expect(pref).toBe('light');
  });

  it('should return default dark if nothing stored', async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(null);
    const pref = await loadThemePreference();
    expect(pref).toBe('dark');
  });

  it('should save theme preference', async () => {
    await saveThemePreference('system');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('theme-preference', 'system');
  });

  it('should apply theme preference', () => {
    applyThemePreference('light');
    expect(Appearance.setColorScheme).toHaveBeenCalledWith('light');
  });
});
