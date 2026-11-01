/**
 * SmallText contract specs. Frappe's `Small Text` is the short free-text
 * fieldtype, and the adapter's promise is that it is the SAME control as
 * LongText with a smaller row budget (2..4 instead of 6..16) — not a second
 * textarea implementation, and not an Input with a taller box.
 */
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent } from '@testing-library/react';
import type React from 'react';
import type { ChangeEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getFieldComponent } from '../../field-registry';
import type { FieldRenderProps } from '../../field-registry';
import { LongText } from '../LongText';

import { SmallText } from '.';
import type { SmallTextProps } from '.';

type SmallTextElement = React.ReactElement<SmallTextProps>;

const propsFor = (overrides: Partial<FieldRenderProps> = {}): FieldRenderProps => ({
  value: '',
  onChange: () => {},
  ...overrides,
});

/** Calls the Small Text registry adapter directly and returns the field element it builds. */
const renderAdapter = (props: FieldRenderProps): SmallTextElement => {
  const Component = getFieldComponent('Small Text');
  if (Component === undefined) {
    throw new Error('no adapter registered for Small Text');
  }
  // SAFETY: the Small Text registry adapter is a plain function component that returns one SmallText element.
  return (Component as (adapterProps: FieldRenderProps) => SmallTextElement)(props);
};

// oxlint-disable-next-line vitest/require-top-level-describe -- DOM cleanup applies to every suite in this file
afterEach(cleanup);

describe('SmallText composes the forms TextArea', () => {
  it('renders a textarea, not a single-line input', () => {
    const result = renderWithProviders(
      <SmallText
        label="Note"
        value=""
        onChange={() => {}}
      />,
    );
    expect(result.getTextArea()).toBeTruthy();
    expect(result.container.querySelector('input[type="text"]')).toBeNull();
  });

  it('shows the controlled value', () => {
    const result = renderWithProviders(
      <SmallText
        label="Note"
        value="short note"
        onChange={() => {}}
      />,
    );
    expect((result.getTextArea() as HTMLTextAreaElement).value).toBe('short note');
  });

  it('emits the text through canonical onChange', () => {
    const onChange = vi.fn<(value: string | ChangeEvent<HTMLDivElement>) => void>();
    const result = renderWithProviders(
      <SmallText
        label="Note"
        value=""
        onChange={onChange}
      />,
    );
    fireEvent.change(result.getTextArea() as HTMLTextAreaElement, { target: { value: 'typed' } });
    expect(onChange).toHaveBeenCalledWith('typed');
  });

  it('readOnly blocks emission', () => {
    const onChange = vi.fn<(value: string | ChangeEvent<HTMLDivElement>) => void>();
    const result = renderWithProviders(
      <SmallText
        label="Note"
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
    const onChange = vi.fn<(value: string | ChangeEvent<HTMLDivElement>) => void>();
    const result = renderWithProviders(
      <SmallText
        label="Note"
        value="original"
        disabled
        onChange={onChange}
      />,
    );
    fireEvent.change(result.getTextArea() as HTMLTextAreaElement, { target: { value: 'sneaky' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("forwards maxLength — Frappe's df.length caps a Small Text", () => {
    const result = renderWithProviders(
      <SmallText
        label="Note"
        value=""
        maxLength={80}
        onChange={() => {}}
      />,
    );
    expect((result.getTextArea() as HTMLTextAreaElement).getAttribute('maxlength')).toBe('80');
  });

  it('forwards placeholder and textAreaProps', () => {
    const result = renderWithProviders(
      <SmallText
        label="Note"
        value=""
        placeholder="One or two lines"
        textAreaProps={{ tabIndex: -1 }}
        onChange={() => {}}
      />,
    );
    const textarea = result.getTextArea() as HTMLTextAreaElement;
    expect(textarea.getAttribute('placeholder')).toBe('One or two lines');
    expect(textarea.getAttribute('tabindex')).toBe('-1');
  });
});

/**
 * The row budget does not reach the DOM as the textarea's `rows` attribute:
 * TextArea spreads `numberOfLines: minRows` onto the Tamagui TextArea and web
 * drops it, so `rows` measured 3 for every adapter at every setting. The
 * budget DOES drive the rendered minimum height, `getFieldHeight(size,
 * minRows)`, so it is asserted through that. Reported on MPO-123.
 */
const minHeightPxOf = (container: HTMLElement) => {
  const cls = container.querySelector('textarea')?.getAttribute('class') ?? '';
  const match = /(?:^|\s)_mih-(?<px>\d+)px(?:\s|$)/u.exec(cls);
  return match ? Number(match[1]) : undefined;
};

describe('SmallText row budget', () => {
  it('opens at a two-row box', () => {
    const small = renderWithProviders(
      <SmallText
        label="Note"
        value=""
        onChange={() => {}}
      />,
    );
    const smallPx = minHeightPxOf(small.container);
    cleanup();
    // LongText's default budget is six rows to SmallText's two, on the same
    // per-row height — so the ratio is the row count, with no hard-coded px.
    const long = renderWithProviders(
      <LongText
        label="Note"
        value=""
        onChange={() => {}}
      />,
    );
    const longPx = minHeightPxOf(long.container);
    expect(smallPx).toBeGreaterThan(0);
    expect(longPx! / smallPx!).toBe(3);
  });

  it('is shorter than LongText, which is the only thing that distinguishes them', () => {
    const small = renderWithProviders(
      <SmallText
        label="Note"
        value=""
        onChange={() => {}}
      />,
    );
    const smallPx = minHeightPxOf(small.container)!;
    cleanup();
    const long = renderWithProviders(
      <LongText
        label="Note"
        value=""
        onChange={() => {}}
      />,
    );
    const longPx = minHeightPxOf(long.container)!;
    expect(smallPx).toBeLessThan(longPx);
  });

  it('ignores minHeight — a Small Text does not grow into a Long Text', () => {
    const plain = renderWithProviders(
      <SmallText
        label="Note"
        value=""
        onChange={() => {}}
      />,
    );
    const plainPx = minHeightPxOf(plain.container);
    cleanup();
    const result = renderWithProviders(
      <SmallText
        label="Note"
        value=""
        onChange={() => {}}
        {...{ minHeight: 480 }}
      />,
    );
    expect(minHeightPxOf(result.container)).toBe(plainPx);
  });
});

describe('registry resolution (Small Text fieldtype)', () => {
  it("resolves 'Small Text' to SmallText, and not to the Long Text adapter", () => {
    const Component = getFieldComponent('Small Text');
    expect(Component).toBeTruthy();
    expect(Component).not.toBe(getFieldComponent('Long Text'));
    const element = renderAdapter(propsFor({ value: 'note', label: 'Remark' }));
    expect(element.type).toBe(SmallText);
    expect(element.props.value).toBe('note');
    expect(element.props.label).toBe('Remark');
  });

  it('substitutes an empty string for a null value', () => {
    const element = renderAdapter(propsFor({ value: null }));
    expect(element.props.value).toBe('');
  });

  it('a disabled field also blocks the DOM textarea', () => {
    const element = renderAdapter(propsFor({ disabled: true }));
    expect(element.props.textAreaProps).toStrictEqual({ readOnly: true, tabIndex: -1 });
  });

  it('passes helperText / readOnly / skeleton / compact through', () => {
    const element = renderAdapter(
      propsFor({ helperText: 'keep it short', readOnly: true, skeleton: true, compact: true }),
    );
    expect(element.props.helperText).toBe('keep it short');
    expect(element.props.readOnly).toBe(true);
    expect(element.props.skeleton).toBe(true);
    expect(element.props.compact).toBe(true);
  });
});
