/**
 * MPO-446 table arm (native): the native root renders body cells through the
 * same CellContent as web, so a primitive value rides house Text and takes
 * the fontWeight and bodyFont knobs. index.native.tsx pulls in FlashList and
 * the suite runs under happy-dom, so the root is read as source (the
 * ./nativeCardParity.spec.tsx precedent) and CellContent renders under the
 * native platform flags.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup, screen } from '@testing-library/react';
import { Text as RawText } from 'tamagui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CellContent } from './CellContent';

vi.mock(import('@repo/platform'), async (importOriginal) => ({
  ...(await importOriginal<typeof import('@repo/platform')>()),
  isWeb: false,
  isNative: true,
}));

afterEach(cleanup);

function classes(el: Element, prefix: string): string[] {
  return String(el.className || '')
    .split(' ')
    .filter((c) => c.startsWith(prefix))
    .sort();
}

function explicit(prefix: string, props: Record<string, string>): string[] {
  renderWithProviders(<RawText {...props}>probe</RawText>);
  const got = classes(screen.getByText('probe'), prefix);
  cleanup();
  return got;
}

describe('DataTable custom cell values follow the text knobs (native, MPO-446)', () => {
  it('really is running with the native platform flags', async () => {
    const platform = await import('@repo/platform');
    expect(platform.isWeb).toBe(false);
    expect(platform.isNative).toBe(true);
  });

  it('the native root renders body cells through CellContent with the value voice size', () => {
    const native = readFileSync(resolve(__dirname, 'index.native.tsx'), 'utf-8');
    const start = native.indexOf('<CellContent');
    expect(start).toBeGreaterThan(-1);
    const site = native.slice(start, native.indexOf('/>', start));
    expect(site).toMatch(/cellDef=\{columnDef\.cell\}/);
    expect(site).toMatch(/fontSize=\{knobProps\.label\.fontSize/);
  });

  it.each([
    ['regular', '400'],
    ['bold', '700'],
  ] as const)('string and number values paint the knob weight at %s', (fontWeight, want) => {
    const expected = explicit('_fow-', { fontWeight: want });
    for (const value of ['Bulbasaur', 4461]) {
      renderWithProviders(
        <Preset overrides={{ fontWeight }}>
          <CellContent
            cellDef={() => value}
            ctx={{}}
            fontSize="$3"
          />
        </Preset>,
      );
      expect(classes(screen.getByText(String(value)), '_fow-'), String(value)).toEqual(expected);
      cleanup();
    }
  });

  it('string values take the bodyFont family', () => {
    const expected = explicit('_ff-', { fontFamily: '$mono' });
    renderWithProviders(
      <Preset overrides={{ bodyFont: 'mono' }}>
        <CellContent
          cellDef={() => 'Bulbasaur'}
          ctx={{}}
          fontSize="$3"
        />
      </Preset>,
    );
    expect(classes(screen.getByText('Bulbasaur'), '_ff-')).toEqual(expected);
  });
});
