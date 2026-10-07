/**
 * LongText contract specs. Frappe's `Long Text` and `Text` fieldtypes both land
 * here, and the adapter's whole job is: compose the forms TextArea (never fork
 * Input chrome), emit canonical onChange, and translate the Frappe-shaped
 * `minHeight` in pixels into the TextArea's row budget.
 *
 * The row budget is the one piece of real arithmetic in the file
 * (`minRows = minHeight ? max(4, round(minHeight / 24)) : 6`, maxRows 16).
 *
 * It does NOT reach the DOM as the textarea's `rows` attribute. TextArea
 * spreads `numberOfLines: minRows` onto the Tamagui TextArea, and on web that
 * prop is dropped: `rows` measured 3 for every adapter at every minHeight
 * (SmallText's 2 included). What the budget DOES drive is the rendered minimum
 * height, `getFieldHeight(size, minRows)`, so the rows are asserted through
 * that instead — one row of pixels is read off a known 2-row render rather
 * than hard-coded, so a size-token change moves both sides together.
 */
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getFieldComponent } from '../../fieldRegistry';
import type { FieldRenderProps } from '../../fieldRegistry';
import { SmallText } from '../SmallText';

import { LongText } from '.';

afterEach(cleanup);

/** Rendered minimum height in px, off the Tamagui `_mih-<n>px` class. */
const minHeightPxOf = (container: HTMLElement) => {
  const cls = container.querySelector('textarea')?.getAttribute('class') ?? '';
  const match = /(?:^|\s)_mih-(\d+)px(?:\s|$)/.exec(cls);
  return match ? Number(match[1]) : undefined;
};

/**
 * One text row in px, derived from SmallText's fixed two-row budget rather
 * than hard-coded, so this spec follows a size-token change instead of
 * breaking on one.
 */
function rowPx(): number {
  const probe = renderWithProviders(
    <SmallText
      label="probe"
      value=""
      onChange={() => {}}
    />,
  );
  const px = minHeightPxOf(probe.container);
  cleanup();
  if (!px) {
    throw new Error('could not measure a row: SmallText rendered no _mih- class');
  }
  return px / 2;
}

/** Rendered rows = rendered minimum height / one row. */
const rowsOf = (container: HTMLElement) => {
  const px = minHeightPxOf(container);
  return px === undefined ? undefined : String(px / rowPx());
};

