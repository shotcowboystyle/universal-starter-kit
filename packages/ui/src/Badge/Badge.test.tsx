import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import { Text } from 'tamagui';
import { afterEach, describe, expect, it } from 'vitest';

import { Badge } from './index';
import * as BadgeModule from './index';

function atoms(el: Element | null, prefixes: string[]): string[] {
  if (!el) {
    return [];
  }
  return String((el as HTMLElement).className || '')
    .split(' ')
    .filter((c) => prefixes.some((p) => c.startsWith(p)))
    .sort();
}

function countText(container: HTMLElement): HTMLElement {
  const pill = container.querySelector('[data-badge="count"]');
  const node = pill?.querySelector('span, div') ?? pill?.firstElementChild;
  return (node ?? pill) as HTMLElement;
}

describe('Badge', () => {
  it('hides when count is 0 and shows with showZero', () => {
    const hidden = renderWithProviders(
      <Badge count={0}>
        <Text>Bell</Text>
      </Badge>,
    );
    expect(hidden.container.querySelector('[data-badge]')).toBeNull();
    expect(hidden.container.textContent).toContain('Bell');

    const shown = renderWithProviders(
      <Badge count={0} showZero>
        <Text>Bell</Text>
      </Badge>,
    );
    expect(shown.container.querySelector('[data-badge="count"]')?.textContent).toContain('0');
  });

  it('renders max+ visually and exposes the exact count to AT (Carbon)', () => {
    const { container } = renderWithProviders(
      <Badge count={150} max={99}>
        <Text>Bell</Text>
      </Badge>,
    );
    const pill = container.querySelector('[data-badge="count"]');
    expect(pill?.getAttribute('data-overflow')).toBe('true');
    expect(pill?.textContent).toContain('99+');
    expect(pill?.getAttribute('aria-label')).toBe('150');
    expect(pill?.getAttribute('title')).toBe('150');
  });

  it('treats negative and non-finite counts as empty', () => {
    const negative = renderWithProviders(
      <Badge count={-3}>
        <Text>Bell</Text>
      </Badge>,
    );
    expect(negative.container.querySelector('[data-badge]')).toBeNull();

    const nan = renderWithProviders(
      <Badge count={Number.NaN}>
        <Text>Bell</Text>
      </Badge>,
    );
    expect(nan.container.querySelector('[data-badge]')).toBeNull();
  });

  it('renders a standalone CounterLabel without a host', () => {
    const { container } = renderWithProviders(<Badge count={12} />);
    const pill = container.querySelector('[data-badge="count"]');
    expect(pill).toBeTruthy();
    expect(pill?.textContent).toContain('12');
    expect(container.querySelector('[data-badge]')).toBe(pill);
  });

  it('names a dot as New activity and keeps it a status, not a control', () => {
    const { container } = renderWithProviders(
      <Badge dot>
        <Text>Bell</Text>
      </Badge>,
    );
    const pill = container.querySelector('[data-badge="dot"]');
    expect(pill?.getAttribute('aria-label')).toBe('New activity');
    expect(pill?.getAttribute('role')).toBe('status');
    expect(pill?.getAttribute('tabindex')).toBeNull();
  });

  it('declares R-PILL on the count/dot', () => {
    const { container } = renderWithProviders(
      <Badge count={1}>
        <Text>Bell</Text>
      </Badge>,
    );
    const el = container.querySelector('[data-radius-class]');
    expect(el?.getAttribute('data-radius-class')).toBe('R-PILL');
    expect(el?.getAttribute('data-radius-part')).toBe('Badge count/dot');
  });

  it('hides the indicator when visible is false', () => {
    const { container } = renderWithProviders(
      <Badge count={5} visible={false}>
        <Text>Bell</Text>
      </Badge>,
    );
    expect(container.querySelector('[data-badge]')).toBeNull();
    expect(container.textContent).toContain('Bell');
  });

  it('renders 0+ when max is 0 and count is positive', () => {
    const { container } = renderWithProviders(<Badge count={1} max={0} />);
    const pill = container.querySelector('[data-badge="count"]');
    expect(pill?.getAttribute('data-overflow')).toBe('true');
    expect(pill?.textContent).toContain('0+');
    expect(pill?.getAttribute('aria-label')).toBe('1');
  });
});

