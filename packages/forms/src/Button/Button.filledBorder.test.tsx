/**
 * @vitest-environment jsdom
 *
 * A filled Button keeps a 1px
 * TRANSPARENT border so filled and outlined share box geometry, and only
 * the outlined variant paints `$borderColor` (tamagui-rendered-reference
 * §6.1). jsdom cannot cascade Tamagui CSS — assertions read the atomic
 * border-color / border-width / height classes the FRAME emits.
 */

import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Button } from './index';

afterEach(cleanup);

const frame = (): HTMLElement => screen.getByRole('button');

const atoms = (el: HTMLElement, prefix: string): string[] =>
  String(el.className || '')
    .split(/\s+/u)
    .filter((c) => c.startsWith(prefix))
    .sort();

describe('Button filled border is transparent', () => {
  it('filled paints no visible edge; outlined does; boxes match', () => {
    renderWithProviders(<Button>Filled</Button>);
    const filled = frame();
    const filledHeight = atoms(filled, '_h-');
    const filledPad = [...atoms(filled, '_pr-'), ...atoms(filled, '_pl-')];
    const filledWidth = atoms(filled, '_btw-');
    expect(filled.className).toMatch(/_btc-transparent\b/u);
    expect(filled.className).toMatch(/_brc-transparent\b/u);
    expect(filled.className).toMatch(/_bbc-transparent\b/u);
    expect(filled.className).toMatch(/_blc-transparent\b/u);
    expect(filled.className).not.toMatch(/_btc-borderColor\b/u);
    expect(filledWidth).toStrictEqual(['_btw-1px']);
    cleanup();

    renderWithProviders(<Button outlined>Outlined</Button>);
    const outlined = frame();
    expect(outlined.className).toMatch(/_btc-borderColor\b/u);
    expect(outlined.className).toMatch(/_brc-borderColor\b/u);
    expect(outlined.className).toMatch(/_bbc-borderColor\b/u);
    expect(outlined.className).toMatch(/_blc-borderColor\b/u);
    expect(outlined.className).not.toMatch(/_btc-transparent\b/u);
    expect(atoms(outlined, '_btw-')).toStrictEqual(filledWidth);
    expect(atoms(outlined, '_h-')).toStrictEqual(filledHeight);
    expect([...atoms(outlined, '_pr-'), ...atoms(outlined, '_pl-')]).toStrictEqual(filledPad);
  });

  it('intent filled Buttons keep the invisible 1px edge', () => {
    renderWithProviders(<Button error>Destroy</Button>);
    const filled = frame();
    expect(filled.className).toMatch(/_btc-transparent\b/u);
    expect(atoms(filled, '_btw-')).toStrictEqual(['_btw-1px']);
    expect(filled.className).toMatch(/_h-44px\b/u);
    cleanup();

    renderWithProviders(
      <Button
        outlined
        error>
        Destroy
      </Button>,
    );
    const outlined = frame();
    expect(outlined.className).toMatch(/_btc-borderColor\b/u);
    expect(atoms(outlined, '_btw-')).toStrictEqual(['_btw-1px']);
    expect(outlined.className).toMatch(/_h-44px\b/u);
  });
});
