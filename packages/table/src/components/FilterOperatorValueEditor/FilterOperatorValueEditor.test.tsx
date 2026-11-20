/**
 * FilterOperatorValueEditor spec (MPO-101). The editor owns two things and
 * nothing else: the operator vocabulary for a field type, and the value
 * editor that type gets. Commit semantics belong to the surfaces
 * (ColumnHeaderFilter / DataTableFilterButton) and are specced there.
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import type { Knobs } from '@repo/theme';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { DataTableColumnType, FilterOperator } from '../../types';
import { filterOperatorLabel, operatorsForFilterType } from '../../utils/filter-fields';

import { FilterOperatorValueEditor } from './index';
import type { FilterOperatorValueEditorProps } from './index';

const statusOptions = [
  { label: 'Open', value: 'open' },
  { label: 'In progress', value: 'in-progress' },
  { label: 'Done', value: 'done' },
];

const fieldTypes: DataTableColumnType[] = ['text', 'number', 'money', 'date', 'boolean', 'select'];

/** Every forms Select trigger in the tree, in render order (Condition first). */
const selectTriggers = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-testid="select-trigger"]')] as HTMLElement[];

const textInputs = (container: HTMLElement) => [...container.querySelectorAll('input')] as HTMLInputElement[];

/** The listbox portals out to the page (MPO-335, LC-90), so options are read from it. */
const openSelect = async (container: HTMLElement, trigger: HTMLElement) => {
  const page = container.ownerDocument.body;
  fireEvent.pointerDown(trigger);
  fireEvent.mouseDown(trigger);
  fireEvent.click(trigger);
  await waitFor(() => {
    expect(page.querySelectorAll('[role="option"]').length).toBeGreaterThan(0);
  });
  return [...page.querySelectorAll('[role="option"]')] as HTMLElement[];
};

/**
 * Choose an open Select option the way the keyboard does. Tamagui's SelectItem
 * arms its click handler on a timer after the list opens (allowSelectRef), so a
 * synthetic click right after opening is dropped; Enter selects unconditionally.
 */
const pickOption = (option: HTMLElement) => {
  fireEvent.keyDown(option, { key: 'Enter' });
};

const optionLabels = (options: HTMLElement[]) => options.map((option) => option.textContent?.trim() ?? '');

type OperatorChange = FilterOperatorValueEditorProps['onOperatorChange'];
type ValueChange = FilterOperatorValueEditorProps['onValueChange'];

const renderEditor = (props: Partial<FilterOperatorValueEditorProps> & { fieldType: DataTableColumnType }) => {
  const operator = props.operator ?? operatorsForFilterType(props.fieldType)[0];
  return renderWithProviders(
    <FilterOperatorValueEditor
      value=""
      onOperatorChange={vi.fn<OperatorChange>()}
      onValueChange={vi.fn<ValueChange>()}
      {...props}
      operator={operator}
    />,
  );
};

/** Controlled harness: round-trips operator + value like the surfaces do. */
const ControlledEditor = ({
  fieldType,
  onOperatorSpy,
  onValueSpy,
  options,
}: {
  fieldType: DataTableColumnType;
  onOperatorSpy: (operator: FilterOperator) => void;
  onValueSpy: (value: string) => void;
  options?: FilterOperatorValueEditorProps['options'];
}) => {
  const [operator, setOperator] = useState<FilterOperator>(operatorsForFilterType(fieldType)[0]);
  const [value, setValue] = useState('');
  return (
    <FilterOperatorValueEditor
      fieldType={fieldType}
      operator={operator}
      value={value}
      options={options}
      onOperatorChange={(next) => {
        setOperator(next);
        onOperatorSpy(next);
      }}
      onValueChange={(next) => {
        setValue(next);
        onValueSpy(next);
      }}
    />
  );
};

const valueBox = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-mp-input-field='true']")!;

const padX = (el: HTMLElement) =>
  el.className
    .split(' ')
    .filter((c) => c.startsWith('_px-') || c.startsWith('_pl-') || c.startsWith('_pr-'))
    .toSorted();

const renderAtKnobs = (overrides: Partial<Knobs>) =>
  renderWithProviders(
    <Preset overrides={overrides}>
      <FilterOperatorValueEditor
        fieldType="text"
        operator="contains"
        value=""
        onOperatorChange={vi.fn<OperatorChange>()}
        onValueChange={vi.fn<ValueChange>()}
      />
    </Preset>,
  );

