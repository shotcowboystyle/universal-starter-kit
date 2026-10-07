// DG-A11Y-06: chip remove buttons carry the item identity in their accessible
// name. TableMultiSelect composes forms Combobox; dismiss names come from
// forms Chip ("Remove {{label}}"). Values render through the unknown-selections
// path, which needs no Frappe collection.
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { TableMultiSelect } from './TableMultiSelect';

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    interpolation: { escapeValue: false },
    resources: {
      en: {
        translation: {
          'Remove {{label}}': 'Remove {{label}}',
          'Select options': 'Select options',
        },
      },
    },
  });
});

afterEach(cleanup);

describe('TableMultiSelect chip remove names (DG-A11Y-06)', () => {
  it("each selected chip's remove button names its item", () => {
    renderWithProviders(
      <TableMultiSelect
        label="Tags"
        doctype="Tag"
        value={['Alpha', 'Beta']}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Remove Alpha')).toBeTruthy();
    expect(screen.getByLabelText('Remove Beta')).toBeTruthy();
  });
});

describe('TableMultiSelect design-law — compose forms Combobox', () => {
  it('renders the house Combobox trigger (no forked Select chrome)', () => {
    const result = renderWithProviders(
      <TableMultiSelect
        label="Tags"
        doctype="Tag"
        value={[]}
        onChange={vi.fn()}
      />,
    );
    expect(result.container.querySelector('[data-testid="combobox-trigger"]')).toBeTruthy();
    expect(screen.getByText('Tags')).toBeTruthy();
  });

  it('shows unknown selections as dismissible chips', () => {
    renderWithProviders(
      <TableMultiSelect
        label="Tags"
        doctype="Tag"
        value={['Alpha']}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Alpha')).toBeTruthy();
  });
});
