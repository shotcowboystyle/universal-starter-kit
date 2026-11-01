import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen } from '@testing-library/react';
import i18next from 'i18next';
import React from 'react';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrappeProvider } from '../FrappeProvider';

import { DeskFormSidebar } from './DeskFormSidebar';

// The stand-ins hand back loose fixtures (only the fields DeskFormSidebar reads), not the hooks' full results.
// oxlint-disable-next-line anti-slop/no-unknown-returns -- loose test fixture, see above
const mockUseDocTypeMeta = vi.fn<(...args: unknown[]) => unknown>();
// oxlint-disable-next-line anti-slop/no-unknown-returns -- loose test fixture, see above
const mockUseFrappeCollection = vi.fn<(...args: unknown[]) => unknown>();
// oxlint-disable-next-line anti-slop/no-unknown-returns -- loose test fixture, see above
const mockUseLiveQuery = vi.fn<(...args: unknown[]) => unknown>();

// @ts-expect-error -- the stand-in hooks return loose fixtures, not the typed hook results
vi.mock(import('@repo/frappe'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useDocTypeMeta: (...args: unknown[]) => mockUseDocTypeMeta(...args),
    useFrappeCollection: (...args: unknown[]) => mockUseFrappeCollection(...args),
    useLiveQuery: (...args: unknown[]) => mockUseLiveQuery(...args),
  };
});

vi.mock(import('../FormSidebar'), () => ({
  FormSidebar: (props: { 'data-testid'?: string; sections?: readonly { key: string }[] }) =>
    React.createElement(
      'div',
      {
        'data-testid': props['data-testid'] ?? 'desk-form-sidebar',
        'data-section-keys': Array.isArray(props.sections)
          ? props.sections.map((section) => section.key).join(',')
          : '',
      },
      'sidebar',
    ),
}));

const renderSidebar = (name = 'TODO-001') =>
  renderWithProviders(
    <FrappeProvider baseURL="https://bench.example.com">
      <DeskFormSidebar
        doctype="Todo"
        name={name}
      />
    </FrappeProvider>,
  );

describe(DeskFormSidebar, () => {
  beforeAll(async () => {
    // oxlint-disable-next-line import/no-named-as-default-member -- the named `use` export is unbound; i18next.use needs the instance as `this`
    await i18next.use(initReactI18next).init({
      lng: 'en',
      interpolation: { escapeValue: false },
      resources: { en: { translation: {} } },
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDocTypeMeta.mockReturnValue({
      meta: { image_field: 'image' },
      isLoading: false,
      error: null,
    });
    mockUseFrappeCollection.mockReturnValue({ id: 'mock' });
  });

  afterEach(cleanup);

  describe('DeskFormSidebar (MPO-111)', () => {
    it('renders nothing until the document arrives', () => {
      mockUseLiveQuery.mockReturnValue({ data: [] });
      const { container } = renderSidebar();
      expect(container.querySelector('[data-testid="desk-form-sidebar"]')).toBeNull();
    });

    it('mounts the FormSidebar once the doc query returns a row', async () => {
      const doc = {
        name: 'TODO-001',
        doctype: 'Todo',
        description: 'Review',
        owner: 'jane@example.com',
      };
      // Three live queries (doc, share, assignment). Cycle so Strict Mode
      // remounts still see a doc on the first slot.
      let call = 0;
      mockUseLiveQuery.mockImplementation(() => {
        const slot = call % 3;
        call += 1;
        return { data: slot === 0 ? [doc] : [] };
      });
      renderSidebar();
      await expect(screen.findByTestId('desk-form-sidebar')).resolves.toBeTruthy();
    });

    it('hands FormSidebar the Assigned To and Shared With sections even when both are empty', async () => {
      const doc = {
        name: 'TODO-002',
        doctype: 'Todo',
        description: 'File',
        owner: 'sam@example.com',
      };
      let call = 0;
      mockUseLiveQuery.mockImplementation(() => {
        const slot = call % 3;
        call += 1;
        return { data: slot === 0 ? [doc] : [] };
      });
      renderSidebar('TODO-002');
      const sidebar = await screen.findByTestId('desk-form-sidebar');
      // buildSidebarSections always emits assignments; shares only when the
      // DocShare subscription exists (it does here). An empty list keeps its
      // section and renders emptyText — the pane never loses a row.
      expect(sidebar.dataset.sectionKeys).toBe('assignments,shares');
    });
  });
});
