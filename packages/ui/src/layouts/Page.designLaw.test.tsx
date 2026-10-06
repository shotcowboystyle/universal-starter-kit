import { readFileSync } from 'node:fs';
import path from 'node:path';

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PageHeader, PageSection, Screen } from './Page';
import { ListPageLayout } from './PageTemplates';

const readSibling = (name: string) => readFileSync(path.join(import.meta.dirname, name), 'utf-8');

const atoms = (el: HTMLElement, prefixes: string[]): string[] =>
  el.className
    .split(' ')
    .filter((c) => prefixes.some((p) => c.startsWith(p)))
    .toSorted();

describe('page layouts named exports', () => {
  it('page.tsx and PageTemplates export named functions only', () => {
    const page = readSibling('page.tsx');
    const templates = readSibling('PageTemplates.tsx');
    expect(page).toMatch(/export const Screen = /u);
    expect(page).toMatch(/export const PageHeader = /u);
    expect(page).toMatch(/export const PageSection = /u);
    expect(templates).toMatch(/export const ListPageLayout = /u);
    expect(templates).toMatch(/export const DetailPageLayout = /u);
    expect(templates).toMatch(/export const SettingsPageLayout = /u);
    expect(page).not.toMatch(/export default/u);
    expect(templates).not.toMatch(/export default/u);
  });
});

describe('no Tint wrap', () => {
  it('page.tsx does not wrap Tint; NestedScale is the nest dialect', () => {
    const src = readSibling('page.tsx');
    expect(src).not.toMatch(/from ["'][^"']*Tint["']/u);
    expect(src).not.toMatch(/<[Tt]int[\s/>]/u);
    expect(src).toMatch(/const NestedScale = /u);
    expect(src).not.toMatch(/<Surface density="comfortable">/u);
  });
});

describe('PageHeader / PageSection labels — weight 400, never 600', () => {
  afterEach(cleanup);

  it('page title rides the fontWeight knob and is not 600', () => {
    renderWithProviders(<PageHeader title="Workspace Settings" />);
    const title = screen.getByText('Workspace Settings');
    const weight = atoms(title, ['_fow-']);
    expect(weight.length).toBeGreaterThan(0);
    expect(weight.join(' ')).not.toMatch(/600|weight-6|fow-6/u);
  });

  it('section title rides the fontWeight knob and is not 600', () => {
    renderWithProviders(<PageSection title="Profile" />);
    const title = screen.getByText('Profile');
    const weight = atoms(title, ['_fow-']);
    expect(weight.length).toBeGreaterThan(0);
    expect(weight.join(' ')).not.toMatch(/600|weight-6|fow-6/u);
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
    expect(weight.join(' ')).not.toMatch(/600|weight-6|fow-6/u);
  });
});

describe('density unpinned', () => {
  afterEach(cleanup);

  it('PageHeader publishes density and does not pin compact', () => {
    const { container } = renderWithProviders(<PageHeader title="Workspace" />);
    const frame = container.querySelector<HTMLElement>('[data-testid="page-header"]')!;
    expect(frame.dataset.density).toBeTruthy();
    expect(frame.dataset.density).not.toBe('');
  });

  it('omitted compact follows the density knob on Screen and templates', () => {
    const comfortable = renderWithProviders(
      <Preset overrides={{ density: 'comfortable' }}>
        <Screen data-testid="screen-shell">
          <PageHeader title="Comfortable" />
        </Screen>
      </Preset>,
    );
    const comfortableScreen = comfortable.container.querySelector<HTMLElement>('[data-testid="screen-shell"]')!;
    const comfortableHeader = comfortable.container.querySelector<HTMLElement>('[data-testid="page-header"]')!;
    expect(comfortableScreen.dataset.density).toBe('comfortable');
    expect(comfortableHeader.dataset.density).toBe('comfortable');
    cleanup();

    const compact = renderWithProviders(
      <Preset overrides={{ density: 'compact' }}>
        <Screen data-testid="screen-shell">
          <PageHeader title="Compact" />
        </Screen>
      </Preset>,
    );
    const compactScreen = compact.container.querySelector<HTMLElement>('[data-testid="screen-shell"]')!;
    const compactHeader = compact.container.querySelector<HTMLElement>('[data-testid="page-header"]')!;
    expect(compactScreen.dataset.density).toBe('compact');
    expect(compactHeader.dataset.density).toBe('compact');
  });

  it('ListPageLayout rides the density knob through Screen', () => {
    renderWithProviders(
      <Preset overrides={{ density: 'compact' }}>
        <ListPageLayout
          title="Pokemon"
          data-testid="list-shell">
          <span>rows</span>
        </ListPageLayout>
      </Preset>,
    );
    expect(screen.getByTestId('list-shell').dataset.density).toBe('compact');
    expect(screen.getByTestId('page-header').dataset.density).toBe('compact');
  });

  it('explicit compact publishes compact density', () => {
    const { container } = renderWithProviders(
      <PageSection
        compact
        title="Profile"
      />,
    );
    const frame = container.querySelector<HTMLElement>('[data-testid="page-section"]')!;
    expect(frame.dataset.density).toBe('compact');
  });

  it("Screen's explicit density override reaches nested page primitives", () => {
    renderWithProviders(
      <Preset overrides={{ density: 'comfortable' }}>
        <Screen
          compact
          scroll={false}>
          <PageHeader title="Compact screen" />
          <PageSection title="Inherited section" />
        </Screen>
      </Preset>,
    );
    expect(screen.getByTestId('page-header').dataset.density).toBe('compact');
    expect(screen.getByTestId('page-section').dataset.density).toBe('compact');
  });

  it('a painted section steps its interior density without shrinking its heading', () => {
    renderWithProviders(
      <Preset overrides={{ density: 'comfortable' }}>
        <PageSection
          surface
          title="Outer"
          data-testid="outer-section">
          <PageSection
            title="Inner"
            data-testid="inner-section"
          />
        </PageSection>
      </Preset>,
    );
    expect(screen.getByTestId('outer-section').dataset.density).toBe('comfortable');
    expect(screen.getByTestId('inner-section').dataset.density).toBe('compact');
  });
});

describe('PageSection surface declares its container cap', () => {
  afterEach(cleanup);

  it('the painted surface carries the knob stops its radius resolved from', () => {
    renderWithProviders(
      <Preset overrides={{ borderRadius: 'full', space: 'small' }}>
        <PageSection
          surface
          title="Details"
          data-testid="details"
        />
      </Preset>,
    );
    const surface = document.querySelector<HTMLElement>('[data-constraint-container="PageSection"]');
    expect(surface?.dataset.radiusKnob).toBe('full');
    expect(surface?.dataset.spaceKnob).toBe('small');
  });

  it('a section without a surface makes no claim', () => {
    renderWithProviders(<PageSection title="Plain" />);
    expect(document.querySelector('[data-constraint-container]')).toBeNull();
  });
});
