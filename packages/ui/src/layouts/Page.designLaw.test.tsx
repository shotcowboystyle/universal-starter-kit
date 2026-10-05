import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PageHeader, PageSection, Screen } from './Page';
import { ListPageLayout } from './PageTemplates';

function readSibling(name: string) {
  return readFileSync(join(import.meta.dirname, name), 'utf8');
}

function atoms(el: Element, prefixes: string[]): string[] {
  return String((el as HTMLElement).className || '')
    .split(' ')
    .filter((c) => prefixes.some((p) => c.startsWith(p)))
    .sort();
}

afterEach(cleanup);

describe('page layouts named exports', () => {
  it('page.tsx and PageTemplates export named functions only', () => {
    const page = readSibling('page.tsx');
    const templates = readSibling('PageTemplates.tsx');
    expect(page).toMatch(/export function Screen/);
    expect(page).toMatch(/export function PageHeader/);
    expect(page).toMatch(/export function PageSection/);
    expect(templates).toMatch(/export function ListPageLayout/);
    expect(templates).toMatch(/export function DetailPageLayout/);
    expect(templates).toMatch(/export function SettingsPageLayout/);
    expect(page).not.toMatch(/export default/);
    expect(templates).not.toMatch(/export default/);
  });
});

describe('no Tint wrap', () => {
  it('page.tsx does not wrap Tint; NestedScale is the nest dialect', () => {
    const src = readSibling('page.tsx');
    expect(src).not.toMatch(/from ["'][^"']*Tint["']/);
    expect(src).not.toMatch(/<[Tt]int[\s/>]/);
    expect(src).toMatch(/function NestedScale/);
    expect(src).not.toMatch(/<Surface density="comfortable">/);
  });
});

describe('PageHeader / PageSection labels — weight 400, never 600', () => {
  it('page title rides the fontWeight knob and is not 600', () => {
    renderWithProviders(<PageHeader title="Workspace Settings" />);
    const title = screen.getByText('Workspace Settings');
    const weight = atoms(title, ['_fow-']);
    expect(weight.length).toBeGreaterThan(0);
    expect(weight.join(' ')).not.toMatch(/600|weight-6|fow-6/);
  });

  it('section title rides the fontWeight knob and is not 600', () => {
    renderWithProviders(<PageSection title="Profile" />);
    const title = screen.getByText('Profile');
    const weight = atoms(title, ['_fow-']);
    expect(weight.length).toBeGreaterThan(0);
    expect(weight.join(' ')).not.toMatch(/600|weight-6|fow-6/);
  });

  it('bold fontWeight knob restyles the page title without landing on 600', () => {
    renderWithProviders(
      <Preset overrides={{ fontWeight: 'bold' }}>
        <PageHeader title="Workspace Settings" />
      </Preset>,
    );
    const title = screen.getByText('Workspace Settings');
    const weight = atoms(title, ['_fow-']);
    expect(weight.length).toBeGreaterThan(0);
    expect(weight.join(' ')).not.toMatch(/600|weight-6|fow-6/);
  });
});

describe('density unpinned', () => {
  it('PageHeader publishes density and does not pin compact', () => {
    const { container } = renderWithProviders(<PageHeader title="Workspace" />);
    const frame = container.querySelector('[data-testid="page-header"]') as HTMLElement;
    expect(frame.getAttribute('data-density')).toBeTruthy();
    expect(frame.getAttribute('data-density')).not.toBe('');
  });

  it('omitted compact follows the density knob on Screen and templates', () => {
    const comfortable = renderWithProviders(
      <Preset overrides={{ density: 'comfortable' }}>
        <Screen data-testid="screen-shell">
          <PageHeader title="Comfortable" />
        </Screen>
      </Preset>,
    );
    const comfortableScreen = comfortable.container.querySelector('[data-testid="screen-shell"]') as HTMLElement;
    const comfortableHeader = comfortable.container.querySelector('[data-testid="page-header"]') as HTMLElement;
    expect(comfortableScreen.getAttribute('data-density')).toBe('comfortable');
    expect(comfortableHeader.getAttribute('data-density')).toBe('comfortable');
    cleanup();

    const compact = renderWithProviders(
      <Preset overrides={{ density: 'compact' }}>
        <Screen data-testid="screen-shell">
          <PageHeader title="Compact" />
        </Screen>
      </Preset>,
    );
    const compactScreen = compact.container.querySelector('[data-testid="screen-shell"]') as HTMLElement;
    const compactHeader = compact.container.querySelector('[data-testid="page-header"]') as HTMLElement;
    expect(compactScreen.getAttribute('data-density')).toBe('compact');
    expect(compactHeader.getAttribute('data-density')).toBe('compact');
  });

  it('ListPageLayout rides the density knob through Screen', () => {
    renderWithProviders(
      <Preset overrides={{ density: 'compact' }}>
        <ListPageLayout title="Pokemon" data-testid="list-shell">
          <span>rows</span>
        </ListPageLayout>
      </Preset>,
    );
    expect(screen.getByTestId('list-shell').getAttribute('data-density')).toBe('compact');
    expect(screen.getByTestId('page-header').getAttribute('data-density')).toBe('compact');
  });

  it('explicit compact publishes compact density', () => {
    const { container } = renderWithProviders(<PageSection compact title="Profile" />);
    const frame = container.querySelector('[data-testid="page-section"]') as HTMLElement;
    expect(frame.getAttribute('data-density')).toBe('compact');
  });

  it("Screen's explicit density override reaches nested page primitives", () => {
    renderWithProviders(
      <Preset overrides={{ density: 'comfortable' }}>
        <Screen compact scroll={false}>
          <PageHeader title="Compact screen" />
          <PageSection title="Inherited section" />
        </Screen>
      </Preset>,
    );
    expect(screen.getByTestId('page-header').getAttribute('data-density')).toBe('compact');
    expect(screen.getByTestId('page-section').getAttribute('data-density')).toBe('compact');
  });

  it('a painted section steps its interior density without shrinking its heading', () => {
    renderWithProviders(
      <Preset overrides={{ density: 'comfortable' }}>
        <PageSection surface title="Outer" data-testid="outer-section">
          <PageSection title="Inner" data-testid="inner-section" />
        </PageSection>
      </Preset>,
    );
    expect(screen.getByTestId('outer-section').getAttribute('data-density')).toBe('comfortable');
    expect(screen.getByTestId('inner-section').getAttribute('data-density')).toBe('compact');
  });
});

describe('PageSection surface declares its container cap', () => {
  it('the painted surface carries the knob stops its radius resolved from', () => {
    renderWithProviders(
      <Preset overrides={{ borderRadius: 'full', space: 'small' }}>
        <PageSection surface title="Details" data-testid="details">
          <></>
        </PageSection>
      </Preset>,
    );
    const surface = document.querySelector('[data-constraint-container="PageSection"]');
    expect(surface?.getAttribute('data-radius-knob')).toBe('full');
    expect(surface?.getAttribute('data-space-knob')).toBe('small');
  });

  it('a section without a surface makes no claim', () => {
    renderWithProviders(<PageSection title="Plain" />);
    expect(document.querySelector('[data-constraint-container]')).toBeNull();
  });
});
