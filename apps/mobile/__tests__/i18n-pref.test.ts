import AsyncStorage from '@react-native-async-storage/async-storage';
import { describe, it, expect, vi } from 'vitest';

import { loadLanguagePreference, saveLanguagePreference } from '@/lib/language';

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

describe('i18n language preference', () => {
  it('should save and load language preference', async () => {
    vi.mocked(AsyncStorage.setItem).mockResolvedValue();
    vi.mocked(AsyncStorage.getItem).mockResolvedValue('de');

    await saveLanguagePreference('de');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('language-preference', 'de');

    const lang = await loadLanguagePreference();
    expect(lang).toBe('de');
  });

  it('should return null when no preference saved', async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(null);

    const lang = await loadLanguagePreference();
    expect(lang).toBeNull();
  });
});
