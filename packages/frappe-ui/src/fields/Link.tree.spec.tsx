import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrappeProvider } from '../FrappeProvider';

import { Link } from './Link';

const mockUseLinkSearch = vi.fn();
const mockUseLinkTitle = vi.fn();
const mockUseDocTypeMeta = vi.fn();
const mockUseFrappeCollection = vi.fn();
const mockUseLiveQuery = vi.fn();

vi.mock(import('@repo/frappe'), async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useLinkSearch: (...args: unknown[]) => mockUseLinkSearch(...args),
    useLinkTitle: (...args: unknown[]) => mockUseLinkTitle(...args),
    useDocTypeMeta: (...args: unknown[]) => mockUseDocTypeMeta(...args),
    useFrappeCollection: (...args: unknown[]) => mockUseFrappeCollection(...args),
    useLiveQuery: (...args: unknown[]) => mockUseLiveQuery(...args),
  };
});

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    interpolation: { escapeValue: false },
    resources: {
      en: {
        translation: {
          'Select {{doctype}}': 'Select {{doctype}}',
          'Search {{doctype}}': 'Search {{doctype}}',
          'Filter {{doctype}}': 'Filter {{doctype}}',
          'No matching {{doctype}}': 'No matching {{doctype}}',
        },
      },
    },
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  mockUseLinkSearch.mockReturnValue({ results: [], isLoading: false, error: null });
  mockUseLinkTitle.mockReturnValue({ title: undefined, isLoading: false });
  mockUseFrappeCollection.mockReturnValue({});
  mockUseLiveQuery.mockReturnValue({
    data: [
      { name: 'Assets', account_name: 'Assets', parent_account: '', doctype: 'Account' },
      {
        name: 'HDFC Current',
        account_name: 'HDFC Current',
        parent_account: 'Assets',
        doctype: 'Account',
      },
    ],
    isLoading: false,
    isError: false,
  });
});

afterEach(cleanup);

const BASE_URL = 'https://bench.example.com';

function renderLink(props: Partial<React.ComponentProps<typeof Link>> = {}) {
  return renderWithProviders(
    <FrappeProvider baseURL={BASE_URL}>
      <Link
        label="Account"
        doctype="Account"
        onChange={vi.fn()}
        {...props}
      />
    </FrappeProvider>,
  );
}

describe('Link tree adapter (MPO-53 AC-3)', () => {
  it('renders TreeSelect when the target DocType is a tree', () => {
    mockUseDocTypeMeta.mockReturnValue({
      meta: { is_tree: 1, title_field: 'account_name' },
      isLoading: false,
      error: null,
    });
    const result = renderLink({ value: 'HDFC Current' });
    expect(result.container.querySelector('[data-testid="tree-select"]')).toBeTruthy();
    expect(result.container.querySelector('[data-testid="tree-select-trigger"]')).toBeTruthy();
    expect(result.container.querySelector('[data-testid="combobox-trigger"]')).toBeNull();
    expect(screen.getByText('HDFC Current')).toBeTruthy();
  });

  it('stays on Combobox when control ejects (DG-CTRL-06)', () => {
    mockUseDocTypeMeta.mockReturnValue({
      meta: { is_tree: 1, title_field: 'account_name' },
      isLoading: false,
      error: null,
    });
    const result = renderLink({ control: 'combobox' });
    expect(result.container.querySelector('[data-testid="tree-select"]')).toBeNull();
    expect(result.container.querySelector('[data-testid="combobox-trigger"]')).toBeTruthy();
  });

  it('stays on Combobox when the target DocType is not a tree', () => {
    mockUseDocTypeMeta.mockReturnValue({
      meta: { is_tree: 0 },
      isLoading: false,
      error: null,
    });
    const result = renderLink({ doctype: 'User', label: 'Assigned To' });
    expect(result.container.querySelector('[data-testid="tree-select"]')).toBeNull();
    expect(result.container.querySelector('[data-testid="combobox-trigger"]')).toBeTruthy();
  });
});
