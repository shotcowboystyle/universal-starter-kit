import { renderWithProviders } from '@repo/test-utils';
import { defaultKnobs, Preset, resolveKnobs } from '@repo/theme';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  List,
  ListRow,
  ListRowMeta,
  useListItemState,
  type ListHotkeys,
  type ListItemState,
  type ListProps,
  type ListRowProps,
} from './List';

import * as ViewExports from './index';

afterEach(cleanup);

function atoms(el: Element, prefixes: string[]): string[] {
  return String((el as HTMLElement).className || '')
    .split(' ')
    .filter((c) => prefixes.some((p) => c.startsWith(p)))
    .sort();
}

const documents = [
  { id: '1', title: 'Q3 Vendor Contract' },
  { id: '2', title: 'Onboarding Checklist' },
  { id: '3', title: 'Invoice 1842' },
];

describe('List named exports', () => {
  it('exports List, ListRow, ListRowMeta, and useListItemState from the views barrel', () => {
    expect(ViewExports).toHaveProperty('List');
    expect(ViewExports).toHaveProperty('ListRow');
    expect(ViewExports).toHaveProperty('ListRowMeta');
    expect(ViewExports).toHaveProperty('useListItemState');
  });

  it('keeps the public types as named exports (not a default)', () => {
    expect(typeof List).toBe('function');
    expect(typeof ListRow).toBe('function');
    expect(typeof ListRowMeta).toBe('function');
    expect(typeof useListItemState).toBe('function');
    void (null as unknown as ListProps<unknown>);
    void (null as unknown as ListRowProps);
    void (null as unknown as ListItemState);
    void (null as unknown as ListHotkeys);
  });
});

describe('ListRow title — weight 400 on the TEXT NODE (§6.1)', () => {
  it('does not paint 500 or 600 on the title text node', () => {
    renderWithProviders(<ListRow title="Q3 Vendor Contract" />);
    const textNode = screen.getByText('Q3 Vendor Contract');
    const weight = atoms(textNode, ['_fow-']);
    expect(weight.length).toBeGreaterThan(0);
    expect(weight.join(' ')).not.toMatch(/500|600|weight-5|weight-6|fow-5|fow-6/);
  });
});

describe('ListRow icon — size recipe, not a private pixel table', () => {
  it('passes the controlIcon size into the leading glyph', () => {
    let received: number | undefined;
    function ProbeIcon({ size }: { size?: number }) {
      received = size;
      return <span data-testid="probe-icon" />;
    }
    renderWithProviders(<ListRow icon=<ProbeIcon /> title="Architecture RFC" />);
    const expected = resolveKnobs(defaultKnobs).knobProps.controlIcon.width;
    expect(received).toBe(expected);
  });
});

describe('List keyboard selection chrome', () => {
  it('marks the filled row data-selected and the keyboard row data-focused', () => {
    renderWithProviders(
      <List
        items={documents}
        aria-label="Documents"
        renderItem={(item) => <ListRow title={item.title} />}
        height={300}
        estimateSize={50}
      />,
    );
    const container = screen.getByRole('list');
    fireEvent.keyDown(container, { key: 'ArrowDown' });
    const focused = container.querySelector('[data-focused]');
    expect(focused).not.toBeNull();
    expect(focused).toHaveAttribute('data-selected');
    expect(focused!.textContent).toContain('Q3 Vendor Contract');
  });
});

describe('ListRow ink — textAccent reaches the TEXT NODE (F11 / data-chrome honour)', () => {
  function titleColor(title: string, accent: 'high' | 'low' | 'medium'): string[] {
    const { getByText } = renderWithProviders(
      <Preset overrides={{ textAccent: accent }}>
        <ListRow title={title} />
      </Preset>,
    );
    return atoms(getByText(title), ['_col-']);
  }

  it('changes title colour on a textAccent flip', () => {
    const high = titleColor('ink-high', 'high');
    const low = titleColor('ink-low', 'low');
    expect(high).not.toHaveLength(0);
    expect(low).not.toHaveLength(0);
    expect(high).not.toEqual(low);
  });

  it('low and medium share the AA legibility floor on the title', () => {
    const low = titleColor('ink-floor-low', 'low');
    const medium = titleColor('ink-floor-medium', 'medium');
    expect(low).toEqual(medium);
  });

  it('moves ListRowMeta default ink with textAccent', () => {
    function metaColor(label: string, accent: 'high' | 'low'): string[] {
      const { getByText } = renderWithProviders(
        <Preset overrides={{ textAccent: accent }}>
          <ListRowMeta>{label}</ListRowMeta>
        </Preset>,
      );
      return atoms(getByText(label), ['_col-']);
    }
    const high = metaColor('meta-high', 'high');
    const low = metaColor('meta-low', 'low');
    expect(high).not.toHaveLength(0);
    expect(low).not.toHaveLength(0);
    expect(high).not.toEqual(low);
  });
});

describe('List rows are a CONTAINER-CAP stack', () => {
  const rows = (overrides: { borderRadius: 'none' | 'large' | 'full'; space: 'small' | 'medium' }) => {
    renderWithProviders(
      <Preset overrides={overrides}>
        <List
          items={documents}
          aria-label="Documents"
          renderItem={(item) => <ListRow title={item.title} />}
          height={300}
          estimateSize={50}
        />
      </Preset>,
    );
    const found = screen.getAllByRole('listitem').map((row) => ({
      corners: atoms(row, ['_borderStartStartRadius-', '_borderEndEndRadius-']).filter((a) => /Radius-\d+px$/.test(a)),
      container: row.getAttribute('data-constraint-container'),
      position: row.getAttribute('data-stack-position'),
    }));
    cleanup();
    return found;
  };

  it('caps the outer corners at the row padding at full, square inside', () => {
    const [first, middle, last] = rows({ borderRadius: 'full', space: 'medium' });
    expect(first.corners).toEqual(['_borderEndEndRadius-0px', '_borderStartStartRadius-18px']);
    expect(middle.corners).toEqual(['_borderEndEndRadius-0px', '_borderStartStartRadius-0px']);
    expect(last.corners).toEqual(['_borderEndEndRadius-18px', '_borderStartStartRadius-0px']);
  });

  it('caps large at 13 under space small', () => {
    const [first] = rows({ borderRadius: 'large', space: 'small' });
    expect(first.corners).toContain('_borderStartStartRadius-13px');
  });

  it('declares each row a StackedRow with its position', () => {
    expect(rows({ borderRadius: 'large', space: 'small' }).map((r) => [r.container, r.position])).toEqual([
      ['StackedRow', 'first'],
      ['StackedRow', 'middle'],
      ['StackedRow', 'last'],
    ]);
  });
});
