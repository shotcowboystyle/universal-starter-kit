/**
 * DataTableCell draft-until-commit policy tests (Escape-revert for pickers).
 *
 * Category (a) — single-tap discrete pickers (Select, DatePicker day-tap…)
 * commit immediately on selection; Escape/close just closes.
 * Category (b) — multi-step / free-entry editors (Stepper, PhoneInput, OTP,
 * MultiDatePicker) buffer edits as a draft in the cell layer and
 * only commit on explicit confirm (Enter in a text input, or focus leaving
 * the cell); Escape discards the draft. DateRangePicker commits complete
 * ranges immediately (its only emit) but Escape discards a half-picked range.
 *
 * The forms components are mocked with functional fakes that mirror the real
 * emit contracts (uncontrolled Stepper committing on blur, per-keystroke
 * PhoneInput, controlled OTP/MultiDate, complete-range-only DateRange), so
 * these tests exercise the CELL adapter's draft buffer — the real component
 * integration is browser-verified against Storybook.
 */

import { setTimeout as delay } from 'node:timers/promises';

import { renderWithProviders } from '@repo/test-utils';
import { act, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DataTableCell } from './index';
import type { DataTableCellProps } from './index';

type CellOnChange = DataTableCellProps['onChange'];
interface DateRangeFixture {
  start: string;
  end: string;
}

// ── Mock form components ──────────────────────────────────────

const createMock = (name: string) => {
  const Comp = ({ ref }: { ref?: React.Ref<HTMLDivElement> }) =>
    React.createElement('div', {
      'data-testid': `mock-${name}`,
      'data-component': name,
      ref,
    });
  Comp.displayName = `Mock${name}`;
  return Comp;
};

/** Uncontrolled like the real standalone Stepper: typing stays internal and
 * onChange fires the parsed number on blur (commitStandalone). */
const MockStepper = ({ defaultValue, onChange }: any) => {
  const [text, setText] = React.useState(defaultValue == null ? '' : String(defaultValue));
  return (
    <input
      data-testid="stepper-input"
      value={text}
      onChange={(event) => {
        setText(event.target.value);
      }}
      onBlur={() => onChange?.(text === '' ? null : Number(text))}
    />
  );
};

/** Uncontrolled like the real standalone PhoneInput: emits per keystroke. */
const MockPhoneInput = ({ defaultValue, onChange }: any) => {
  const [text, setText] = React.useState(defaultValue ?? '');
  return (
    <input
      data-testid="phone-input"
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onChange?.(event.target.value);
      }}
    />
  );
};

/** Controlled like the real OTPInput: emits the code per digit change. */
const MockOTPInput = ({ value, onChange }: any) => (
  <input
    data-testid="otp-input"
    value={value ?? ''}
    onChange={(event) => onChange?.(event.target.value)}
  />
);

/** Single-select commits immediately on option click (category a). */
const MockSelect = ({ value, onValueChange }: any) => (
  <button
    type="button"
    data-testid="select-trigger"
    onClick={() => onValueChange?.('beta')}>
    {String(value ?? '')}
  </button>
);

/** Controlled like the real TextArea: emits text per change. */
const MockTextArea = ({ value, onChangeText }: any) => (
  <textarea
    data-testid="textarea-input"
    value={value ?? ''}
    onChange={(event) => onChangeText?.(event.target.value)}
  />
);

/** Options render as toggle buttons with aria-pressed (mirrors Tamagui
 * ToggleGroup items: single type emits only on change). */
