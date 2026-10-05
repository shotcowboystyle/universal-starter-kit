/**
 * @vitest-environment jsdom
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset, type Knobs } from '@repo/theme';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Attachments, type AttachmentItem } from './Attachments';

afterEach(cleanup);

const items: AttachmentItem[] = [
  { id: 'a', fileName: 'restore-log.txt', fileUrl: '/a.txt', fileSize: 12_000 },
  { id: 'b', fileName: 'topology.txt', fileUrl: '/b.txt', fileSize: 812_000 },
];

function rowAtoms(overrides: Partial<Knobs>) {
  renderWithProviders(
    <Preset overrides={overrides}>
      <Attachments items={items} />
    </Preset>,
  );
  return screen.getAllByRole('listitem').map((row) => (row.getAttribute('class') ?? '').split(/\s+/));
}

describe('Attachments rows are a CONTAINER-CAP stack', () => {
  it('caps the outer corners at the row padding at full', () => {
    const [first, last] = rowAtoms({ borderRadius: 'full', space: 'medium' });
    expect(first).toEqual(expect.arrayContaining(['_borderStartStartRadius-18px', '_borderStartEndRadius-18px']));
    expect(last).toEqual(expect.arrayContaining(['_borderEndStartRadius-18px', '_borderEndEndRadius-18px']));
  });

  it('caps large at 13 under space small, where 16 would exceed the padding', () => {
    const [first] = rowAtoms({ borderRadius: 'large', space: 'small' });
    expect(first).toEqual(expect.arrayContaining(['_borderStartStartRadius-13px', '_borderStartEndRadius-13px']));
  });

  it('declares each row a StackedRow cap with the stops it resolved', () => {
    renderWithProviders(
      <Preset overrides={{ borderRadius: 'large', space: 'small' }}>
        <Attachments items={items} />
      </Preset>,
    );
    const declared = screen.getAllByRole('listitem').map((row) => ({
      container: row.getAttribute('data-constraint-container'),
      position: row.getAttribute('data-stack-position'),
      radius: row.getAttribute('data-radius-knob'),
      space: row.getAttribute('data-space-knob'),
    }));
    expect(declared).toEqual([
      { container: 'StackedRow', position: 'first', radius: 'large', space: 'small' },
      { container: 'StackedRow', position: 'last', radius: 'large', space: 'small' },
    ]);
  });

  it('squares every corner at none', () => {
    for (const row of rowAtoms({ borderRadius: 'none' })) {
      const corners = row.filter((a) => /^_border(Start|End)(Start|End)Radius-(\d+px|t-radius-\d+)$/.test(a));
      expect(corners).toHaveLength(4);
      expect(corners.filter((a) => !/-(0px|t-radius-0)$/.test(a))).toEqual([]);
    }
  });
});
