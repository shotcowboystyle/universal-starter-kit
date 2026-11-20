import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DataTableFacetMenu } from './index';
import type { DataTableFacetOption } from './index';

const options: DataTableFacetOption[] = [
  { value: 'alice@example.com', label: 'Alice', count: 12 },
  { value: 'bob@example.com', label: 'Bob', count: 4 },
  { value: 'carol@example.com', label: 'Carol', count: 0 },
];

const openMenu = async (utils: ReturnType<typeof renderWithProviders>, name = 'Assigned To'): Promise<void> => {
  fireEvent.click(utils.getByRole('button', { name }));
  await waitFor(
    () => {
      expect(utils.getAllByRole('menuitemcheckbox').length).toBeGreaterThan(0);
    },
    { timeout: 3000 },
  );
};

describe(DataTableFacetMenu, () => {
  describe('trigger', () => {
    it('renders the facet label as the trigger', () => {
      const { getByRole } = renderWithProviders(
        <DataTableFacetMenu
          label="Assigned To"
          options={options}
        />,
      );
      const trigger = getByRole('button', { name: 'Assigned To' });
      expect(trigger).toBeDefined();
      expect(trigger.textContent).toContain('Assigned To');
    });

    it('carries the active count on the trigger', () => {
      const { getByRole } = renderWithProviders(
        <DataTableFacetMenu
          label="Assigned To"
          options={options}
          activeValues={['alice@example.com']}
        />,
      );
      expect(getByRole('button', { name: 'Assigned To' }).textContent).toContain('Assigned To (1)');
    });

    it('does not render menu rows while closed', () => {
      const { queryAllByRole } = renderWithProviders(
        <DataTableFacetMenu
          label="Assigned To"
          options={options}
        />,
      );
      expect(queryAllByRole('menuitemcheckbox')).toHaveLength(0);
    });
  });

  describe('menu content', () => {
    it('renders one checkbox row per option with its count', async () => {
      const utils = renderWithProviders(
        <DataTableFacetMenu
          label="Assigned To"
          options={options}
        />,
      );
      await openMenu(utils);
      const rows = utils.getAllByRole('menuitemcheckbox');
      expect(rows).toHaveLength(3);
      expect(rows[0].textContent).toContain('Alice');
      expect(rows[0].textContent).toContain('12');
      expect(rows[1].textContent).toContain('Bob');
      expect(rows[1].textContent).toContain('4');
    });

    it('falls back to the raw value when an option has no label', async () => {
      const utils = renderWithProviders(
        <DataTableFacetMenu
          label="Tags"
          options={[{ value: 'urgent', count: 2 }]}
        />,
      );
      await openMenu(utils, 'Tags');
      expect(utils.getAllByRole('menuitemcheckbox')[0].textContent).toContain('urgent');
    });

    it('marks active options checked', async () => {
      const utils = renderWithProviders(
        <DataTableFacetMenu
          label="Assigned To"
          options={options}
          activeValues={['bob@example.com']}
        />,
      );
      await openMenu(utils);
      const rows = utils.getAllByRole('menuitemcheckbox');
      expect(rows[0].getAttribute('aria-checked')).toBe('false');
      expect(rows[1].getAttribute('aria-checked')).toBe('true');
    });

    it('shows an empty state when there are no options and not loading', async () => {
      const utils = renderWithProviders(
        <DataTableFacetMenu
          label="Tags"
          options={[]}
        />,
      );
      fireEvent.click(utils.getByRole('button', { name: 'Tags' }));
      await waitFor(() => {
        expect(utils.getByText('No options')).toBeDefined();
      });
    });

    it('shows a loading indicator and keeps stale options visible', async () => {
      const utils = renderWithProviders(
        <DataTableFacetMenu
          label="Assigned To"
          options={options}
          loading
        />,
      );
      await openMenu(utils);
      // Stale-while-visible: prior options stay rendered while revalidating.
      expect(utils.getAllByRole('menuitemcheckbox')).toHaveLength(3);
      expect(utils.baseElement.querySelector("[data-facet-loading='true']")).toBeTruthy();
    });

    it('suppresses the empty state while loading with no options', async () => {
      const utils = renderWithProviders(
        <DataTableFacetMenu
          label="Assigned To"
          options={[]}
          loading
        />,
      );
      fireEvent.click(utils.getByRole('button', { name: 'Assigned To' }));
      await waitFor(() => {
        expect(utils.baseElement.querySelector("[data-facet-loading='true']")).toBeTruthy();
      });
      expect(utils.queryByText('No options')).toBeNull();
    });
  });

  describe('replace selection', () => {
    it('replaces the selection with the pressed option', async () => {
      const onActiveValuesChange = vi.fn<(next: string[], pressed: DataTableFacetOption) => void>();
      const utils = renderWithProviders(
        <DataTableFacetMenu
          label="Assigned To"
          options={options}
          activeValues={['alice@example.com']}
          onActiveValuesChange={onActiveValuesChange}
        />,
      );
      await openMenu(utils);
      fireEvent.click(utils.getAllByRole('menuitemcheckbox')[1]);
      expect(onActiveValuesChange).toHaveBeenCalledWith(['bob@example.com'], options[1]);
    });

    it('clears the selection when the active option is pressed', async () => {
      const onActiveValuesChange = vi.fn<(next: string[], pressed: DataTableFacetOption) => void>();
      const utils = renderWithProviders(
        <DataTableFacetMenu
          label="Assigned To"
          options={options}
          activeValues={['alice@example.com']}
          onActiveValuesChange={onActiveValuesChange}
        />,
      );
      await openMenu(utils);
      fireEvent.click(utils.getAllByRole('menuitemcheckbox')[0]);
      expect(onActiveValuesChange).toHaveBeenCalledWith([], options[0]);
    });
  });

  describe('toggle selection (multi-select)', () => {
    it('adds the pressed option to the active set', async () => {
      const onActiveValuesChange = vi.fn<(next: string[], pressed: DataTableFacetOption) => void>();
      const utils = renderWithProviders(
        <DataTableFacetMenu
          label="Tags"
          selection="toggle"
          options={options}
          activeValues={['alice@example.com']}
          onActiveValuesChange={onActiveValuesChange}
        />,
      );
      await openMenu(utils, 'Tags');
      fireEvent.click(utils.getAllByRole('menuitemcheckbox')[1]);
      expect(onActiveValuesChange).toHaveBeenCalledWith(['alice@example.com', 'bob@example.com'], options[1]);
    });

    it('removes only the pressed option when it is active', async () => {
      const onActiveValuesChange = vi.fn<(next: string[], pressed: DataTableFacetOption) => void>();
      const utils = renderWithProviders(
        <DataTableFacetMenu
          label="Tags"
          selection="toggle"
          options={options}
          activeValues={['alice@example.com', 'bob@example.com']}
          onActiveValuesChange={onActiveValuesChange}
        />,
      );
      await openMenu(utils, 'Tags');
      fireEvent.click(utils.getAllByRole('menuitemcheckbox')[0]);
      expect(onActiveValuesChange).toHaveBeenCalledWith(['bob@example.com'], options[0]);
    });
  });

  describe('compose behavior', () => {
    it('keeps the menu open after a selection (counts revalidate in place)', async () => {
      const utils = renderWithProviders(
        <DataTableFacetMenu
          label="Assigned To"
          options={options}
          onActiveValuesChange={() => {}}
        />,
      );
      await openMenu(utils);
      fireEvent.click(utils.getAllByRole('menuitemcheckbox')[0]);
      // CheckboxItem COMPOSE default: the menu must not close on select.
      expect(utils.getAllByRole('menuitemcheckbox')).toHaveLength(3);
    });
  });

  describe('compound composition', () => {
    it('renders custom Item children instead of options', async () => {
      const onPress = vi.fn<() => void>();
      const utils = renderWithProviders(
        <DataTableFacetMenu label="Status">
          <DataTableFacetMenu.Item
            label="Open"
            count={7}
            active
            onPress={onPress}
          />
          <DataTableFacetMenu.Item
            label="Closed"
            count={1}
            onPress={() => {}}
          />
        </DataTableFacetMenu>,
      );
      await openMenu(utils, 'Status');
      const rows = utils.getAllByRole('menuitemcheckbox');
      expect(rows).toHaveLength(2);
      expect(rows[0].textContent).toContain('Open');
      expect(rows[0].textContent).toContain('7');
      expect(rows[0].getAttribute('aria-checked')).toBe('true');
      fireEvent.click(rows[0]);
      expect(onPress).toHaveBeenCalledOnce();
    });
  });

  describe('disabled state', () => {
    it('renders a disabled trigger with its reason', () => {
      const { getByRole } = renderWithProviders(
        <DataTableFacetMenu
          label="Assigned To"
          options={options}
          disabled
          disabledReason="Assignments are unavailable offline"
        />,
      );
      const trigger = getByRole('button', { name: /Assigned To/u });
      expect(trigger.getAttribute('aria-disabled') ?? trigger.getAttribute('disabled')).not.toBeNull();
    });
  });

  describe('edge cases', () => {
    it('handles option presses without an onActiveValuesChange handler', async () => {
      const utils = renderWithProviders(
        <DataTableFacetMenu
          label="Assigned To"
          options={options}
        />,
      );
      await openMenu(utils);
      expect(() => {
        fireEvent.click(utils.getAllByRole('menuitemcheckbox')[0]);
      }).not.toThrow();
    });

    it('renders options without counts (no trailing number)', async () => {
      const utils = renderWithProviders(
        <DataTableFacetMenu
          label="Module"
          options={[{ value: 'Core', label: 'Core' }]}
        />,
      );
      await openMenu(utils, 'Module');
      expect(utils.getAllByRole('menuitemcheckbox')[0].textContent).toBe('Core');
    });
  });
});