const MockToggleGroup = ({ value, onValueChange, options, type }: any) => {
  const multipleSelected = Array.isArray(value) ? value : [];
  const selected = type === 'multiple' ? multipleSelected : value;
  return (
    <div
      data-testid="toggle-group"
      data-value={JSON.stringify(selected)}>
      {(options ?? []).map((option: any) => {
        const pressed = type === 'multiple' ? (selected as string[]).includes(option.value) : option.value === selected;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            data-testid={`toggle-${option.value}`}
            onClick={() => {
              if (type === 'multiple') {
                const next = pressed
                  ? (selected as string[]).filter((v) => v !== option.value)
                  : [...(selected as string[]), option.value];
                onValueChange?.(next);
                return;
              }
              if (option.value !== selected) {
                onValueChange?.(option.value);
              }
            }}>
            {option.label}
          </button>
        );
      })}
    </div>
  );
};
const MockRadioGroup = ({ value, onValueChange, options }: any) => (
  <div
    data-testid="radio-group"
    data-value={String(value ?? '')}>
    {(options ?? []).map((option: any) => (
      <button
        key={option.value}
        type="button"
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- mirrors Tamagui's button-based radio items, which CellOptionsEditor matches by role
        role="radio"
        aria-checked={option.value === value}
        data-testid={`radio-${option.value}`}
        onClick={() => {
          if (option.value !== value) {
            onValueChange?.(option.value);
          }
        }}>
        {option.label}
      </button>
    ))}
  </div>
);

/**
 * Functional FloatingPanel fake: trigger toggles open; children render only
 * while open; Escape inside closes it (mirrors the popover/sheet contract
 * CellOptionsEditor and CellModalEditor rely on).
 */
const MockFloatingPanel = ({
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
}) => (
  <div data-testid="mock-FloatingPanel">
    {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- test double: the face inside owns the button role and keyboard handling */}
    <div
      data-testid="floating-panel-trigger"
      onClick={() => {
        if (disabled !== true) {
          onOpenChange?.(open !== true);
        }
      }}>
      {trigger}
    </div>
    {open === true ? (
      // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- test double: catches Escape bubbling from the panel content like the real panel's listener
      <div
        data-testid="floating-panel-content"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onOpenChange?.(false);
          }
        }}>
        {children}
      </div>
    ) : null}
  </div>
);

/** Mirrors the real DateRangePicker: picking a start date is internal-only
 * (no emit); onChange fires only when the range completes. */
const describeRange = (pendingStart: string | null, value: DateRangeFixture | null | undefined): string => {
  if (pendingStart !== null && pendingStart !== '') {
    return `${pendingStart} – end date`;
  }
  if (value) {
    return `${value.start} – ${value.end}`;
  }
  return 'empty';
};

const MockDateRangePicker = ({
  value,
  onChange,
}: {
  value?: DateRangeFixture | null;
  onChange?: (next: DateRangeFixture) => void;
}) => {
  const [pendingStart, setPendingStart] = React.useState<string | null>(null);
  const display = describeRange(pendingStart, value);
  return (
    <div>
      <span data-testid="daterange-display">{display}</span>
      <button
        type="button"
        data-testid="daterange-pick-start"
        aria-label="Pick start"
        onClick={() => {
          setPendingStart('2026-08-18');
        }}
      />
      <button
        type="button"
        data-testid="daterange-complete"
        aria-label="Complete range"
        onClick={() => {
          setPendingStart(null);
          onChange?.({ start: '2026-08-18', end: '2026-08-22' });
        }}
      />
    </div>
  );
};

/** Controlled like the real MultiDatePicker: emits the accumulated array on
 * every toggle. */
const MockMultiDatePicker = ({ value, onChange }: any) => {
  const dates: string[] = Array.isArray(value) ? value : [];
  return (
    <div>
      <span data-testid="multidate-display">{dates.join(',')}</span>
      <button
        type="button"
        data-testid="multidate-toggle-a"
        aria-label="Toggle A"
        onClick={() => onChange?.([...dates, 'A'])}
      />
      <button
        type="button"
        data-testid="multidate-toggle-b"
        aria-label="Toggle B"
        onClick={() => onChange?.([...dates, 'B'])}
      />
    </div>
  );
};