describe('Badge named exports', () => {
  it('exports Badge as a named export and has no default', () => {
    expect(typeof BadgeModule.Badge).toBe('function');
    expect('default' in BadgeModule).toBe(false);
  });
});

describe('Badge design-law — T-BODY count text (SB-M-101)', () => {
  afterEach(cleanup);

  it('pins count text at the badge-owned 600', () => {
    const { container } = renderWithProviders(<Badge count={5} />);
    const weight = atoms(countText(container), ['_fow-']);
    expect(weight.length).toBeGreaterThan(0);
    expect(weight.join(' ')).toMatch(/600|weight-6|fow-6/);
  });

  it('ignores the fontWeight knob so count text stays at 600 (SB-M-101)', () => {
    const regular = renderWithProviders(
      <Preset overrides={{ fontWeight: 'regular' }}>
        <Badge count={5} />
      </Preset>,
    );
    const regularWeight = atoms(countText(regular.container), ['_fow-']).join(' ');
    cleanup();

    const bold = renderWithProviders(
      <Preset overrides={{ fontWeight: 'bold' }}>
        <Badge count={5} />
      </Preset>,
    );
    const boldWeight = atoms(countText(bold.container), ['_fow-']).join(' ');
    expect(regularWeight).toMatch(/600|weight-6|fow-6/);
    expect(boldWeight).toMatch(/600|weight-6|fow-6/);
    expect(boldWeight).toEqual(regularWeight);
  });

  it('lets the bodyFont knob restyle the count text node', () => {
    const sans = renderWithProviders(
      <Preset overrides={{ bodyFont: 'sans-serif' }}>
        <Badge count={5} />
      </Preset>,
    );
    const sansFamily = atoms(countText(sans.container), ['_ff-']);
    const sansBodyFont = countText(sans.container).getAttribute('data-body-font');
    cleanup();

    const mono = renderWithProviders(
      <Preset overrides={{ bodyFont: 'mono' }}>
        <Badge count={5} />
      </Preset>,
    );
    const monoBodyFont = countText(mono.container).getAttribute('data-body-font');
    expect(sansFamily.length).toBeGreaterThan(0);
    expect(sansBodyFont).not.toBe(monoBodyFont);
    expect(monoBodyFont).toBe('$mono');
  });
});

describe('Badge design-law — size geometry and R-PILL', () => {
  afterEach(cleanup);

  it('scales capsule height with the size knob', () => {
    const small = renderWithProviders(
      <Preset overrides={{ size: 'small' }}>
        <Badge count={5} />
      </Preset>,
    );
    const smallHeight = atoms(small.container.querySelector('[data-badge]'), ['_h-']);
    cleanup();

    const large = renderWithProviders(
      <Preset overrides={{ size: 'large' }}>
        <Badge count={5} />
      </Preset>,
    );
    expect(smallHeight.length).toBeGreaterThan(0);
    expect(atoms(large.container.querySelector('[data-badge]'), ['_h-'])).not.toEqual(smallHeight);
  });

  it('stays a pill at borderRadius none (R-PILL, Axiom 3 does not square it)', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ borderRadius: 'none' }}>
        <Badge count={1} />
      </Preset>,
    );
    const pill = container.querySelector('[data-badge]') as HTMLElement;
    expect(pill.getAttribute('data-radius-class')).toBe('R-PILL');
    const radius = atoms(pill, ['_br-', '_btlr-']);
    expect(radius.join(' ')).not.toMatch(/radius-0\b|_br-0(?:px)?\b|_btlr-t-radius-0/);
  });
});
