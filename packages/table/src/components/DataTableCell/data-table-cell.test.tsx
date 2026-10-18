/**
 * DataTableCell field type parity tests - 8 focused tests for Task Group 4.
 *
 * Verifies that field types render their actual form components instead of
 * simplified Input-based fallbacks.
 *
 * Test strategy: We mock @repo/forms and @repo/rich-text
 * with named test components, then verify DataTableCell routes each field type
 * to the correct component by checking data-component attributes in the DOM.
 * This is necessary because the forms barrel import triggers a circular
 * resolution issue in vitest (forms re-exports tableCellContext from table).
 */

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { DataTableFieldProps } from '../../types';

import { DataTableCell } from './index';
import type { DataTableCellProps } from './index';

// ── Mock form components ──────────────────────────────────────

const createMock = (name: string) => {
  const Comp = ({ currency, ref }: { currency?: string; ref?: React.Ref<HTMLDivElement> }) =>
    React.createElement('div', {
      'data-testid': `mock-${name}`,
      'data-component': name,
      'data-currency': currency,
      ref,
    });
  Comp.displayName = `Mock${name}`;
  return Comp;
};

// Partial mock: real module first (module-scope exports like `zIndex` keep
// resolving for transitive imports), field components faked on top — the
// spec asserts ROUTING to fields, not the fields themselves.
// oxlint-disable-next-line vitest/prefer-import-in-mock -- the field doubles are plain function components; the real Tamagui component types reject them in a typed factory
vi.mock('@repo/forms', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Checkbox: createMock('Checkbox'),
  Switch: createMock('Switch'),
  Select: createMock('Select'),
  Combobox: createMock('Combobox'),
  Input: createMock('Input'),
  TextArea: createMock('TextArea'),
  Slider: createMock('Slider'),
  Progress: createMock('Progress'),
  RadioGroup: createMock('RadioGroup'),
  ToggleGroup: createMock('ToggleGroup'),
  // Functional fake: trigger toggles open; children render only while open
  // (the popover host CellOptionsEditor mounts option groups through it).
  FloatingPanel: ({
    open,
    onOpenChange,
    trigger,
    children,
    disabled,
  }: {
    open?: boolean;
    onOpenChange?: (next: boolean) => void;
    trigger?: React.ReactNode;
    children?: React.ReactNode;
    disabled?: boolean;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'mock-FloatingPanel' },
      React.createElement(
        'div',
        {
          'data-testid': 'floating-panel-trigger',
          onClick: () => {
            if (disabled !== true) {
              onOpenChange?.(!open);
            }
          },
        },
        trigger,
      ),
      open === true ? React.createElement('div', { 'data-testid': 'floating-panel-content' }, children) : null,
    ),
  DatePicker: createMock('DatePicker'),
  DatetimePicker: createMock('DatetimePicker'),
  TimePicker: createMock('TimePicker'),
  DateRangePicker: createMock('DateRangePicker'),
  MultiDatePicker: createMock('MultiDatePicker'),
  Stepper: createMock('Stepper'),
  Duration: createMock('Duration'),
  PhoneInput: createMock('PhoneInput'),
  Barcode: createMock('Barcode'),
  BarcodePreview: createMock('BarcodePreview'),
  MentionInput: createMock('MentionInput'),
  OTPInput: createMock('OTPInput'),
  Rating: createMock('Rating'),
  FileUpload: createMock('FileUpload'),
  ImageField: createMock('ImageField'),
  Signature: createMock('Signature'),
  Geolocation: createMock('Geolocation'),
  ColorPicker: createMock('ColorPicker'),
  Button: ({ children, onPress, ...props }: { children?: React.ReactNode; onPress?: () => void }) =>
    React.createElement('button', { type: 'button', ...props, onClick: onPress }, children),
  // Compact in-cell summary used by CellModalEditor; expose the routed field
  // type so tests can assert which field the cell delegates to.
  FieldDisplay: (props: { field?: string }) =>
    React.createElement('div', {
      'data-testid': 'mock-FieldDisplay',
      'data-component': 'FieldDisplay',
      'data-field': props.field,
    }),
}));

