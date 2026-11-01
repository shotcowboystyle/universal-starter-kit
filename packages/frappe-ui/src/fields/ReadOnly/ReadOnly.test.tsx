/**
 * ReadOnly field contract specs. This is the display half of every fieldtype:
 * SchemaForm swaps a live control for ReadOnly whenever a DocField is
 * read-only, so what it prints IS the value the user sees. The contract is the
 * formatting matrix (one per ReadOnlyType), the empty fallback, and the two
 * types that render more than text — Color (swatch) and Link (pressable).
 *
 * Formatted output is asserted against the shared registers
 * (formatNumericText / formatCurrency / formatPercent / formatDateText /
 * formatTimeOfDay) rather than against hardcoded strings: the contract is
 * "ReadOnly speaks the house register", not "ReadOnly speaks en-GB".
 */
import { formatDateText, formatNumericText } from '@repo/forms';
import { renderWithProviders } from '@repo/test-utils';
import { formatCurrency, formatPercent, formatTimeOfDay } from '@repo/theme';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getFieldComponent } from '../../field-registry';
import type { FieldRenderProps } from '../../field-registry';

import { ReadOnly } from '.';
import type { ReadOnlyProps } from '.';

type ReadOnlyElement = React.ReactElement<ReadOnlyProps>;

const propsFor = (overrides: Partial<FieldRenderProps> = {}): FieldRenderProps => ({
  value: '',
  onChange: () => {},
  ...overrides,
});

/** Calls the Read Only registry adapter directly and returns the field element it builds. */
const renderAdapter = (props: FieldRenderProps): ReadOnlyElement => {
  const Component = getFieldComponent('Read Only');
  if (Component === undefined) {
    throw new Error('no adapter registered for Read Only');
  }
  // SAFETY: the Read Only registry adapter is a plain function component that returns one ReadOnly element.
  return (Component as (adapterProps: FieldRenderProps) => ReadOnlyElement)(props);
};

const noopLinkPress = () => {};

// oxlint-disable-next-line vitest/require-top-level-describe -- DOM cleanup applies to every suite in this file
afterEach(cleanup);

describe('ReadOnly formatting matrix', () => {
  it('Data prints the value verbatim', () => {
    renderWithProviders(
      <ReadOnly
        label="Title"
        type="Data"
        value="Sales Invoice"
      />,
    );
    expect(screen.getByText('Sales Invoice')).toBeTruthy();
  });

  it('Check prints Yes / No, never true / false', () => {
    const yes = renderWithProviders(
      <ReadOnly
        label="Paid"
        type="Check"
        value={true}
      />,
    );
    expect(yes.container.textContent).toContain('Yes');
    expect(yes.container.textContent).not.toContain('true');
    cleanup();
    const no = renderWithProviders(
      <ReadOnly
        label="Paid"
        type="Check"
        value={false}
      />,
    );
    expect(no.container.textContent).toContain('No');
  });

  it('Int rounds and drops the decimals', () => {
    renderWithProviders(
      <ReadOnly
        label="Qty"
        type="Int"
        value={3.7}
      />,
    );
    expect(screen.getByText(formatNumericText(4, { precision: 0 }))).toBeTruthy();
  });

  it('Float honours precision', () => {
    renderWithProviders(
      <ReadOnly
        label="Rate"
        type="Float"
        value={1.23456}
        precision={3}
      />,
    );
    expect(screen.getByText(formatNumericText(1.23456, { precision: 3 }))).toBeTruthy();
  });

  it('Currency goes through the money register with the given symbol', () => {
    renderWithProviders(
      <ReadOnly
        label="Total"
        type="Currency"
        value={1234.5}
        currencySymbol="$"
        precision={2}
      />,
    );
    expect(screen.getByText(formatCurrency(1234.5, { precision: 2, symbol: '$' }))).toBeTruthy();
  });

  it('Percent goes through the percent register', () => {
    renderWithProviders(
      <ReadOnly
        label="Done"
        type="Percent"
        value={42.5}
        precision={1}
      />,
    );
    expect(screen.getByText(formatPercent(42.5, { precision: 1 }))).toBeTruthy();
  });

  it('Date goes through the date register', () => {
    renderWithProviders(
      <ReadOnly
        label="Posting"
        type="Date"
        value="2026-03-04"
      />,
    );
    expect(screen.getByText(formatDateText('2026-03-04', {}))).toBeTruthy();
  });

  it('Datetime carries the time half', () => {
    const wire = '2026-03-04 14:30:00';
    renderWithProviders(
      <ReadOnly
        label="Modified"
        type="Datetime"
        value={wire}
      />,
    );
    expect(screen.getByText(formatDateText(wire, { withTime: true }))).toBeTruthy();
  });

  it('Time speaks the time-of-day register, not the raw wire string (LC-12)', () => {
    renderWithProviders(
      <ReadOnly
        label="Start"
        type="Time"
        value="14:30:00"
      />,
    );
    expect(screen.getByText(formatTimeOfDay('14:30:00'))).toBeTruthy();
    expect(screen.queryByText('14:30:00')).toBeNull();
  });

  it('Color uppercases the hex', () => {
    renderWithProviders(
      <ReadOnly
        label="Brand"
        type="Color"
        value="#ab12ef"
      />,
    );
    expect(screen.getByText('#AB12EF')).toBeTruthy();
  });
});

