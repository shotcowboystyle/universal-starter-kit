import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CardHeader } from './CardHeader';
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

function titleText(container: HTMLElement, label: string): HTMLElement {
  return container.querySelector('[data-heading-font]') ?? screen.getByText(label);
}

describe('CardHeader named exports', () => {
  it('is the Card.Header static and has no default export', async () => {
    expect(Card.Header).toBe(CardHeader);
    const mod = await import('./CardHeader');
    expect(mod.CardHeader).toBe(CardHeader);
    expect('default' in mod).toBe(false);
  });
});

describe('CardHeader — no Tint wrap', () => {
  it('source does not wrap Tint; NestedScale stays on Card', () => {
    const src = readSibling('CardHeader.tsx');
    expect(src).not.toMatch(/from ["'][^"']*Tint["']/);
    expect(src).not.toMatch(/<[Tt]int[\s/>]/);
    expect(src).not.toMatch(/function NestedScale/);
    expect(src).toMatch(/padding=\{0\}/);
  });
});

describe('CardHeader design-law — T-HEADING text node', () => {
  afterEach(cleanup);

  it('wraps bare strings so the title is not a DIV', () => {
    renderWithProviders(
      <Card>
        <Card.Header>Header title</Card.Header>
      </Card>,
    );
    const title = screen.getByText('Header title');
    expect(title.tagName).not.toBe('DIV');
    expect(title.getAttribute('data-heading-font')).toBeTruthy();
  });

  it('coalesces array-of-strings children into one wrapped label', () => {
    renderWithProviders(
      <Card>
        <Card.Header>
          Section
          {' (3)'}
        </Card.Header>
      </Card>,
    );
    const title = screen.getByText('Section (3)');
    expect(title.tagName).not.toBe('DIV');
  });

  it('keeps title text on the 400/700 weight ladder, never 600', () => {
    const { container } = renderWithProviders(
      <Card>
        <Card.Header>Header title</Card.Header>
      </Card>,
    );
    const weight = atoms(titleText(container, 'Header title'), ['_fow-']);
    expect(weight.length).toBeGreaterThan(0);
    expect(weight.join(' ')).not.toMatch(/600|weight-6|fow-6/);
  });

  it('lets the fontWeight knob restyle the title text node', () => {
    const regular = renderWithProviders(
      <Preset overrides={{ fontWeight: 'regular' }}>
        <Card>
          <Card.Header>Header title</Card.Header>
        </Card>
      </Preset>,
    );
    const regularWeight = atoms(titleText(regular.container, 'Header title'), ['_fow-']).join(' ');
    cleanup();

    const bold = renderWithProviders(
      <Preset overrides={{ fontWeight: 'bold' }}>
        <Card>
          <Card.Header>Header title</Card.Header>
        </Card>
      </Preset>,
    );
    const boldWeight = atoms(titleText(bold.container, 'Header title'), ['_fow-']).join(' ');
    expect(regularWeight).not.toMatch(/600|weight-6|fow-6/);
    expect(boldWeight).not.toMatch(/600|weight-6|fow-6/);
    expect(boldWeight).not.toEqual(regularWeight);
    expect(boldWeight).toMatch(/700|weight-7|fow-7/);
  });

  it('lets the headingFont knob restyle the title text node', () => {
    const sans = renderWithProviders(
      <Preset overrides={{ headingFont: 'sans-serif' }}>
        <Card>
          <Card.Header>Header title</Card.Header>
        </Card>
      </Preset>,
    );
    const sansFamily = titleText(sans.container, 'Header title').getAttribute('data-heading-font');
    cleanup();

    const mono = renderWithProviders(
      <Preset overrides={{ headingFont: 'mono' }}>
        <Card>
          <Card.Header>Header title</Card.Header>
        </Card>
      </Preset>,
    );
    expect(sansFamily).toBeTruthy();
    expect(titleText(mono.container, 'Header title').getAttribute('data-heading-font')).toBe('$mono');
    expect(titleText(mono.container, 'Header title').getAttribute('data-heading-font')).not.toBe(sansFamily);
  });

  it('stamps data-slot=header and stays a zero-padding slot', () => {
    const src = readSibling('CardHeader.tsx');
    expect(src).toMatch(/padding=\{0\}/);
    const { container } = renderWithProviders(
      <Card>
        <Card.Header>Title</Card.Header>
      </Card>,
    );
    expect(container.querySelector('[data-slot="header"]')?.textContent).toContain('Title');
  });
});