// Partial mock: real module first (module-scope exports like `zIndex` keep
// resolving for transitive imports), field components faked on top — the
// spec asserts draft/commit policy per field, not the fields themselves.
// oxlint-disable-next-line vitest/prefer-import-in-mock -- the field doubles are plain function components; the real Tamagui component types reject them in a typed factory
vi.mock('@repo/forms', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Checkbox: createMock('Checkbox'),
  Switch: createMock('Switch'),
  Select: MockSelect,
  Combobox: createMock('Combobox'),
  Input: createMock('Input'),
  TextArea: MockTextArea,
  Slider: createMock('Slider'),
  Progress: createMock('Progress'),
  RadioGroup: MockRadioGroup,
  FloatingPanel: MockFloatingPanel,
  ToggleGroup: MockToggleGroup,
  DatePicker: createMock('DatePicker'),
  DatetimePicker: createMock('DatetimePicker'),
  TimePicker: createMock('TimePicker'),
  DateRangePicker: MockDateRangePicker,
  MultiDatePicker: MockMultiDatePicker,
  Stepper: MockStepper,
  Duration: createMock('Duration'),
  PhoneInput: MockPhoneInput,
  Barcode: createMock('Barcode'),
  BarcodePreview: createMock('BarcodePreview'),
  MentionInput: createMock('MentionInput'),
  OTPInput: MockOTPInput,
  Rating: createMock('Rating'),
  FileUpload: createMock('FileUpload'),
  ImageField: createMock('ImageField'),
  Signature: createMock('Signature'),
  Geolocation: createMock('Geolocation'),
  ColorPicker: createMock('ColorPicker'),
  Button: ({ children, onPress, ...props }: { children?: React.ReactNode; onPress?: () => void }) =>
    React.createElement('button', { type: 'button', ...props, onClick: onPress }, children),
  FieldDisplay: (props: any) =>
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
      onChange={props.onChange ?? vi.fn<CellOnChange>()}
      columnId={props.columnId ?? 'test-col'}
      rowIndex={props.rowIndex ?? 0}
      {...props}
    />,
  );

/** Give the DraftFieldEditor's 0ms focus-out timer a chance to run. */
const flushBlurTimer = async () => {
  await act(async () => {
    await delay(15);
  });
};

const openModalEditor = async (field: 'markdowneditor' | 'textarea', value: string, onChange: CellOnChange) => {
  const utils = renderCell({ field, value, onChange });
  fireEvent.click(utils.baseElement.querySelector<HTMLElement>('[data-testid="mock-FieldDisplay"]')!);
  await waitFor(() => {
    expect(utils.baseElement.querySelector('[data-testid="textarea-input"]')).not.toBeNull();
  });
  return utils;
};

const openMarkdownModal = async (onChange: CellOnChange) =>
  await openModalEditor('markdowneditor', '# Heading', onChange);

const openTextareaModal = async (onChange: CellOnChange) => await openModalEditor('textarea', 'line one', onChange);

describe('DataTableCell draft policy — category (a) immediate commit', () => {
  it('select commits immediately on selection', () => {
    const onChange = vi.fn<CellOnChange>();
    const { getByTestId } = renderCell({ field: 'select', value: 'alpha', onChange });
    fireEvent.click(getByTestId('select-trigger'));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('beta');
  });
});

