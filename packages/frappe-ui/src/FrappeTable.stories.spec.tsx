/**
 * FrappeTable's fixture stories carry a baseURL, and FrappeTable under a
 * fixture corpus never dials it for meta (MPO-230), so their filter menu and
 * title-field row labels exist only if the corpus carries the DocType entry.
 */
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Default } from './FrappeTable.stories';

vi.mock(import('@repo/storybook'), () => ({ action: () => vi.fn() }));

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    interpolation: { escapeValue: false },
    resources: { en: { translation: {} } },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const customerNames = new Set([
  'Acme Corp',
  'Global Tech',
  'John Smith',
  'Jane Doe',
  'Tech Solutions',
  'Startup Inc',
  'Bob Wilson',
  'Enterprise Ltd',
]);

describe('FrappeTable stories', () => {
  it("Main labels rows by the corpus meta's title field and issues no request", async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      throw new Error(`unexpected network request: ${String(input)}`);
    });
    const { container } = renderWithProviders(<Default />);

    await waitFor(() => {
      const labels = [...container.querySelectorAll('[data-row-press="true"]')].map(
        (row) => row.getAttribute('aria-label') ?? '',
      );
      expect(labels.length).toBeGreaterThan(0);
      expect(labels.filter((label) => !customerNames.has(label))).toEqual([]);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
