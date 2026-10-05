import { renderWithProviders } from '@repo/test-utils';
import { act, fireEvent, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Form } from '../../Form';

import { Combobox } from './index';

/** Web panels portal out to the page, so panel text is read from the page. */
function findInPage(text: string): Element | undefined {
  try {
    return within(document.body).queryByText(text, { exact: false }) ?? undefined;
  } catch {
    return Array.from(document.body.querySelectorAll('*')).find((el) => el.textContent?.includes(text));
  }
}

const options = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
];

describe('Combobox', () => {
  describe('custom sheet trigger', () => {
    const initialWidth = window.innerWidth;
    afterEach(() => {
      window.innerWidth = initialWidth;
    });

    it('keeps the same name and keyboard opener on narrow and wide screens', async () => {
      for (const width of [500, 1200]) {
        window.innerWidth = width;
        const result = renderWithProviders(
          <Combobox options={options} aria-label="Country code" trigger={() => <span>Country</span>} />,
        );
        const trigger = result.baseElement.querySelector('[role="combobox"]');
        expect(trigger?.getAttribute('aria-label')).toBe('Country code');
        expect(trigger?.getAttribute('tabindex')).toBe('0');
        expect(trigger?.getAttribute('aria-expanded')).toBe('false');
        await act(async () => fireEvent.keyDown(trigger!, { key: 'Enter' }));
        expect(trigger?.getAttribute('aria-expanded')).toBe('true');
        result.unmount();
      }
    });

    it('lets a custom adornment hug its content while ordinary triggers keep stretching', () => {
      for (const width of [500, 1200]) {
        window.innerWidth = width;
        for (const triggerSizing of [undefined, 'content'] as const) {
          const result = renderWithProviders(
            <Combobox options={options} triggerSizing={triggerSizing} trigger={() => <span>Country</span>} />,
          );
          const trigger = result.baseElement.querySelector<HTMLElement>('[data-testid="combobox-trigger"]');
          expect(trigger?.style.width).toBe(triggerSizing === 'content' ? 'auto' : '100%');
          result.unmount();
        }
      }
    });
  });

  describe('without form context', () => {
    it('renders with label', () => {
      renderWithProviders(<Combobox label="Fruit" name="fruit" options={options} />);
      expect(findInPage('Fruit')).toBeDefined();
    });

    it('renders required label with asterisk', () => {
      const result = renderWithProviders(<Combobox label="Required" name="req" options={options} required />);
      const label = result.baseElement.querySelector('label');
      expect(label?.textContent).toContain('*');
    });

    it('renders with helper text', () => {
      renderWithProviders(<Combobox label="Fruit" name="fruit" options={options} helperText="Pick a fruit" />);
      expect(findInPage('Pick a fruit')).toBeDefined();
    });

    it('renders skeleton placeholder', () => {
      const result = renderWithProviders(<Combobox label="Loading" name="l" options={options} skeleton />);
      // No interactive trigger rendered in skeleton mode
      const buttons = result.baseElement.querySelectorAll('button');
      expect(buttons.length).toBe(0);
    });

    it('renders with pre-selected value', () => {
      renderWithProviders(<Combobox label="Fruit" name="fruit" options={options} value="apple" />);
      expect(findInPage('Apple')).toBeDefined();
    });

    it('renders disabled state', () => {
      renderWithProviders(<Combobox label="Disabled" name="d" options={options} disabled />);
      expect(findInPage('Disabled')).toBeDefined();
    });

    it('fires canonical onChange and the deprecated onValueChange alias once when dismissing a chip', async () => {
      const onChange = vi.fn();
      const onValueChange = vi.fn();
      const result = renderWithProviders(
        <Combobox
          label="Fruits"
          name="fruits"
          options={options}
          multiple
          dismissible
          value={['apple', 'banana']}
          onChange={onChange}
          onValueChange={onValueChange}
        />,
      );
      // Labels are differentiated per chip now — "Remove {label}".
      const dismiss = result.baseElement.querySelector('[aria-label^="Remove"]');
      expect(dismiss).toBeTruthy();
      await act(async () => {
        if (dismiss) {
          fireEvent.click(dismiss);
        }
      });
      // Exactly once each — guards against the standalone double-fire bug.
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(['banana']);
      expect(onValueChange).toHaveBeenCalledTimes(1);
      expect(onValueChange).toHaveBeenCalledWith(['banana']);
    });

    it('stable keeps Cherry in third position when selected and open', async () => {
      const result = renderWithProviders(
        <Combobox
          label="Fruit"
          name="fruit"
          options={options}
          multiple
          selectedOrder="stable"
          value={['cherry']}
          open
        />,
      );
      await act(async () => {});
      const optionEls = result.baseElement.querySelectorAll('[role="option"]');
      expect(optionEls[2]?.textContent).toContain('Cherry');
      expect(optionEls[0]?.textContent).toContain('Apple');
    });
  });

  describe('with form context', () => {
    it('renders inside form', () => {
      renderWithProviders(
        <Form formOptions={{ defaultValues: { fruit: '' } }} submitText="Submit">
          <Combobox name="fruit" label="Fruit" options={options} />
        </Form>,
      );
      expect(findInPage('Fruit')).toBeDefined();
    });
  });

  describe('async contract additions (valueLabel / clearable / searchError / description)', () => {
    it('shows valueLabel in the trigger when the value is not in options', () => {
      renderWithProviders(<Combobox label="User" options={[]} value="user-001" valueLabel="Jane Doe" />);
      expect(findInPage('Jane Doe')).toBeDefined();
    });

    it('still shows the placeholder for an unknown value without valueLabel', () => {
      renderWithProviders(<Combobox label="User" options={[]} value="user-001" placeholder="Pick user" />);
      expect(findInPage('Pick user')).toBeDefined();
    });

    it('readOnly renders valueLabel for a value missing from options', () => {
      renderWithProviders(<Combobox label="User" options={[]} value="user-001" valueLabel="Jane Doe" readOnly />);
      expect(findInPage('Jane Doe')).toBeDefined();
    });

    it('clearable trigger clears the value through canonical onChange', async () => {
      const onChange = vi.fn();
      const result = renderWithProviders(
        <Combobox label="Fruit" options={options} value="apple" clearable onChange={onChange} />,
      );
      const clear = result.baseElement.querySelector('[aria-label="Clear"]');
      expect(clear).toBeTruthy();
      await act(async () => {
        if (clear) {
          fireEvent.click(clear);
        }
      });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('');
    });

    it('renders option descriptions in the open dropdown', async () => {
      const withDescriptions = [{ value: 'u1', label: 'user1@x.com', description: 'User One' }];
      renderWithProviders(<Combobox label="User" options={withDescriptions} open onSearch={() => {}} />);
      await act(async () => {});
      expect(findInPage('User One')).toBeDefined();
    });

    it('shows searchError instead of the empty state in the open dropdown', async () => {
      renderWithProviders(
        <Combobox
          label="User"
          options={[]}
          open
          onSearch={() => {}}
          searchError="You don't have permission to search User"
        />,
      );
      await act(async () => {});
      expect(findInPage("You don't have permission to search User")).toBeDefined();
    });
  });

  describe('creatable', () => {
    const initialWidth = window.innerWidth;
    afterEach(() => {
      window.innerWidth = initialWidth;
    });

    const toTag = (next: string) => ({ value: next.toLowerCase(), label: next });

    async function openAndType(text: string) {
      const trigger = document.body.querySelector<HTMLElement>('[role="combobox"]');
      expect(trigger).toBeTruthy();
      await act(async () => fireEvent.keyDown(trigger!, { key: 'Enter' }));
      const search = document.body.querySelector('input');
      expect(search).toBeTruthy();
      await act(async () => fireEvent.change(search!, { target: { value: text } }));
      return search!;
    }

    function triggerText() {
      return document.body.querySelector('[data-testid="combobox-trigger"]')?.textContent;
    }

    function createRow(text: string) {
      return [...document.body.querySelectorAll('[role="option"]')].find(
        (el) => el.textContent?.trim() === `Create "${text}"`,
      );
    }

    for (const [surface, width] of [
      ['panel', 1200],
      ['sheet', 500],
    ] as const) {
      it(`${surface}: a created option shows in the trigger of an uncontrolled combobox`, async () => {
        window.innerWidth = width;
        const onCreate = vi.fn(toTag);
        const onChange = vi.fn();
        renderWithProviders(
          <Combobox
            label="Fruit"
            options={options}
            placeholder="Pick a fruit"
            creatable
            onCreate={onCreate}
            onChange={onChange}
          />,
        );
        await openAndType('Durian');
        const row = createRow('Durian');
        expect(row).toBeTruthy();
        await act(async () => fireEvent.click(row!));

        expect(onCreate).toHaveBeenCalledWith('Durian');
        expect(onChange).toHaveBeenCalledWith('durian');
        expect(triggerText()).toContain('Durian');
        expect(triggerText()).not.toContain('Pick a fruit');
      });

      it(`${surface}: a created option is listed and selected, and is not offered again`, async () => {
        window.innerWidth = width;
        const onCreate = vi.fn(toTag);
        renderWithProviders(<Combobox label="Fruit" options={options} creatable onCreate={onCreate} />);
        const search = await openAndType('Durian');
        await act(async () => fireEvent.keyDown(search, { key: 'Enter' }));
        expect(onCreate).toHaveBeenCalledTimes(1);

        await openAndType('durian');
        expect(createRow('durian')).toBeUndefined();
        const listed = [...document.body.querySelectorAll('[role="option"]')].find(
          (el) => el.textContent?.trim() === 'Durian',
        );
        expect(listed?.getAttribute('aria-selected')).toBe('true');
      });
    }

    it("multiple: a created option's chip shows its label, not its value", async () => {
      window.innerWidth = 1200;
      const onChange = vi.fn();
      renderWithProviders(
        <Combobox label="Fruits" options={options} multiple creatable onCreate={toTag} onChange={onChange} />,
      );
      const search = await openAndType('Durian');
      await act(async () => fireEvent.keyDown(search, { key: 'Enter' }));
      expect(onChange).toHaveBeenCalledWith(['durian']);
      expect(triggerText()).toContain('Durian');
    });

    it('a create that the host handles itself still closes a single-value panel', async () => {
      window.innerWidth = 1200;
      const onCreate = vi.fn(() => undefined);
      renderWithProviders(<Combobox label="Customer" options={options} creatable onCreate={onCreate} />);
      const search = await openAndType('Acme');
      await act(async () => fireEvent.keyDown(search, { key: 'Enter' }));
      expect(onCreate).toHaveBeenCalledWith('Acme');
      expect(document.body.querySelector('[role="combobox"]')?.getAttribute('aria-expanded')).toBe('false');
    });

    for (const [surface, width] of [
      ['panel', 1200],
      ['sheet', 500],
    ] as const) {
      it(`${surface}: a space in the typed text is typed, so a two-word option can be created`, async () => {
        window.innerWidth = width;
        const onCreate = vi.fn(toTag);
        renderWithProviders(<Combobox label="Author" options={options} creatable onCreate={onCreate} />);
        const search = await openAndType('Octavia');
        let typed = false;
        await act(async () => {
          typed = fireEvent.keyDown(search, { key: ' ', code: 'Space' });
        });
        expect(typed).toBe(true);
        expect(onCreate).not.toHaveBeenCalled();
        expect(document.body.querySelector('[role="combobox"]')?.getAttribute('aria-expanded')).toBe('true');

        await act(async () => fireEvent.change(search, { target: { value: 'Octavia Butler' } }));
        await act(async () => fireEvent.keyDown(search, { key: 'Enter' }));
        expect(onCreate).toHaveBeenCalledWith('Octavia Butler');
        expect(triggerText()).toContain('Octavia Butler');
      });
    }
  });

  describe('search typing', () => {
    it('a space after search text is typed, not taken as a pick', async () => {
      window.innerWidth = 1200;
      const onChange = vi.fn();
      const result = renderWithProviders(<Combobox label="Fruit" options={options} open onChange={onChange} />);
      await act(async () => {});
      const search = result.baseElement.querySelector('input');
      expect(search).toBeTruthy();
      await act(async () => fireEvent.change(search!, { target: { value: 'Ban' } }));
      let typed = false;
      await act(async () => {
        typed = fireEvent.keyDown(search!, { key: ' ', code: 'Space' });
      });
      expect(typed).toBe(true);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('APG combobox', () => {
    it('points aria-activedescendant at the active option id', async () => {
      const result = renderWithProviders(<Combobox label="Fruit" name="fruit" options={options} open />);
      await act(async () => {});
      const first = result.baseElement.querySelector('[role="option"]');
      expect(first?.id).toMatch(/-opt-0$/);
      const search = result.baseElement.querySelector('input');
      expect(search?.getAttribute('aria-autocomplete')).toBe('list');
      expect(search?.getAttribute('aria-activedescendant')).toBe(first?.id);
      const listbox = result.baseElement.querySelector('[role="listbox"]');
      expect(listbox).toBeTruthy();
      expect(search?.getAttribute('aria-controls')).toBe(listbox?.id);
    });

    it('trims the filter so leading spaces still match', async () => {
      const result = renderWithProviders(<Combobox label="Fruit" name="fruit" options={options} open />);
      await act(async () => {});
      const search = result.baseElement.querySelector('input');
      expect(search).toBeTruthy();
      await act(async () => {
        fireEvent.change(search!, { target: { value: '  Apple' } });
      });
      expect(findInPage('Apple')).toBeDefined();
      expect(result.baseElement.textContent).not.toContain('Banana');
    });

    it('ArrowDown moves activedescendant through ungrouped options', async () => {
      const result = renderWithProviders(<Combobox label="Fruit" name="fruit" options={options} open />);
      await act(async () => {});
      const search = result.baseElement.querySelector('input');
      expect(search).toBeTruthy();
      const first = result.baseElement.querySelector('[role="option"]');
      expect(search?.getAttribute('aria-activedescendant')).toBe(first?.id);
      await act(async () => {
        fireEvent.keyDown(search!, { key: 'ArrowDown' });
      });
      const optionsInDom = result.baseElement.querySelectorAll('[role="option"]');
      expect(search?.getAttribute('aria-activedescendant')).toBe(optionsInDom[1]?.id);
      expect(optionsInDom[1]?.textContent).toContain('Banana');
    });
  });

  describe('group headers + multiple', () => {
    // Interleaved groups: render clusters Fruit then Vegetable, so navigable
    // order is Apple, Banana, Carrot — not the source order Apple, Carrot, Banana.
    beforeEach(() => {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: 1200,
      });
    });

    const groupedOptions = [
      { value: 'apple', label: 'Apple', group: 'Fruit' },
      { value: 'carrot', label: 'Carrot', group: 'Vegetable' },
      { value: 'banana', label: 'Banana', group: 'Fruit' },
    ];

    function activeOption(container: HTMLElement) {
      const search = container.querySelector('input');
      const id = search?.getAttribute('aria-activedescendant');
      return id ? container.querySelector(`#${CSS.escape(id)}`) : null;
    }

    it('renders group headers when multiple is set', async () => {
      const result = renderWithProviders(
        <Combobox label="Produce" name="produce" options={groupedOptions} multiple open />,
      );
      await act(async () => {});
      const headers = result.baseElement.querySelectorAll('[data-combobox-group-header]');
      expect(headers.length).toBeGreaterThan(0);
      expect(findInPage('Fruit')).toBeDefined();
      expect(findInPage('Vegetable')).toBeDefined();
    });

    it('ArrowDown/ArrowUp traverse only selectable rows and skip headers', async () => {
      const onChange = vi.fn();
      const result = renderWithProviders(
        <Combobox label="Produce" name="produce" options={groupedOptions} multiple open onChange={onChange} />,
      );
      await act(async () => {});

      const search = result.baseElement.querySelector('input');
      expect(search).toBeTruthy();
      const optionLabels = [...result.baseElement.querySelectorAll('[role="option"]')].map((el) => el.textContent);
      expect(optionLabels[0]).toContain('Apple');
      expect(optionLabels[1]).toContain('Banana');
      expect(optionLabels[2]).toContain('Carrot');

      expect(activeOption(result.baseElement)?.textContent).toContain('Apple');
      expect(activeOption(result.baseElement)?.getAttribute('role')).toBe('option');

      await act(async () => {
        fireEvent.keyDown(search!, { key: 'ArrowDown' });
      });
      expect(activeOption(result.baseElement)?.textContent).toContain('Banana');
      expect(activeOption(result.baseElement)?.getAttribute('role')).toBe('option');
      for (const header of result.baseElement.querySelectorAll('[data-combobox-group-header]')) {
        expect(header.getAttribute('data-active')).not.toBe('true');
      }

      // Space must commit the highlighted row (Banana), not sortedFiltered[1] (Carrot).
      await act(async () => {
        fireEvent.keyDown(search!, { key: ' ' });
      });
      expect(onChange).toHaveBeenCalledWith(['banana']);

      await act(async () => {
        fireEvent.keyDown(search!, { key: 'ArrowDown' });
      });
      expect(activeOption(result.baseElement)?.textContent).toContain('Carrot');

      await act(async () => {
        fireEvent.keyDown(search!, { key: 'ArrowUp' });
      });
      expect(activeOption(result.baseElement)?.textContent).toContain('Banana');

      await act(async () => {
        fireEvent.keyDown(search!, { key: 'Home' });
        fireEvent.keyDown(search!, { key: 'ArrowUp' });
      });
      expect(activeOption(result.baseElement)?.textContent).toContain('Carrot');
      expect(activeOption(result.baseElement)?.getAttribute('role')).toBe('option');
    });

    // The sheet core (<= OVERLAY_BREAKPOINT, and every native render) used to
    // build headers itself from source order, so interleaved groups emitted a
    // REPEAT header and the rows stayed unclustered — two different lists from
    // one set of props. Both cores now go through groupComboboxOptions.
    it('the sheet renders the same headers and row order as the desktop panel', async () => {
      function shot(root: HTMLElement) {
        return {
          headers: [...root.querySelectorAll('[data-combobox-group-header]')].map((el) => el.textContent),
          rows: [...root.querySelectorAll('[role="option"]')].map((el) => ({
            label: el.textContent,
            index: el.getAttribute('data-combobox-index'),
          })),
        };
      }

      window.innerWidth = 1200;
      const desktop = renderWithProviders(
        <Combobox label="Produce" name="produce" options={groupedOptions} multiple open />,
      );
      await act(async () => {});
      const onDesktop = shot(document.body);
      desktop.unmount();

      window.innerWidth = 500;
      renderWithProviders(<Combobox label="Produce" name="produce" options={groupedOptions} multiple open />);
      await act(async () => {});
      const onSheet = shot(document.body);

      expect(onDesktop.headers).toEqual(['Fruit', 'Vegetable']);
      expect(onSheet.headers).toEqual(onDesktop.headers);
      expect(onSheet.rows).toEqual(onDesktop.rows);
      // One header per group: a repeated label is the defect this guards.
      expect(new Set(onSheet.headers).size).toBe(onSheet.headers.length);
    });

    // The sheet's activeIndex indexes the same grouped list the sheet renders,
    // so arrows land on the row the user sees rather than the source-order row.
    it('sheet ArrowDown follows the rendered row order, not source order', async () => {
      window.innerWidth = 500;
      renderWithProviders(<Combobox label="Produce" name="produce" options={groupedOptions} multiple open />);
      await act(async () => {});

      const rows = [...document.body.querySelectorAll('[role="option"]')];
      expect(rows.map((el) => el.textContent?.trim())).toEqual(['Apple', 'Banana', 'Carrot']);

      const search = document.body.querySelector('input');
      expect(search).toBeTruthy();
      // activeIndex starts at 0 (Apple); one ArrowDown must highlight the row
      // rendered second (Banana), which is sortedFiltered[2], not [1].
      await act(async () => {
        fireEvent.keyDown(search!, { key: 'ArrowDown' });
      });
      const active = document.body.querySelector('[data-active="true"]');
      expect(active?.textContent).toContain('Banana');
      expect(active?.getAttribute('data-combobox-index')).toBe('1');
    });

    // The sheet focused its list on open, over the search's
    // autoFocus, so typing went nowhere. Only a sheet with no search field
    // gives its list the focus.
    it('the sheet opens with focus in its search, or on its list when the search is hidden', async () => {
      window.innerWidth = 500;
      const withSearch = renderWithProviders(<Combobox label="Produce" name="produce" options={groupedOptions} open />);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      expect(document.activeElement?.tagName).toBe('INPUT');
      withSearch.unmount();

      renderWithProviders(<Combobox label="Produce" name="produce" options={groupedOptions} open hideSearch />);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      expect(document.activeElement?.getAttribute('role')).toBe('listbox');
    });
  });
});