describe(FilterOperatorValueEditor, () => {
  describe('operator vocabulary', () => {
    it.each(fieldTypes)(
      '%s: the Condition select offers exactly operatorsForFilterType, labeled via filterOperatorLabel',
      async (fieldType) => {
        const { container } = renderEditor({ fieldType, options: statusOptions });
        expect(screen.getByText('Condition')).toBeInTheDocument();

        const [condition] = selectTriggers(container);
        const options = await openSelect(container, condition);
        expect(optionLabels(options)).toStrictEqual(
          operatorsForFilterType(fieldType).map((op) => filterOperatorLabel(op)),
        );
      },
    );

    it('picking a condition reports the operator, not its label', async () => {
      const onOperator = vi.fn<OperatorChange>();
      const { container } = renderWithProviders(
        <ControlledEditor
          fieldType="text"
          onOperatorSpy={onOperator}
          onValueSpy={vi.fn<ValueChange>()}
        />,
      );
      const [condition] = selectTriggers(container);
      const options = await openSelect(container, condition);
      const startsWith = options.find((option) => option.textContent?.trim() === 'Starts with');
      expect(startsWith).toBeDefined();
      pickOption(startsWith!);
      await waitFor(() => {
        expect(onOperator).toHaveBeenLastCalledWith('startsWith');
      });
    });
  });

  describe('value editor per field type', () => {
    it('text: a plain Input with the generic placeholder', () => {
      const { container } = renderEditor({ fieldType: 'text' });
      expect(screen.getByText('Value')).toBeInTheDocument();
      const input = screen.getByPlaceholderText('Enter value...');
      expect(input.getAttribute('inputmode')).not.toBe('numeric');
      expect(selectTriggers(container)).toHaveLength(1);
    });

    it('number: the Input asks for a numeric keyboard', () => {
      renderEditor({ fieldType: 'number' });
      const input = screen.getByPlaceholderText('Enter value...');
      expect(input.getAttribute('inputmode')).toBe('numeric');
    });

    it('date: the Input hints the ISO day format', () => {
      renderEditor({ fieldType: 'date' });
      expect(screen.getByPlaceholderText('YYYY-MM-DD')).toBeInTheDocument();
    });

    it('boolean: a Value select with True / False and no text input', async () => {
      const { container } = renderEditor({ fieldType: 'boolean' });
      const triggers = selectTriggers(container);
      expect(triggers).toHaveLength(2);
      expect(textInputs(container)).toHaveLength(0);
      expect(screen.getByText('Select...')).toBeInTheDocument();

      const options = await openSelect(container, triggers[1]);
      expect(optionLabels(options)).toStrictEqual(['True', 'False']);
    });

    it("select: a Value select over the column's options", async () => {
      const { container } = renderEditor({ fieldType: 'select', options: statusOptions });
      const triggers = selectTriggers(container);
      expect(triggers).toHaveLength(2);
      expect(textInputs(container)).toHaveLength(0);

      const options = await openSelect(container, triggers[1]);
      expect(optionLabels(options)).toStrictEqual(statusOptions.map((option) => option.label));
    });

    it('select without options falls back to the text Input', () => {
      const { container } = renderEditor({ fieldType: 'select' });
      expect(selectTriggers(container)).toHaveLength(1);
      expect(screen.getByPlaceholderText('Enter value...')).toBeInTheDocument();
    });

    it('shows the current value', () => {
      renderEditor({ fieldType: 'text', value: 'ada' });
      expect(screen.getByPlaceholderText<HTMLInputElement>('Enter value...').value).toBe('ada');
    });
  });

  describe('value-less operators', () => {
    it.each<FilterOperator>(['isEmpty', 'isNotEmpty'])('%s renders the Condition select only', (operator) => {
      const { container } = renderEditor({ fieldType: 'text', operator });
      expect(screen.getByText('Condition')).toBeInTheDocument();
      expect(screen.queryByText('Value')).toBeNull();
      expect(selectTriggers(container)).toHaveLength(1);
      expect(textInputs(container)).toHaveLength(0);
    });

    it('switching from a value-less operator back to one with a value restores the input', async () => {
      const onOperator = vi.fn<OperatorChange>();
      const { container, rerender } = renderWithProviders(
        <FilterOperatorValueEditor
          fieldType="text"
          operator="isEmpty"
          value=""
          onOperatorChange={onOperator}
          onValueChange={vi.fn<ValueChange>()}
        />,
      );
      expect(textInputs(container)).toHaveLength(0);
      rerender(
        <FilterOperatorValueEditor
          fieldType="text"
          operator="contains"
          value=""
          onOperatorChange={onOperator}
          onValueChange={vi.fn<ValueChange>()}
        />,
      );
      await waitFor(() => {
        expect(textInputs(container)).toHaveLength(1);
      });
    });
  });

  describe('callbacks', () => {
    it('typing reports the raw text through onValueChange', async () => {
      const onValue = vi.fn<ValueChange>();
      renderWithProviders(
        <ControlledEditor
          fieldType="text"
          onOperatorSpy={vi.fn<OperatorChange>()}
          onValueSpy={onValue}
        />,
      );
      const input = screen.getByPlaceholderText<HTMLInputElement>('Enter value...');
      fireEvent.change(input, { target: { value: 'ada' } });
      await waitFor(() => {
        expect(onValue).toHaveBeenLastCalledWith('ada');
      });
      expect(input.value).toBe('ada');
    });

    it('picking a boolean value reports the stringified flag', async () => {
      const onValue = vi.fn<ValueChange>();
      const { container } = renderWithProviders(
        <ControlledEditor
          fieldType="boolean"
          onOperatorSpy={vi.fn<OperatorChange>()}
          onValueSpy={onValue}
        />,
      );
      const options = await openSelect(container, selectTriggers(container)[1]);
      const no = options.find((option) => option.textContent?.trim() === 'False');
      expect(no).toBeDefined();
      pickOption(no!);
      await waitFor(() => {
        expect(onValue).toHaveBeenLastCalledWith('false');
      });
    });

    it('picking a select value reports the option value, not its label', async () => {
      const onValue = vi.fn<ValueChange>();
      const { container } = renderWithProviders(
        <ControlledEditor
          fieldType="select"
          options={statusOptions}
          onOperatorSpy={vi.fn<OperatorChange>()}
          onValueSpy={onValue}
        />,
      );
      const options = await openSelect(container, selectTriggers(container)[1]);
      const inProgress = options.find((option) => option.textContent?.trim() === 'In progress');
      expect(inProgress).toBeDefined();
      pickOption(inProgress!);
      await waitFor(() => {
        expect(onValue).toHaveBeenLastCalledWith('in-progress');
      });
    });
  });
  describe('knob laws (MPO-118)', () => {
    it('size small: Condition and Value both paint the small recipe', () => {
      const { container } = renderAtKnobs({ size: 'small' });
      const box = valueBox(container);
      expect(box.dataset.size).toBe('$3');
      expect(box.dataset.visualHeight).toBe('36');
      expect(selectTriggers(container)[0].dataset.visualHeight).toBe('36');
    });

    it('size large: the Value input follows the knob instead of a pinned $3', () => {
      const { container } = renderAtKnobs({ size: 'large' });
      const box = valueBox(container);
      expect(box.dataset.size).toBe('$5');
      expect(box.dataset.visualHeight).toBe('52');
      expect(selectTriggers(container)[0].dataset.visualHeight).toBe('52');
    });

    it('density comfortable: compact is not forced on the inner fields', () => {
      const { container } = renderAtKnobs({ density: 'comfortable' });
      expect(valueBox(container).dataset.density).toBe('comfortable');
    });

    it('density compact: the inner fields step with the density knob and keep their height', () => {
      const comfortable = renderAtKnobs({ density: 'comfortable', size: 'medium' });
      const comfortablePad = padX(selectTriggers(comfortable.container)[0]);
      const comfortableHeight = valueBox(comfortable.container).dataset.visualHeight;
      comfortable.unmount();

      const { container } = renderAtKnobs({ density: 'compact', size: 'medium' });
      const box = valueBox(container);
      expect(box.dataset.density).toBe('compact');
      expect(box.dataset.visualHeight).toBe(comfortableHeight);
      expect(comfortablePad.length).toBeGreaterThan(0);
      expect(padX(selectTriggers(container)[0])).not.toStrictEqual(comfortablePad);
    });
  });
});
