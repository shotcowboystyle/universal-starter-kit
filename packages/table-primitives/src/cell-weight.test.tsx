/**
 * A body Table.Cell's bare value takes the fontWeight and bodyFont
 * knobs like any body text, with the weight written last so the size ramp
 * cannot paint over it. Header labels keep their 600 (the chrome label
 * weight is decided separately).
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup, screen } from '@testing-library/react';
import { Text as RawText } from 'tamagui';
import { afterEach, describe, expect, it } from 'vitest';

import { Table } from './index';

const classes = (el: Element, prefix: string): string[] =>
  el.className
    .split(' ')
    .filter((c) => c.startsWith(prefix))
    .toSorted();

const explicit = (prefix: string, props: Record<string, string>): string[] => {
  renderWithProviders(<RawText {...props}>probe</RawText>);
  const got = classes(screen.getByText('probe'), prefix);
  cleanup();
  return got;
};

const renderTable = (overrides: Record<string, string>) =>
  renderWithProviders(
    <Preset overrides={overrides as never}>
      <Table>
        <Table.Head>
          <Table.Row>
            <Table.HeaderCell>Weight</Table.HeaderCell>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          <Table.Row>
            <Table.Cell>{['42', ' kg']}</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    </Preset>,
  );

describe('Table.Cell body values follow the text knobs', () => {
  afterEach(cleanup);

  it.each([
    ['regular', '400'],
    ['bold', '700'],
  ] as const)('a bare body value paints the knob weight at %s', (fontWeight, want) => {
    const expected = explicit('_fow-', { fontWeight: want });
    renderTable({ fontWeight });
    expect(classes(screen.getByText('42 kg'), '_fow-')).toStrictEqual(expected);
  });

  it('a bare body value takes the bodyFont family', () => {
    const expected = explicit('_ff-', { fontFamily: '$mono' });
    renderTable({ bodyFont: 'mono' });
    expect(classes(screen.getByText('42 kg'), '_ff-')).toStrictEqual(expected);
  });

  it.each(['regular', 'bold'])('the header label keeps 600 at the %s knob stop', (fontWeight) => {
    const expected = explicit('_fow-', { fontWeight: '600' });
    renderTable({ fontWeight });
    expect(classes(screen.getByText('Weight'), '_fow-')).toStrictEqual(expected);
  });
});
