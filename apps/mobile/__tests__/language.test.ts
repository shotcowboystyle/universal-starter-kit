import AsyncStorage from '@react-native-async-storage/async-storage';
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

describe('language utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should load language preference', async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue('en');
    const lang = await loadLanguagePreference();
    expect(lang).toBe('en');
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('language-preference');
  });

  it('should save language preference', async () => {
    await saveLanguagePreference('de');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('language-preference', 'de');
  });
});
