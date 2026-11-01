/**
 * ProgressField contract specs.
 *
 * ProgressField is a thin adapter: it takes the Frappe field props and hands
 * them to the forms Progress, which owns the track, the clamp and the label
 * chrome. So what is worth pinning here is the FORWARDING — every prop the
 * adapter is documented to pass (readOnly / skeleton / compact / max /
 * helperText / error) has to actually arrive, because the failure mode of a
 * thin adapter is a silently dropped prop that makes three story variants
 * render identically (the ContractProbe story exists for exactly that).
 *
 * The registry half matters too: "Progress" is a display fieldtype, so its
 * adapter must coerce a non-number to 0 rather than hand the track NaN.
 */
import { renderWithProviders } from '@repo/test-utils';
import { cleanup } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { getFieldComponent } from '../../field-registry';
import type { FieldRenderProps } from '../../field-registry';

import { ProgressField } from '.';
import type { ProgressFieldProps } from '.';

type ProgressElement = React.ReactElement<ProgressFieldProps>;

const propsFor = (overrides: Partial<FieldRenderProps> = {}): FieldRenderProps => ({
  value: '',
  onChange: () => {},
  ...overrides,
});

/** Calls the Progress registry adapter directly and returns the field element it builds. */
const renderAdapter = (props: FieldRenderProps): ProgressElement => {
  const Component = getFieldComponent('Progress');
  if (Component === undefined) {
    throw new Error('no adapter registered for Progress');
  }
  // SAFETY: the Progress registry adapter is a plain function component that returns one ProgressField element.
  return (Component as (adapterProps: FieldRenderProps) => ProgressElement)(props);
};

// oxlint-disable-next-line vitest/require-top-level-describe -- DOM cleanup applies to every suite in this file
afterEach(cleanup);

describe('ProgressField chrome', () => {
  it('renders the label and a track', () => {
    const { container } = renderWithProviders(
      <ProgressField
        label="Completion"
        value={65}
        max={100}
      />,
    );
    expect(container.textContent).toContain('Completion');
    expect(container.firstElementChild).toBeTruthy();
  });

  it('shows helperText', () => {
    const { container } = renderWithProviders(
      <ProgressField
        label="Completion"
        value={65}
        helperText="how far along"
      />,
    );
    expect(container.textContent).toContain('how far along');
  });

  it('shows the error message', () => {
    const { container } = renderWithProviders(
      <ProgressField
        label="Completion"
        value={65}
        error="Value out of range"
      />,
    );
    expect(container.textContent).toContain('Value out of range');
  });

  it('marks a required field', () => {
    const { container } = renderWithProviders(
      <ProgressField
        label="Completion"
        value={65}
        required
      />,
    );
    expect(container.textContent).toContain('Completion');
    expect(container.querySelector('[aria-required], [aria-hidden]')).toBeTruthy();
  });

  it('a value with no max still paints (max defaults to 100)', () => {
    const { container } = renderWithProviders(
      <ProgressField
        label="Completion"
        value={40}
      />,
    );
    expect(container.firstElementChild).toBeTruthy();
    expect(container.textContent).toContain('Completion');
  });

  it('forwards the controlled value onto the progressbar', () => {
    const { container } = renderWithProviders(
      <ProgressField
        label="Completion"
        value={65}
        max={100}
      />,
    );
    expect(container.querySelector("[role='progressbar']")?.getAttribute('aria-valuenow')).toBe('65');
  });
});

/**
 * The ContractProbe story asserts these three visually. If the adapter drops
 * any of them the probe variants render identically to Main and nobody
 * notices, so pin them structurally too.
 */
describe('ProgressField forwards the thin-adapter contract', () => {
  it('skeleton renders a different tree from the loaded field', () => {
    const loaded = renderWithProviders(
      <ProgressField
        label="Completion"
        value={65}
      />,
    );
    // oxlint-disable-next-line github/no-inner-html -- compares serialized DOM snapshots; nothing is assigned
    const loadedHtml = loaded.container.innerHTML;
    cleanup();
    const skeleton = renderWithProviders(
      <ProgressField
        label="Completion"
        value={65}
        skeleton
      />,
    );
    // oxlint-disable-next-line github/no-inner-html -- compares serialized DOM snapshots; nothing is assigned
    expect(skeleton.container.innerHTML).not.toBe(loadedHtml);
  });

  it('compact renders a different tree from the default density', () => {
    const normal = renderWithProviders(
      <ProgressField
        label="Completion"
        value={65}
      />,
    );
    // oxlint-disable-next-line github/no-inner-html -- compares serialized DOM snapshots; nothing is assigned
    const normalHtml = normal.container.innerHTML;
    cleanup();
    const compact = renderWithProviders(
      <ProgressField
        label="Completion"
        value={65}
        compact
      />,
    );
    // oxlint-disable-next-line github/no-inner-html -- compares serialized DOM snapshots; nothing is assigned
    expect(compact.container.innerHTML).not.toBe(normalHtml);
  });

  it('readOnly is accepted and still paints the value', () => {
    const { container } = renderWithProviders(
      <ProgressField
        label="Completion"
        value={65}
        readOnly
      />,
    );
    expect(container.textContent).toContain('Completion');
    expect(container.firstElementChild).toBeTruthy();
  });

  it('max reaches the track: the same value at two maxes renders differently', () => {
    const wide = renderWithProviders(
      <ProgressField
        label="Completion"
        value={50}
        max={100}
      />,
    );
    // oxlint-disable-next-line github/no-inner-html -- compares serialized DOM snapshots; nothing is assigned
    const wideHtml = wide.container.innerHTML;
    cleanup();
    const narrow = renderWithProviders(
      <ProgressField
        label="Completion"
        value={50}
        max={50}
      />,
    );
    // oxlint-disable-next-line github/no-inner-html -- compares serialized DOM snapshots; nothing is assigned
    expect(narrow.container.innerHTML).not.toBe(wideHtml);
  });
});

describe('registry resolution (Progress fieldtype)', () => {
  it("resolves 'Progress' to ProgressField", () => {
    expect(getFieldComponent('Progress')).toBeTruthy();
    const element = renderAdapter(propsFor({ value: 65, label: 'Completion' }));
    expect(element.type).toBe(ProgressField);
    expect(element.props.value).toBe(65);
    expect(element.props.label).toBe('Completion');
  });

  it('coerces a non-number to 0 rather than handing the track NaN', () => {
    const element = renderAdapter(propsFor({ value: 'not a number' }));
    expect(element.props.value).toBe(0);
  });

  it('a null value becomes 0, not null', () => {
    const element = renderAdapter(propsFor({ value: null }));
    expect(element.props.value).toBe(0);
  });

  it('forwards the passthrough contract (helperText / readOnly / skeleton / compact)', () => {
    const element = renderAdapter(
      propsFor({
        value: 20,
        helperText: 'from the doc',
        readOnly: true,
        skeleton: true,
        compact: true,
      } as Partial<FieldRenderProps>),
    );
    expect(element.props.helperText).toBe('from the doc');
    expect(element.props.readOnly).toBe(true);
    expect(element.props.skeleton).toBe(true);
    expect(element.props.compact).toBe(true);
  });

  it('falls back to the DocField description when no helperText is given', () => {
    const element = renderAdapter(
      propsFor({
        value: 20,
        fieldMeta: { description: 'percent complete' },
      } as Partial<FieldRenderProps>),
    );
    expect(element.props.helperText).toBe('percent complete');
  });
});