describe('ReadOnly empty handling', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
  ])('prints the default dash for %s', (_label, value) => {
    const result = renderWithProviders(
      <ReadOnly
        label="Ref"
        type="Data"
        value={value}
      />,
    );
    expect(result.container.textContent).toContain('-');
  });

  it('honours a custom emptyText', () => {
    const result = renderWithProviders(
      <ReadOnly
        label="Ref"
        type="Data"
        value={null}
        emptyText="Not set"
      />,
    );
    expect(result.container.textContent).toContain('Not set');
  });

  it('an empty Date is empty, not an epoch', () => {
    const result = renderWithProviders(
      <ReadOnly
        label="Posting"
        type="Date"
        value=""
      />,
    );
    expect(result.container.textContent).toContain('-');
    expect(result.container.textContent).not.toContain('1970');
  });

  it('a zero number is a value, not an empty', () => {
    renderWithProviders(
      <ReadOnly
        label="Qty"
        type="Int"
        value={0}
      />,
    );
    expect(screen.getByText(formatNumericText(0, { precision: 0 }))).toBeTruthy();
  });
});

describe('ReadOnly Color swatch', () => {
  it('renders a swatch beside the text for a 6-digit hex', () => {
    renderWithProviders(
      <ReadOnly
        label="Brand"
        type="Color"
        value="#FF0000"
      />,
    );
    const text = screen.getByText('#FF0000');
    expect(text.parentElement?.childElementCount).toBe(2);
  });

  it('renders a swatch for a 3-digit hex too', () => {
    renderWithProviders(
      <ReadOnly
        label="Brand"
        type="Color"
        value="#f00"
      />,
    );
    const text = screen.getByText('#F00');
    expect(text.parentElement?.childElementCount).toBe(2);
  });

  it('refuses a swatch for a value that is not a hex colour', () => {
    renderWithProviders(
      <ReadOnly
        label="Brand"
        type="Color"
        value="red"
      />,
    );
    const text = screen.getByText('RED');
    expect(text.parentElement?.childElementCount).toBe(1);
  });
});

describe('ReadOnly Link', () => {
  it('calls onLinkPress when the value is pressed', () => {
    const onLinkPress = vi.fn<() => void>();
    renderWithProviders(
      <ReadOnly
        label="Customer"
        type="Link"
        value="CUST-0001"
        onLinkPress={onLinkPress}
      />,
    );
    fireEvent.click(screen.getByText('CUST-0001'));
    expect(onLinkPress).toHaveBeenCalledOnce();
  });

  it('does not make an empty Link pressable', () => {
    const onLinkPress = vi.fn<() => void>();
    const result = renderWithProviders(
      <ReadOnly
        label="Customer"
        type="Link"
        value=""
        onLinkPress={onLinkPress}
      />,
    );
    fireEvent.click(result.getByText('-'));
    expect(onLinkPress).not.toHaveBeenCalled();
  });

  it('a Link with neither href nor handler is plain text', () => {
    const result = renderWithProviders(
      <ReadOnly
        label="Customer"
        type="Link"
        value="CUST-1"
      />,
    );
    expect(result.container.textContent).toContain('CUST-1');
  });
});

describe('ReadOnly chrome', () => {
  it('shows the label and helperText', () => {
    const result = renderWithProviders(
      <ReadOnly
        label="Status"
        type="Data"
        value="Draft"
        helperText="set by the workflow"
      />,
    );
    expect(result.container.textContent).toContain('Status');
    expect(result.container.textContent).toContain('set by the workflow');
  });

  it('skeleton branch hides the value', () => {
    const result = renderWithProviders(
      <ReadOnly
        label="Status"
        type="Data"
        value="Draft"
        skeleton
      />,
    );
    expect(result.container.textContent).not.toContain('Draft');
  });
});

describe('registry resolution (Read Only fieldtype)', () => {
  it("resolves 'Read Only' to ReadOnly", () => {
    expect(getFieldComponent('Read Only')).toBeTruthy();
    const element = renderAdapter(propsFor({ value: 'Draft', label: 'Status' }));
    expect(element.type).toBe(ReadOnly);
    expect(element.props.value).toBe('Draft');
  });

  it('forwards the whole formatting contract, not just the value', () => {
    const onLinkPress = noopLinkPress;
    const element = renderAdapter(
      propsFor({
        value: 12.5,
        type: 'Currency',
        precision: 3,
        currencySymbol: '€',
        emptyText: 'n/a',
        dateFormat: 'dd-MM-yyyy',
        datetimeFormat: 'dd-MM-yyyy HH:mm',
        timeFormat: 'HH:mm',
        linkHref: '/app/x',
        onLinkPress,
      } as Partial<FieldRenderProps>),
    );
    expect(element.props.type).toBe('Currency');
    expect(element.props.precision).toBe(3);
    expect(element.props.currencySymbol).toBe('€');
    expect(element.props.emptyText).toBe('n/a');
    expect(element.props.dateFormat).toBe('dd-MM-yyyy');
    expect(element.props.datetimeFormat).toBe('dd-MM-yyyy HH:mm');
    expect(element.props.timeFormat).toBe('HH:mm');
    expect(element.props.linkHref).toBe('/app/x');
    expect(element.props.onLinkPress).toBe(onLinkPress);
  });

  it('does not coerce a null value to an empty string — ReadOnly owns the empty text', () => {
    const element = renderAdapter(propsFor({ value: null }));
    expect(element.props.value).toBeNull();
  });
});
