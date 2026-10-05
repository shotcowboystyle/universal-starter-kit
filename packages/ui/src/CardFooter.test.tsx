import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CardFooter } from './CardFooter';
import { Card } from './surfaces';

function readSibling(name: string) {
  return readFileSync(join(import.meta.dirname, name), 'utf8');
}

function atoms(el: Element | null, prefixes: string[]): string[] {
  if (!el) {
    return [];
  }
  return String((el as HTMLElement).className || '')
    .split(' ')
    .filter((c) => prefixes.some((p) => c.startsWith(p)))
    .sort();
}

function captionText(container: HTMLElement, label: string): HTMLElement {
  return container.querySelector('[data-body-font]') ?? screen.getByText(label);
}

describe('CardFooter named exports', () => {
  it('is the Card.Footer static and has no default export', async () => {
    expect(Card.Footer).toBe(CardFooter);
    const mod = await import('./CardFooter');
    expect(mod.CardFooter).toBe(CardFooter);
    expect('default' in mod).toBe(false);
  });
});

describe('CardFooter — no Tint wrap', () => {
  it('source does not wrap Tint; NestedScale stays on Card', () => {
    const src = readSibling('CardFooter.tsx');
    expect(src).not.toMatch(/from ["'][^"']*Tint["']/);
    expect(src).not.toMatch(/<[Tt]int[\s/>]/);
    expect(src).not.toMatch(/function NestedScale/);
    expect(src).toMatch(/padding=\{0\}/);
  });
});

describe('CardFooter design-law — T-BODY text node', () => {
  afterEach(cleanup);

  it('wraps bare strings so the caption is not a DIV', () => {
    renderWithProviders(
      <Card>
        <Card.Footer>Ready to submit</Card.Footer>
      </Card>,
    );
    const caption = screen.getByText('Ready to submit');
    expect(caption.tagName).not.toBe('DIV');
    expect(caption.getAttribute('data-body-font')).toBeTruthy();
  });

  it('coalesces array-of-strings children into one wrapped label', () => {
    renderWithProviders(
      <Card>
        <Card.Footer>
          Last saved
          {' just now'}
        </Card.Footer>
      </Card>,
    );
    const caption = screen.getByText('Last saved just now');
    expect(caption.tagName).not.toBe('DIV');
  });

  it('keeps caption text on the 400/700 weight ladder, never 600', () => {
    const { container } = renderWithProviders(
      <Card>
        <Card.Footer>Ready to submit</Card.Footer>
      </Card>,
    );
    const weight = atoms(captionText(container, 'Ready to submit'), ['_fow-']);
    expect(weight.length).toBeGreaterThan(0);
    expect(weight.join(' ')).not.toMatch(/600|weight-6|fow-6/);
  });

  it('lets the fontWeight knob restyle the caption text node', () => {
    const regular = renderWithProviders(
      <Preset overrides={{ fontWeight: 'regular' }}>
        <Card>
          <Card.Footer>Ready to submit</Card.Footer>
        </Card>
      </Preset>,
    );
    const regularWeight = atoms(captionText(regular.container, 'Ready to submit'), ['_fow-']).join(' ');
    cleanup();

    const bold = renderWithProviders(
      <Preset overrides={{ fontWeight: 'bold' }}>
        <Card>
          <Card.Footer>Ready to submit</Card.Footer>
        </Card>
      </Preset>,
    );
    const boldWeight = atoms(captionText(bold.container, 'Ready to submit'), ['_fow-']).join(' ');
    expect(regularWeight).not.toMatch(/600|weight-6|fow-6/);
    expect(boldWeight).not.toMatch(/600|weight-6|fow-6/);
    expect(boldWeight).not.toEqual(regularWeight);
    expect(boldWeight).toMatch(/700|weight-7|fow-7/);
  });

  it('lets the bodyFont knob restyle the caption text node', () => {
    const sans = renderWithProviders(
      <Preset overrides={{ bodyFont: 'sans-serif' }}>
        <Card>
          <Card.Footer>Ready to submit</Card.Footer>
        </Card>
      </Preset>,
    );
    const sansFamily = captionText(sans.container, 'Ready to submit').getAttribute('data-body-font');
    cleanup();

    const mono = renderWithProviders(
      <Preset overrides={{ bodyFont: 'mono' }}>
        <Card>
          <Card.Footer>Ready to submit</Card.Footer>
        </Card>
      </Preset>,
    );
    expect(sansFamily).toBeTruthy();
    expect(captionText(mono.container, 'Ready to submit').getAttribute('data-body-font')).toBe('$mono');
    expect(captionText(mono.container, 'Ready to submit').getAttribute('data-body-font')).not.toBe(sansFamily);
  });

  it('stamps data-slot=footer and stays a zero-padding slot', () => {
    const src = readSibling('CardFooter.tsx');
    expect(src).toMatch(/padding=\{0\}/);
    const { container } = renderWithProviders(
      <Card>
        <Card.Footer>Actions</Card.Footer>
      </Card>,
    );
    expect(container.querySelector('[data-slot="footer"]')?.textContent).toContain('Actions');
  });
});
