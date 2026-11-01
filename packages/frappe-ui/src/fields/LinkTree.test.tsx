import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen } from '@testing-library/react';
import i18next from 'i18next';
import type { ComponentProps } from 'react';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrappeProvider } from '../FrappeProvider';

import { LinkTree } from './LinkTree';

/** A hook stub: the specs read only the fields of the shapes they return. */
type HookStub = (...args: unknown[]) => object;

const mockUseLinkTitle = vi.fn<HookStub>();
const mockUseDocTypeMeta = vi.fn<HookStub>();
const mockUseFrappeCollection = vi.fn<HookStub>();
const mockUseLiveQuery = vi.fn<HookStub>();

// oxlint-disable-next-line vitest/prefer-import-in-mock -- the hook stubs are partial; the real module type rejects them in a typed factory
vi.mock('@repo/frappe', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    useLinkTitle: (...args: unknown[]) => mockUseLinkTitle(...args),
    useDocTypeMeta: (...args: unknown[]) => mockUseDocTypeMeta(...args),
    useFrappeCollection: (...args: unknown[]) => mockUseFrappeCollection(...args),
    useLiveQuery: (...args: unknown[]) => mockUseLiveQuery(...args),
  };
});

const renderTree = (props: Partial<ComponentProps<typeof LinkTree>> = {}) =>
  renderWithProviders(
    <FrappeProvider baseURL="https://bench.example.com">
      <LinkTree
        label="Account"
        doctype="Account"
        onChange={vi.fn<(value: string) => void>()}
        {...props}
      />
    </FrappeProvider>,
  );

describe('LinkTree field', () => {
  beforeAll(async () => {
    // oxlint-disable-next-line import/no-named-as-default-member -- the named `use` export is unbound; i18next.use needs the instance as `this`
    await i18next.use(initReactI18next).init({
      lng: 'en',
      interpolation: { escapeValue: false },
      resources: {
        en: {
          translation: {
            'Select {{doctype}}': 'Select {{doctype}}',
            'Filter {{doctype}}': 'Filter {{doctype}}',
            'No matching {{doctype}}': 'No matching {{doctype}}',
          },
        },
      },
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // oxlint-disable-next-line sonarjs/no-undefined-assignment -- the hook reports a not-yet-known title as undefined
    mockUseLinkTitle.mockReturnValue({ title: undefined, isLoading: false });
    mockUseDocTypeMeta.mockReturnValue({
      meta: { is_tree: 1, title_field: 'account_name' },
      isLoading: false,
      error: null,
    });
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

  describe('LinkTree adapter (MPO-111)', () => {
    it('renders TreeSelect, not the Link combobox', () => {
      const result = renderTree({ value: 'HDFC Current' });
      expect(result.container.querySelector('[data-testid="tree-select"]')).toBeTruthy();
      expect(result.container.querySelector('[data-testid="tree-select-trigger"]')).toBeTruthy();
      expect(result.container.querySelector('[data-testid="combobox-trigger"]')).toBeNull();
      expect(screen.getByText('HDFC Current')).toBeTruthy();
    });

    // TreeSelect resolves its trigger label as
    //   selected?.label ?? (value ? (valueLabel ?? value) : undefined)
    // (components/src/TreeSelect/index.tsx). A node that IS in the loaded forest
    // carries its own label, so useLinkTitle only shows for a value whose node
    // has not been loaded -- which is the case the prop exists for, since the
    // forest is paged and a stored link often points outside the current page.
    it('shows the useLinkTitle title when the value is outside the loaded forest', () => {
      mockUseLinkTitle.mockReturnValue({ title: 'HDFC Current Account', isLoading: false });
      renderTree({ value: 'HDFC Savings' });
      expect(screen.getByText('HDFC Current Account')).toBeTruthy();
    });

    it('prefers the in-tree node label over useLinkTitle', () => {
      mockUseLinkTitle.mockReturnValue({ title: 'Should not win', isLoading: false });
      renderTree({ value: 'HDFC Current' });
      expect(screen.getByText('HDFC Current')).toBeTruthy();
      expect(screen.queryByText('Should not win')).toBeNull();
    });

    it('still mounts TreeSelect with the placeholder when the forest is empty', () => {
      mockUseLiveQuery.mockReturnValue({ data: [], isLoading: false, isError: false });
      const result = renderTree();
      expect(result.container.querySelector('[data-testid="tree-select"]')).toBeTruthy();
      expect(result.container.querySelector('[data-testid="tree-select-trigger"]')).toBeTruthy();
      expect(screen.getByText('Select Account')).toBeTruthy();
    });

    it('does not call onChange when disabled', () => {
      const onChange = vi.fn<(value: string) => void>();
      renderTree({ value: 'Assets', onChange, disabled: true });
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