describe('DataTableCell draft policy — stepper (free-entry numeric)', () => {
  it('buffers the typed value and commits once on Enter', () => {
    const onChange = vi.fn<CellOnChange>();
    const { getByTestId } = renderCell({ field: 'stepper', value: 42, onChange });
    const input = getByTestId('stepper-input') as HTMLInputElement;

    act(() => {
      input.focus();
    });
    fireEvent.change(input, { target: { value: '77' } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(77);
  });

  it('commits once when focus leaves the cell', async () => {
    const onChange = vi.fn<CellOnChange>();
    const { getByTestId } = renderCell({ field: 'stepper', value: 42, onChange });
    const input = getByTestId('stepper-input') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '77' } });
    // oxlint-disable-next-line github/no-blur -- dispatches a synthetic blur event to drive the cell's focus-out commit; focus is not moved
    fireEvent.blur(input);
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(77);
    });
    await flushBlurTimer();
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('Escape reverts the typed value without committing', () => {
    const onChange = vi.fn<CellOnChange>();
    const { getByTestId } = renderCell({ field: 'stepper', value: 42, onChange });
    let input = getByTestId('stepper-input') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '77' } });
    expect(input.value).toBe('77');

    fireEvent.keyDown(input, { key: 'Escape' });
    input = getByTestId('stepper-input') as HTMLInputElement;
    expect(input.value).toBe('42');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows an external value change in the uncontrolled editor (MPO-475)', () => {
    const onChange = vi.fn<CellOnChange>();
    const { getByTestId, rerender } = renderCell({ field: 'stepper', value: 42, onChange });
    expect((getByTestId('stepper-input') as HTMLInputElement).value).toBe('42');

    rerender(
      <DataTableCell
        field="stepper"
        value={9}
        onChange={onChange}
        columnId="test-col"
        rowIndex={0}
      />,
    );
    expect((getByTestId('stepper-input') as HTMLInputElement).value).toBe('9');
  });

  it('keeps the editor mounted when its own commit comes back as the value (MPO-475)', () => {
    const onChange = vi.fn<CellOnChange>();
    const { getByTestId, rerender } = renderCell({ field: 'stepper', value: 42, onChange });
    const input = getByTestId('stepper-input') as HTMLInputElement;

    act(() => {
      input.focus();
    });
    fireEvent.change(input, { target: { value: '77' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(77);

    rerender(
      <DataTableCell
        field="stepper"
        value={77}
        onChange={onChange}
        columnId="test-col"
        rowIndex={0}
      />,
    );
    expect(getByTestId('stepper-input')).toBe(input);
    expect(input.value).toBe('77');
  });
});

describe('DataTableCell draft policy — phoneinput (free entry)', () => {
  it('buffers keystrokes and commits once on blur', async () => {
    const onChange = vi.fn<CellOnChange>();
    const { getByTestId } = renderCell({
      field: 'phoneinput',
      value: '+15125551234',
      onChange,
    });
    const input = getByTestId('phone-input') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '5125559999' } });
    expect(onChange).not.toHaveBeenCalled();

    // oxlint-disable-next-line github/no-blur -- dispatches a synthetic blur event to drive the cell's focus-out commit; focus is not moved
    fireEvent.blur(input);
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('5125559999');
    });
    await flushBlurTimer();
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('Escape discards the draft and restores the committed value', () => {
    const onChange = vi.fn<CellOnChange>();
    const { getByTestId } = renderCell({
      field: 'phoneinput',
      value: '+15125551234',
      onChange,
    });
    let input = getByTestId('phone-input') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '5125559999' } });
    expect(input.value).toBe('5125559999');

    fireEvent.keyDown(input, { key: 'Escape' });
    input = getByTestId('phone-input') as HTMLInputElement;
    expect(input.value).toBe('+15125551234');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows an external value change in the uncontrolled editor (MPO-475)', () => {
    const onChange = vi.fn<CellOnChange>();
    const { getByTestId, rerender } = renderCell({
      field: 'phoneinput',
      value: '+15125551234',
      onChange,
    });

    rerender(
      <DataTableCell
        field="phoneinput"
        value="+15125550000"
        onChange={onChange}
        columnId="test-col"
        rowIndex={0}
      />,
    );
    expect((getByTestId('phone-input') as HTMLInputElement).value).toBe('+15125550000');
  });
});