// oxlint-disable-next-line vitest/prefer-import-in-mock -- @repo/rich-text ships no built type declarations, so a typed import() cannot resolve
vi.mock('@repo/rich-text', () => ({
  RichTextEditor: createMock('RichTextEditor'),
}));

// Partial mock (importOriginal): only the knobs hook is stubbed — real
// module-scope exports (MIN_PRESS_TARGET, press-target helpers, formatters)
// keep resolving for every component this spec transitively imports.
// oxlint-disable-next-line vitest/prefer-import-in-mock -- the knobs stub is partial; the real useResolvedKnobs return type rejects it in a typed factory
vi.mock('@repo/theme', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useResolvedKnobs: () => ({
    knobProps: {
      sizeToken: '$3',
      borderRadius: { borderRadius: 4 },
      gap: { gap: 4 },
      body: {},
      surface: {},
      inputSurface: {},
      panelPadding: {},
      control: {},
      transition: 'quick',
    },
    control: {
      focusVisibleKnobProps: {
        outlineWidth: 2,
        outlineStyle: 'solid',
        outlineColor: '$outlineColor',
        outlineOffset: -2,
      },
    },
  }),
}));

const renderCell = (props: Partial<React.ComponentProps<typeof DataTableCell>>) =>
  renderWithProviders(
    <DataTableCell
      value={props.value ?? ''}
      onChange={props.onChange ?? vi.fn<DataTableCellProps['onChange']>()}
      columnId={props.columnId ?? 'test-col'}
      rowIndex={props.rowIndex ?? 0}
      {...props}
    />,
  );

const expectRendered = (container: HTMLElement, name: string) => {
  const el = container.querySelector(`[data-component="${name}"]`);
  expect(el, `Expected ${name} to render`).not.toBeNull();
};

const expectNotRendered = (container: HTMLElement, name: string) => {
  const el = container.querySelector(`[data-component="${name}"]`);
  expect(el, `Expected ${name} NOT to render`).toBeNull();
};

// The "heavy" field types render through CellModalEditor: the cell shows a
// compact FieldDisplay summary and the real form component mounts inside the
// panel when the cell is clicked. This asserts both halves of that contract.
const expectModalEditor = async (
  renderProps: Partial<React.ComponentProps<typeof DataTableCell>>,
  fieldType: string,
  editorName: string,
) => {
  const { container, baseElement } = renderCell(renderProps);
  // Cell shows the compact FieldDisplay summary routed to the right field
  const display = container.querySelector<HTMLElement>('[data-component="FieldDisplay"]');
  expect(display, `Expected FieldDisplay to render for ${fieldType}`).not.toBeNull();
  expect(display?.dataset.field).toBe(fieldType);
  // Editor is not mounted until the cell is clicked
  expectNotRendered(baseElement, editorName);
  // Clicking the cell opens the panel containing the real editor. The
  // panel renders inline (no portal), so the cell FACE is the trigger
  // subtree and the editor lives in the panel content beside it.
  fireEvent.click(display!);
  await waitFor(() => {
    expectRendered(baseElement, editorName);
  });
  const face = container.querySelector<HTMLElement>('[data-testid="floating-panel-trigger"]')!;
  const panel = container.querySelector<HTMLElement>('[data-testid="floating-panel-content"]')!;
  expectRendered(panel, editorName);
  return { container, baseElement, face, panel };
};