describe('LongText composes the forms TextArea', () => {
  it('renders a textarea, not a single-line input', () => {
    const result = renderWithProviders(
      <LongText
        label="Notes"
        value=""
        onChange={() => {}}
      />,
    );
    expect(result.getTextArea()).toBeTruthy();
    expect(result.container.querySelector('input[type="text"]')).toBeNull();
  });

  it('shows the controlled value', () => {
    const result = renderWithProviders(
      <LongText
        label="Notes"
        value="line one"
        onChange={() => {}}
      />,
    );
    expect((result.getTextArea() as HTMLTextAreaElement).value).toBe('line one');
  });

  it('emits the text through canonical onChange', () => {
    const onChange = vi.fn();
    const result = renderWithProviders(
      <LongText
        label="Notes"
        value=""
        onChange={onChange}
      />,
    );
    fireEvent.change(result.getTextArea() as HTMLTextAreaElement, {
      target: { value: 'typed' },
    });
    expect(onChange).toHaveBeenCalledWith('typed');
  });

  it('readOnly blocks emission', () => {
    const onChange = vi.fn();
    const result = renderWithProviders(
      <LongText
        label="Notes"
        value="original"
        readOnly
        onChange={onChange}
      />,
    );
    const textarea = result.getTextArea() as HTMLTextAreaElement;
    expect(textarea.hasAttribute('readonly')).toBe(true);
    fireEvent.change(textarea, { target: { value: 'sneaky' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disabled blocks emission', () => {
    const onChange = vi.fn();
    const result = renderWithProviders(
      <LongText
        label="Notes"
        value="original"
        disabled
        onChange={onChange}
      />,
    );
    fireEvent.change(result.getTextArea() as HTMLTextAreaElement, {
      target: { value: 'sneaky' },
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('forwards maxLength to the control', () => {
    const result = renderWithProviders(
      <LongText
        label="Notes"
        value=""
        maxLength={140}
        onChange={() => {}}
      />,
    );
    expect((result.getTextArea() as HTMLTextAreaElement).getAttribute('maxlength')).toBe('140');
  });

  it('forwards placeholder and textAreaProps', () => {
    const result = renderWithProviders(
      <LongText
        label="Notes"
        value=""
        placeholder="Say something"
        textAreaProps={{ tabIndex: -1 }}
        onChange={() => {}}
      />,
    );
    const textarea = result.getTextArea() as HTMLTextAreaElement;
    expect(textarea.getAttribute('placeholder')).toBe('Say something');
    expect(textarea.getAttribute('tabindex')).toBe('-1');
  });
});

describe('LongText row budget', () => {
  it('defaults to six rows when no minHeight is given', () => {
    const result = renderWithProviders(
      <LongText
        label="Notes"
        value=""
        onChange={() => {}}
      />,
    );
    expect(rowsOf(result.container)).toBe('6');
  });

  it('derives rows from a pixel minHeight at 24px a row', () => {
    const result = renderWithProviders(
      <LongText
        label="Notes"
        value=""
        minHeight={240}
        onChange={() => {}}
      />,
    );
    expect(rowsOf(result.container)).toBe('10');
  });

  it('rounds rather than truncates', () => {
    const result = renderWithProviders(
      <LongText
        label="Notes"
        value=""
        minHeight={250}
        onChange={() => {}}
      />,
    );
    expect(rowsOf(result.container)).toBe('10');
  });

  it('never goes below four rows, however small the minHeight', () => {
    const result = renderWithProviders(
      <LongText
        label="Notes"
        value=""
        minHeight={24}
        onChange={() => {}}
      />,
    );
    expect(rowsOf(result.container)).toBe('4');
  });

  it('treats a zero minHeight as unset, not as zero rows', () => {
    const result = renderWithProviders(
      <LongText
        label="Notes"
        value=""
        minHeight={0}
        onChange={() => {}}
      />,
    );
    expect(rowsOf(result.container)).toBe('6');
  });

  it('is taller than SmallText: LongText starts at six rows, SmallText at two', () => {
    const long = renderWithProviders(
      <LongText
        label="Notes"
        value=""
        onChange={() => {}}
      />,
    );
    expect(Number(rowsOf(long.container))).toBeGreaterThan(2);
  });

  it('caps nothing on web: maxRows={16} leaves no rendered maximum height', () => {
    // maxRows only reaches the DOM through the autoResize branch, and the
    // adapter never turns autoResize on. Recorded so a future autoResize
    // switch has to come past this assertion rather than silently changing
    // how tall a Long Text can grow. Reported on MPO-123.
    const result = renderWithProviders(
      <LongText
        label="Notes"
        value=""
        minHeight={999}
        onChange={() => {}}
      />,
    );
    const cls = result.container.querySelector('textarea')?.getAttribute('class') ?? '';
    expect(cls).not.toMatch(/(?:^|\s)_mah-/);
  });
});

describe('registry resolution (Long Text / Text fieldtypes)', () => {
  function propsFor(overrides: Partial<FieldRenderProps> = {}): FieldRenderProps {
    return { value: '', onChange: () => {}, ...overrides };
  }

  it("resolves both 'Long Text' and 'Text' to the same adapter", () => {
    const longText = getFieldComponent('Long Text')!;
    const text = getFieldComponent('Text')!;
    expect(longText).toBeTruthy();
    expect(text).toBe(longText);
  });

  it('renders LongText and forwards label / value', () => {
    const Component = getFieldComponent('Long Text')!;
    const element = (Component as Function)(propsFor({ value: 'body', label: 'Description' })) as React.ReactElement<
      Record<string, any>
    >;
    expect(element.type).toBe(LongText);
    expect(element.props.value).toBe('body');
    expect(element.props.label).toBe('Description');
  });

  it('substitutes an empty string for a null value so the control stays controlled', () => {
    const Component = getFieldComponent('Long Text')!;
    const element = (Component as Function)(propsFor({ value: null as unknown as string })) as React.ReactElement<
      Record<string, any>
    >;
    expect(element.props.value).toBe('');
  });

  it('a disabled field also blocks the DOM textarea (Tamagui disabled is aria-only)', () => {
    const Component = getFieldComponent('Long Text')!;
    const element = (Component as Function)(propsFor({ disabled: true })) as React.ReactElement<Record<string, any>>;
    expect(element.props.textAreaProps).toEqual({ readOnly: true, tabIndex: -1 });
  });

  it('an enabled field adds no textAreaProps block', () => {
    const Component = getFieldComponent('Long Text')!;
    const element = (Component as Function)(propsFor()) as React.ReactElement<Record<string, any>>;
    expect(element.props.textAreaProps).toBeUndefined();
  });
});