describe('DataTableCell draft policy — otp (multi-digit accumulation)', () => {
  it('does not commit while focus moves within the cell, commits on leave', async () => {
    const onChange = vi.fn<CellOnChange>();
    const { getByTestId } = renderCell({ field: 'otp', value: '111111', onChange });
    const input = getByTestId('otp-input') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '123456' } });
    expect(onChange).not.toHaveBeenCalled();

    // Focus bouncing between elements inside the cell (auto-advance) must
    // not commit: the focus-in cancels the pending focus-out commit.
    // oxlint-disable-next-line github/no-blur -- dispatches a synthetic blur event to drive the cell's focus-out commit; focus is not moved
    fireEvent.blur(input);
    fireEvent.focus(input);
    await flushBlurTimer();
    expect(onChange).not.toHaveBeenCalled();

    // oxlint-disable-next-line github/no-blur -- dispatches a synthetic blur event to drive the cell's focus-out commit; focus is not moved
    fireEvent.blur(input);
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('123456');
    });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('Escape reverts the digits without committing', () => {
    const onChange = vi.fn<CellOnChange>();
    const { getByTestId } = renderCell({ field: 'otp', value: '111111', onChange });
    let input = getByTestId('otp-input') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '123456' } });
    expect(input.value).toBe('123456');

    fireEvent.keyDown(input, { key: 'Escape' });
    input = getByTestId('otp-input') as HTMLInputElement;
    expect(input.value).toBe('111111');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('DataTableCell draft policy — daterangepicker', () => {
  const committedRange = { start: '2026-01-01', end: '2026-01-05' };

  it('mid-pick Escape discards the half-picked range without committing', () => {
    const onChange = vi.fn<CellOnChange>();
    const { getByTestId } = renderCell({
      field: 'daterangepicker',
      value: committedRange,
      onChange,
    });

    fireEvent.click(getByTestId('daterange-pick-start'));
    expect(getByTestId('daterange-display').textContent).toBe('2026-08-18 – end date');
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(getByTestId('daterange-display'), { key: 'Escape' });
    expect(getByTestId('daterange-display').textContent).toBe('2026-01-01 – 2026-01-05');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('commits immediately when the range completes', () => {
    const onChange = vi.fn<CellOnChange>();
    const { getByTestId } = renderCell({
      field: 'daterangepicker',
      value: committedRange,
      onChange,
    });

    fireEvent.click(getByTestId('daterange-complete'));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ start: '2026-08-18', end: '2026-08-22' });
  });
});

describe('DataTableCell draft policy — multidatepicker (accumulation)', () => {
  it('accumulates toggles as a draft and commits once when focus leaves', async () => {
    const onChange = vi.fn<CellOnChange>();
    const { getByTestId } = renderCell({
      field: 'multidatepicker',
      value: ['D0'],
      onChange,
    });

    fireEvent.click(getByTestId('multidate-toggle-a'));
    expect(getByTestId('multidate-display').textContent).toBe('D0,A');
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(getByTestId('multidate-toggle-b'));
    expect(getByTestId('multidate-display').textContent).toBe('D0,A,B');
    expect(onChange).not.toHaveBeenCalled();

    // oxlint-disable-next-line github/no-blur -- dispatches a synthetic blur event to drive the cell's focus-out commit; focus is not moved
    fireEvent.blur(getByTestId('multidate-toggle-b'));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(['D0', 'A', 'B']);
    });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('Escape discards the accumulated draft without committing', () => {
    const onChange = vi.fn<CellOnChange>();
    const { getByTestId } = renderCell({
      field: 'multidatepicker',
      value: ['D0'],
      onChange,
    });

    fireEvent.click(getByTestId('multidate-toggle-a'));
    expect(getByTestId('multidate-display').textContent).toBe('D0,A');

    fireEvent.keyDown(getByTestId('multidate-display'), { key: 'Escape' });
    expect(getByTestId('multidate-display').textContent).toBe('D0');
    expect(onChange).not.toHaveBeenCalled();
  });
});

// ── Modal editor staging (UX-023 / Axiom 7 AGENCY) ────────────
//
// The modal is a staging buffer: edits stay in a local draft while the
// modal is open; Done commits once; Cancel and Escape discard.