describe('DataTableCell field type parity', () => {
  // oxlint-disable-next-line vitest/expect-expect -- the assertions live in the expectRendered/expectNotRendered/expectModalEditor helpers
  it('datepicker renders DatePicker, not plain Input', () => {
    const { container } = renderCell({
      field: 'datepicker',
      value: new Date('2024-01-15'),
    });
    expectRendered(container, 'DatePicker');
    expectNotRendered(container, 'Input');
  });

  // oxlint-disable-next-line vitest/expect-expect -- the assertions live in the expectRendered/expectNotRendered/expectModalEditor helpers
  it('timepicker renders TimePicker, not plain Input', () => {
    const { container } = renderCell({
      field: 'timepicker',
      value: '14:30',
    });
    expectRendered(container, 'TimePicker');
    expectNotRendered(container, 'Input');
  });

  // oxlint-disable-next-line vitest/expect-expect -- the assertions live in the expectRendered/expectNotRendered/expectModalEditor helpers
  it('stepper renders Stepper, not number-mode Input', () => {
    const { container } = renderCell({
      field: 'stepper',
      value: 42,
    });
    expectRendered(container, 'Stepper');
    expectNotRendered(container, 'Input');
  });

  it('a currency stepper cell hands the currency to Stepper (MPO-221)', () => {
    const { container } = renderCell({
      field: 'stepper',
      value: 42,
      fieldProps: { currency: 'USD' },
    });
    expect(container.querySelector<HTMLElement>('[data-component="Stepper"]')?.dataset.currency).toBe('USD');
  });

  // oxlint-disable-next-line vitest/expect-expect -- the assertions live in the expectRendered/expectNotRendered/expectModalEditor helpers
  it('rating renders Rating, not custom star icons', () => {
    const { container } = renderCell({
      field: 'rating',
      value: 0.6,
      fieldProps: {
        starIcon: ({ size: _size, weight: _weight, color: _color }: any) => React.createElement('span', null, 'star'),
      },
    });
    expectRendered(container, 'Rating');
    expectNotRendered(container, 'Input');
  });

  it('fileupload renders FileUpload, not custom FileUploadCell', async () => {
    const { container } = await expectModalEditor({ field: 'fileupload', value: null }, 'fileupload', 'FileUpload');
    // Old FileUploadCell had "Attach" text in the cell
    expect(container.textContent).not.toContain('Attach');
  });

  it('signature renders Signature, not status text', async () => {
    const { face } = await expectModalEditor({ field: 'signature', value: '' }, 'signature', 'Signature');
    // Old implementation showed "Not signed" / "Sign" in the cell
    expect(face.textContent).not.toContain('Not signed');
    expect(face.textContent).not.toContain('Sign');
  });

  // oxlint-disable-next-line vitest/expect-expect -- the assertions live in the expectRendered/expectNotRendered/expectModalEditor helpers
  it('geolocation renders Geolocation, not two plain Inputs', async () => {
    const { container, baseElement } = await expectModalEditor(
      {
        field: 'geolocation',
        value: JSON.stringify({ lat: 40.7128, lng: -74.006 }),
        fieldProps: {
          locationIcon: React.createElement('span', null, 'loc'),
        },
      },
      'geolocation',
      'Geolocation',
    );
    expectNotRendered(container, 'Input');
    expectNotRendered(baseElement, 'Input');
  });

  // oxlint-disable-next-line vitest/expect-expect -- the assertions live in the expectRendered/expectNotRendered/expectModalEditor helpers
  it('richtexteditor renders RichTextEditor', async () => {
    const { container, baseElement } = await expectModalEditor(
      { field: 'richtexteditor', value: '<p>Hello</p>' },
      'richtexteditor',
      'RichTextEditor',
    );
    expectNotRendered(container, 'TextArea');
    expectNotRendered(baseElement, 'TextArea');
  });

  // oxlint-disable-next-line vitest/expect-expect -- the assertions live in the expectRendered/expectNotRendered/expectModalEditor helpers
  it('barcode routes through the modal editor (LC-06), never inline in the cell', async () => {
    const { face, panel } = await expectModalEditor({ field: 'barcode', value: 'SKU-001234' }, 'barcode', 'Barcode');
    // The full editor (with its camera scanner surface) must not mount inline
    // in the cell face — only inside the panel after click.
    expectNotRendered(face, 'Barcode');
    // The panel also carries the large scannable preview.
    expectRendered(panel, 'BarcodePreview');
  });

  it("custom render receives the cell's honest state as the render context (D-18.4)", () => {
    const seen: ({ readOnly: boolean; disabled: boolean } | undefined)[] = [];
    const render = vi.fn<NonNullable<DataTableFieldProps['render']>>((value, _row, _onChange, context) => {
      seen.push(context);
      return React.createElement('div', { 'data-component': 'CustomCell' }, String(value));
    });

    const { container } = renderCell({
      field: 'custom',
      value: 'v1',
      fieldProps: { render },
    });
    expectRendered(container, 'CustomCell');
    expect(seen.at(-1)).toStrictEqual({ readOnly: false, disabled: false });

    const readOnlyCell = renderCell({
      field: 'custom',
      value: 'v1',
      fieldProps: { render },
      readOnly: true,
    });
    // The custom branch still owns the read-only presentation (no FieldDisplay
    // fallback) — the context flag is how it goes non-interactive.
    expectRendered(readOnlyCell.container, 'CustomCell');
    expectNotRendered(readOnlyCell.container, 'FieldDisplay');
    expect(seen.at(-1)).toStrictEqual({ readOnly: true, disabled: false });
  });

  it('custom cell commits are blocked while read-only (data stays safe)', () => {
    const onChange = vi.fn<DataTableCellProps['onChange']>();
    let commit: ((value: any) => void) | undefined;
    renderCell({
      field: 'custom',
      value: 'v1',
      onChange,
      readOnly: true,
      fieldProps: {
        render: (_value: any, _row: any, cellCommit: (value: any) => void) => {
          commit = cellCommit;
          return React.createElement('div', { 'data-component': 'CustomCell' });
        },
      },
    });
    commit?.('v2');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('radiogroup routes through the popover editor (LC-06), never inline in the cell', async () => {
    const { container, baseElement } = renderCell({
      field: 'radiogroup',
      value: 'medium',
      fieldProps: {
        options: [
          { label: 'Low', value: 'low' },
          { label: 'Medium', value: 'medium' },
          { label: 'High', value: 'high' },
        ],
      },
    });
    // Cell face is the compact FieldDisplay summary — the option row must not
    // mount inline where narrow columns would clip it (UX-022).
    const display = container.querySelector<HTMLElement>('[data-component="FieldDisplay"]');
    expect(display?.dataset.field).toBe('radiogroup');
    expectNotRendered(baseElement, 'RadioGroup');
    // Opening the panel mounts the full option group.
    fireEvent.click(container.querySelector('[data-testid="floating-panel-trigger"]')!);
    await waitFor(() => {
      expectRendered(baseElement, 'RadioGroup');
    });
  });

  it('togglegroup routes through the popover editor (LC-06), never inline in the cell', async () => {
    const { container, baseElement } = renderCell({
      field: 'togglegroup',
      value: 'bold',
      fieldProps: {
        options: [
          { label: 'Bold', value: 'bold' },
          { label: 'Italic', value: 'italic' },
          { label: 'Underline', value: 'underline' },
        ],
      },
    });
    const display = container.querySelector<HTMLElement>('[data-component="FieldDisplay"]');
    expect(display?.dataset.field).toBe('togglegroup');
    expectNotRendered(baseElement, 'ToggleGroup');
    fireEvent.click(container.querySelector('[data-testid="floating-panel-trigger"]')!);
    await waitFor(() => {
      expectRendered(baseElement, 'ToggleGroup');
    });
  });

  // oxlint-disable-next-line vitest/expect-expect -- the assertions live in the expectRendered/expectNotRendered/expectModalEditor helpers
  it('textarea routes through the modal editor (LC-06), never inline in the cell', async () => {
    const { face, panel } = await expectModalEditor(
      { field: 'textarea', value: 'line one\nline two' },
      'textarea',
      'TextArea',
    );
    expectNotRendered(face, 'TextArea');
    expectRendered(panel, 'TextArea');
  });

  it('cell chrome carries the LC-71 composite ring class (keyboard-only, not mouse-within)', () => {
    const { container } = renderCell({ field: 'input', value: 'acme' });
    const ring = container.querySelector('.mp-composite-ring.mp-composite-ring-deep');
    expect(ring).not.toBeNull();
  });
});
