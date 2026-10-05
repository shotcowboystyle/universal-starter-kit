import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Breadcrumbs } from './Breadcrumbs';

const items = [{ label: 'Home', href: '/' }, { label: 'Projects', href: '/projects' }, { label: 'Settings' }];

describe('Breadcrumbs', () => {
  it('publishes density and paints crumb labels at weight 400 (§6.1)', () => {
    const { container } = renderWithProviders(<Breadcrumbs items={items} />);
    const nav = container.querySelector('[data-testid="breadcrumbs"]') as HTMLElement;
    expect(nav).toBeTruthy();
    expect(nav.getAttribute('data-density')).toBeTruthy();
    expect(nav.getAttribute('data-density')).not.toBe('');

    const current = container.querySelector('[aria-current="page"]') as HTMLElement;
    expect(current).toBeTruthy();
    const currentWeight = current.style.fontWeight || getComputedStyle(current).fontWeight;
    expect(['400', 'normal']).toContain(String(currentWeight));

    const home = [...container.querySelectorAll('a')].find((el) => el.textContent === 'Home');
    expect(home).toBeTruthy();
    const linkWeight = home!.style.fontWeight || getComputedStyle(home!).fontWeight;
    expect(['400', 'normal']).toContain(String(linkWeight));
  });

  it('hides the slash separators from AT and paints them as T-HELPER ink', () => {
    const { container } = renderWithProviders(<Breadcrumbs items={items} />);
    const separators = [...container.querySelectorAll('[data-testid="breadcrumb-separator"]')];
    expect(separators).toHaveLength(2);
    for (const sep of separators) {
      expect(sep.getAttribute('aria-hidden')).toBe('true');
      expect(sep.textContent).toBe('/');
    }
    // Distinct token from the warning-surface fix: separators ride textAccentColor (AA floor
    // at $color11), not componentColors.text.subtle ($color8).
    const source = readFileSync(join(import.meta.dirname, 'breadcrumbs.tsx'), 'utf8');
    expect(source).toMatch(/color=\{knobProps\.textAccentColor\}/);
    expect(source).not.toMatch(/color=\{componentColors\.text\.subtle\}/);
  });

  it('calls onNavigate from a path crumb and keeps the current page inert', () => {
    const onNavigate = vi.fn();
    const { container } = renderWithProviders(<Breadcrumbs items={items} onNavigate={onNavigate} />);
    fireEvent.click([...container.querySelectorAll('a')].find((el) => el.textContent === 'Home')!);
    expect(onNavigate).toHaveBeenCalledWith('/');
    expect(container.querySelector('[aria-current="page"]')?.textContent).toBe('Settings');
  });
});