describe('CellModalEditor staging — markdowneditor', () => {
  it('edits stay in the draft; Done commits once', async () => {
    const onChange = vi.fn<CellOnChange>();
    const { baseElement, getByText } = await openMarkdownModal(onChange);
    const textarea = baseElement.querySelector<HTMLTextAreaElement>('[data-testid="textarea-input"]')!;

    fireEvent.change(textarea, { target: { value: '# Changed' } });
    expect(textarea.value).toBe('# Changed');
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(getByText('Done'));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('# Changed');
    });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('Cancel discards the draft (LC-30: exit never commit-gated)', async () => {
    const onChange = vi.fn<CellOnChange>();
    const { baseElement, getByText } = await openMarkdownModal(onChange);
    const textarea = baseElement.querySelector<HTMLTextAreaElement>('[data-testid="textarea-input"]')!;

    fireEvent.change(textarea, { target: { value: '# Changed' } });
    fireEvent.click(getByText('Cancel'));

    await waitFor(() => {
      expect(baseElement.querySelector('[data-testid="textarea-input"]')).toBeNull();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Escape discards the draft', async () => {
    const onChange = vi.fn<CellOnChange>();
    const { baseElement } = await openMarkdownModal(onChange);
    const textarea = baseElement.querySelector<HTMLTextAreaElement>('[data-testid="textarea-input"]')!;

    fireEvent.change(textarea, { target: { value: '# Changed' } });
    fireEvent.keyDown(textarea, { key: 'Escape' });

    await waitFor(() => {
      expect(baseElement.querySelector('[data-testid="textarea-input"]')).toBeNull();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reopening after Cancel shows the committed value, not the discarded draft', async () => {
    const onChange = vi.fn<CellOnChange>();
    const { baseElement, getByText } = await openMarkdownModal(onChange);
    let textarea = baseElement.querySelector<HTMLTextAreaElement>('[data-testid="textarea-input"]')!;

    fireEvent.change(textarea, { target: { value: '# Changed' } });
    fireEvent.click(getByText('Cancel'));
    await waitFor(() => {
      expect(baseElement.querySelector('[data-testid="textarea-input"]')).toBeNull();
    });

    fireEvent.click(baseElement.querySelector<HTMLElement>('[data-testid="mock-FieldDisplay"]')!);
    await waitFor(() => {
      expect(baseElement.querySelector('[data-testid="textarea-input"]')).not.toBeNull();
    });
    textarea = baseElement.querySelector<HTMLTextAreaElement>('[data-testid="textarea-input"]')!;
    expect(textarea.value).toBe('# Heading');
    expect(onChange).not.toHaveBeenCalled();
  });
});

// ── Radio options popover (UX-022 / LC-06 OVERSIZED-EDIT) ─────
//
// The radio option list escapes the cell anchor: the cell face is the
// current option label; options live in a popover/sheet; a pick commits
// and closes (LC-21 COMMIT class).

describe('DataTableCell radiogroup — options escape the anchor', () => {
  const options = [
    { label: 'Low', value: 'low' },
    { label: 'Medium', value: 'medium' },
    { label: 'High', value: 'high' },
  ];

  it('renders a compact face; options only mount in the panel after click', async () => {
    const onChange = vi.fn<CellOnChange>();
    const { baseElement, getByTestId, queryByTestId } = renderCell({
      field: 'radiogroup',
      value: 'medium',
      fieldProps: { options },
      onChange,
    });

    // Closed: face only, no inline radio options (nothing to clip at 150px).
    expect(queryByTestId('radio-group')).toBeNull();
    expect(getByTestId('mock-FieldDisplay').dataset.field).toBe('radiogroup');

    fireEvent.click(getByTestId('floating-panel-trigger'));
    await waitFor(() => {
      expect(queryByTestId('radio-group')).not.toBeNull();
    });

    // Seeded at the cell's current value; every option reachable.
    expect(getByTestId('radio-group').dataset.value).toBe('medium');
    expect(baseElement.querySelector('[data-testid="radio-high"]')).not.toBeNull();
  });

  it('a pick commits immediately and closes the panel (LC-21 COMMIT)', async () => {
    const onChange = vi.fn<CellOnChange>();
    const { getByTestId, queryByTestId } = renderCell({
      field: 'radiogroup',
      value: 'medium',
      fieldProps: { options },
      onChange,
    });

    fireEvent.click(getByTestId('floating-panel-trigger'));
    await waitFor(() => {
      expect(queryByTestId('radio-group')).not.toBeNull();
    });

    fireEvent.click(getByTestId('radio-high'));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('high');
    await waitFor(() => {
      expect(queryByTestId('radio-group')).toBeNull();
    });
  });

  it('re-picking the already-selected option still closes (picking IS the exit)', async () => {
    const onChange = vi.fn<CellOnChange>();
    const { getByTestId, queryByTestId } = renderCell({
      field: 'radiogroup',
      value: 'medium',
      fieldProps: { options },
      onChange,
    });

    fireEvent.click(getByTestId('floating-panel-trigger'));
    await waitFor(() => {
      expect(queryByTestId('radio-group')).not.toBeNull();
    });

    // Same-value pick: no onValueChange fires (real Tamagui radio contract) —
    // the host's option-press close must still dismiss the panel.
    fireEvent.pointerUp(getByTestId('radio-medium'));
    await waitFor(() => {
      expect(queryByTestId('radio-group')).toBeNull();
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('DataTableCell togglegroup — options escape the anchor', () => {
  const options = [
    { label: 'Bold', value: 'bold' },
    { label: 'Italic', value: 'italic' },
    { label: 'Underline', value: 'underline' },
  ];

  it('renders a compact face; options only mount in the panel after click', async () => {
    const onChange = vi.fn<CellOnChange>();
    const { getByTestId, queryByTestId } = renderCell({
      field: 'togglegroup',
      value: 'bold',
      fieldProps: { options },
      onChange,
    });

    expect(queryByTestId('toggle-group')).toBeNull();
    expect(getByTestId('mock-FieldDisplay').dataset.field).toBe('togglegroup');

    fireEvent.click(getByTestId('floating-panel-trigger'));
    await waitFor(() => {
      expect(queryByTestId('toggle-group')).not.toBeNull();
    });
    expect(getByTestId('toggle-group').dataset.value).toBe(JSON.stringify('bold'));
  });

  it('a single pick commits immediately and closes the panel (LC-21 COMMIT)', async () => {
    const onChange = vi.fn<CellOnChange>();
    const { getByTestId, queryByTestId } = renderCell({
      field: 'togglegroup',
      value: 'bold',
      fieldProps: { options },
      onChange,
    });

    fireEvent.click(getByTestId('floating-panel-trigger'));
    await waitFor(() => {
      expect(queryByTestId('toggle-group')).not.toBeNull();
    });

    fireEvent.click(getByTestId('toggle-italic'));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('italic');
    await waitFor(() => {
      expect(queryByTestId('toggle-group')).toBeNull();
    });
  });

  it('multi-select stays open so options can be composed (LC-21 COMPOSE)', async () => {
    const onChange = vi.fn<CellOnChange>();
    const { getByTestId, queryByTestId } = renderCell({
      field: 'togglegroup',
      value: ['bold'],
      fieldProps: { options, allowMultiple: true },
      onChange,
    });

    fireEvent.click(getByTestId('floating-panel-trigger'));
    await waitFor(() => {
      expect(queryByTestId('toggle-group')).not.toBeNull();
    });

    fireEvent.click(getByTestId('toggle-italic'));
    expect(onChange).toHaveBeenCalledWith(['bold', 'italic']);
    expect(queryByTestId('toggle-group')).not.toBeNull();

    fireEvent.pointerUp(getByTestId('toggle-italic'));
    expect(queryByTestId('toggle-group')).not.toBeNull();
  });
});

describe('CellModalEditor staging — textarea (LC-06 oversized edit)', () => {
  it('keeps a single-line face; edits stay in the draft until Done', async () => {
    const onChange = vi.fn<CellOnChange>();
    const { baseElement, getByText } = await openTextareaModal(onChange);
    const textarea = baseElement.querySelector<HTMLTextAreaElement>('[data-testid="textarea-input"]')!;

    fireEvent.change(textarea, { target: { value: 'line two' } });
    expect(textarea.value).toBe('line two');
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(getByText('Done'));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('line two');
    });
    expect(onChange).toHaveBeenCalledOnce();
  });
});
