// @vitest-environment jsdom

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EMPTY, formatDateText, formatNumericText } from '../FieldDisplay/formatters';
import { FORM_GRID_COLLAPSE_WIDTH } from '../FormGrid';

import { DescriptionList, PropertyList } from './index';

const stubContainerWidth = (width: number) => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width,
    height: 100,
    top: 0,
    left: 0,
    right: width,
    bottom: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);

  vi.stubGlobal(
    'ResizeObserver',
    class {
      readonly onEntries: ResizeObserverCallback;
      constructor(onEntries: ResizeObserverCallback) {
        this.onEntries = onEntries;
      }
      target: Element | null = null;
      observe(target: Element) {
        this.target = target;
        this.onEntries(
          [
            {
              target,
              contentRect: { width } as DOMRectReadOnly,
              borderBoxSize: [],
              contentBoxSize: [],
              devicePixelContentBoxSize: [],
            } as ResizeObserverEntry,
          ],
          this as unknown as ResizeObserver,
        );
      }
      unobserve() {
        this.target = null;
      }
      disconnect() {
        this.target = null;
      }
    },
  );
};

const list = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-mpo-description-list]');

const host = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-mpo-description-list-host]');

describe(DescriptionList, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('composes FieldDisplay for each typed row — never a parallel formatter', () => {
    const created = new Date(2025, 6, 1);
    const result = renderWithProviders(
      <DescriptionList
        placement="side"
        items={[
          { term: 'Hostname', field: 'input', value: 'compose01.hel1.hetzner' },
          {
            term: 'Status',
            field: 'select',
            value: 'active',
            fieldProps: { options: [{ label: 'Active', value: 'active', color: 'green' }] },
          },
          { term: 'Created', field: 'datepicker', value: created },
          {
            term: 'Monthly cost',
            field: 'stepper',
            value: 38.4,
            fieldProps: { currency: 'EUR', precision: 2 },
          },
          { term: 'Decommissioned', field: 'input', value: null },
        ]}
      />,
    );

    const displays = result.container.querySelectorAll<HTMLElement>("[data-component='FieldDisplay']");
    expect(displays).toHaveLength(5);
    expect(displays[0]?.dataset.field).toBe('input');
    expect(displays[1]?.dataset.field).toBe('select');
    expect(displays[2]?.dataset.field).toBe('datepicker');
    expect(displays[3]?.dataset.field).toBe('stepper');
    expect(displays[3]?.textContent).toBe(formatNumericText(38.4, { currency: 'EUR', precision: 2 }));
    expect(displays[2]?.textContent).toBe(formatDateText(created));
    expect(displays[2]?.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/u);
    expect(result.container.textContent).toContain('Active');
    expect(result.container.textContent).not.toMatch(/\bactive\b/u);
    expect(displays[4]?.textContent).toBe(EMPTY);
    expect(result.container.textContent).toContain('Hostname');
  });

  it('collapses a side list to stacked when the container is under 480', () => {
    stubContainerWidth(280);
    let result!: ReturnType<typeof renderWithProviders>;
    act(() => {
      result = renderWithProviders(
        <DescriptionList
          placement="side"
          items={[
            { term: 'Hostname', field: 'input', value: 'compose01', onChange: vi.fn<() => void>() },
            { term: 'Region', field: 'input', value: 'hel1' },
          ]}
        />,
      );
    });
    const root = list(result.container);
    expect(root?.dataset.placement).toBe('side');
    expect(root?.dataset.stacked).toBe('true');
  });

  it('keeps a side list in columns when the container is at least 480', () => {
    stubContainerWidth(FORM_GRID_COLLAPSE_WIDTH + 40);
    let result!: ReturnType<typeof renderWithProviders>;
    act(() => {
      result = renderWithProviders(
        <DescriptionList
          placement="side"
          items={[{ term: 'Hostname', field: 'input', value: 'compose01' }]}
        />,
      );
    });
    const root = list(result.container);
    expect(root?.dataset.stacked).toBe('false');
    expect(root?.dataset.labelColumnWidth).toBe('min(max-content, 24ch)');
    expect(root?.style.gridTemplateColumns).toContain('fit-content(24ch)');
    expect(root?.style.gridTemplateColumns).toContain('minmax(0, 1fr)');
  });

  it('the optional Change action is a keyboard-reachable button', () => {
    const onChange = vi.fn<() => void>();
    const result = renderWithProviders(
      <DescriptionList
        placement="top"
        items={[
          {
            term: 'Hostname',
            field: 'input',
            value: 'compose01',
            onChange,
          },
        ]}
      />,
    );
    const action = result.container.querySelector<HTMLElement>(
      "[data-mpo-description-list-action] [role='button'], [data-mpo-description-list-action] button",
    );
    expect(action).not.toBeNull();
    expect(action?.getAttribute('aria-disabled')).not.toBe('true');
    expect(action?.textContent).toContain('Change');
    expect(Number(action?.getAttribute('tabindex') ?? '0')).toBeGreaterThanOrEqual(0);
    action?.click();
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('FieldDisplay slots are chromeless and start-align numbers', () => {
    const result = renderWithProviders(
      <DescriptionList
        placement="top"
        items={[
          {
            term: 'Count',
            field: 'stepper',
            value: 47,
          },
        ]}
      />,
    );
    const display = result.container.querySelector<HTMLElement>("[data-component='FieldDisplay']");
    expect(display?.dataset.chromeless).toBeDefined();
    expect(display?.textContent).toBe(formatNumericText(47));
    const valueText = display?.querySelector('*');
    const align = valueText ? getComputedStyle(valueText).textAlign : '';
    expect(align === 'left' || align === 'start' || align === '').toBe(true);
  });

  it('top placement is stacked without a container measure', () => {
    const result = renderWithProviders(
      <DescriptionList
        placement="top"
        items={[{ term: 'Owner', field: 'input', value: 'Clay' }]}
      />,
    );
    expect(list(result.container)?.dataset.stacked).toBe('true');
  });

  it('PropertyList is the DescriptionList alias', () => {
    expect(PropertyList).toBe(DescriptionList);
  });

  it('framed variant paints a surface (earned inset)', () => {
    const result = renderWithProviders(
      <DescriptionList
        framed
        placement="top"
        items={[{ term: 'Host', field: 'input', value: 'a' }]}
      />,
    );
    expect(list(result.container)?.dataset.framed).toBe('true');
    expect(host(result.container)).not.toBeNull();
  });

  it('quiet separators mark the list', () => {
    const result = renderWithProviders(
      <DescriptionList
        quiet
        placement="top"
        items={[
          { term: 'A', field: 'input', value: '1' },
          { term: 'B', field: 'input', value: '2' },
        ]}
      />,
    );
    expect(list(result.container)?.dataset.quiet).toBe('true');
    expect(result.container.querySelectorAll('[data-mpo-description-list-rule]')).toHaveLength(1);
  });

  it('rides fieldLabelPlacement=top from the preset when placement is omitted', () => {
    const result = renderWithProviders(
      <Preset overrides={{ fieldLabelPlacement: 'top' }}>
        <DescriptionList items={[{ term: 'A', field: 'input', value: '1' }]} />
      </Preset>,
    );
    expect(list(result.container)?.dataset.placement).toBe('top');
    expect(list(result.container)?.dataset.stacked).toBe('true');
  });

  it('compact density marks the list', () => {
    const result = renderWithProviders(
      <DescriptionList
        compact
        placement="top"
        items={[{ term: 'A', field: 'input', value: '1' }]}
      />,
    );
    expect(list(result.container)?.dataset.compact).toBe('true');
  });

  it('side rows share the list stacked flag (native host measures via onLayout)', () => {
    stubContainerWidth(280);
    let result!: ReturnType<typeof renderWithProviders>;
    act(() => {
      result = renderWithProviders(
        <DescriptionList
          placement="side"
          items={[{ term: 'Hostname', field: 'input', value: 'compose01' }]}
        />,
      );
    });
    const root = list(result.container);
    expect(root?.dataset.stacked).toBe('true');
    expect(root?.querySelectorAll('[data-mpo-description-list-row]').length).toBe(1);
  });
});
