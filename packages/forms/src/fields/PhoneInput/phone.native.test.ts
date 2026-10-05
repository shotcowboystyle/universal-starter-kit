import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hermes ships Intl without DisplayNames. Without a fallback every native
// country row read "flag DE +49" and a search for "Germ" found nothing.
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('Intl', { ...Intl, DisplayNames: undefined });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('phone country options without Intl.DisplayNames', () => {
  it('still names every country', async () => {
    const { getCountryOptions } = await import('./phone');
    const options = getCountryOptions();
    const unnamed = options.filter((option) => option.label.split('  ')[1] === option.value);
    expect(unnamed.map((option) => option.value)).toEqual([]);
    expect(options.find((option) => option.value === 'DE')?.label).toContain('Germany');
  });

  it('finds Germany by a partial name, as the Combobox filter matches', async () => {
    const { getCountryOptions } = await import('./phone');
    const query = 'germ';
    const hits = getCountryOptions().filter(
      (option) => option.label.toLowerCase().includes(query) || option.keywords.toLowerCase().includes(query),
    );
    expect(hits.map((option) => option.value)).toEqual(['DE']);
  });
});
