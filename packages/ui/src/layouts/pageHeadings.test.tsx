/**
 * Exactly one h1 per page, sequential heading levels.
 *
 * Covers: PageHeader renders the single h1 under Screen, headingLevel steps
 * the semantic tag without visual change, PageSection/Timeline defaults sit
 * at h2, and the `multiple-h1` DEV warn fires when a second level-1 heading
 * mounts under one Screen.
 */

import { renderWithProviders } from '@repo/test-utils';
import { __resetDevWarnSeen } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PageHeader, PageSection, Screen } from './Page';
import { PageHeadingScope } from './pageHeadingScope';
import { Timeline } from './Timeline';

afterEach(cleanup);

function headingSequence(container: HTMLElement): Array<{ level: number; text: string }> {
  return [...container.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((el) => ({
    level: Number(el.tagName[1]),
    text: (el.textContent ?? '').trim(),
  }));
}

describe('heading structure', () => {
  it('Screen + PageHeader renders the page title as the single h1', () => {
    const { container } = renderWithProviders(
      <Screen scroll={false}>
        <PageHeader title="Pokemon" subtitle="All pokemon" />
        <PageSection title="Stats" />
      </Screen>,
    );

    const h1s = container.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.textContent).toBe('Pokemon');
  });

  it('section headings step h1 → h2 without skips', () => {
    const { container } = renderWithProviders(
      <Screen scroll={false}>
        <PageHeader title="Pokemon" />
        <PageSection title="Stats" />
        <PageSection title="Moves" />
      </Screen>,
    );

    expect(headingSequence(container)).toEqual([
      { level: 1, text: 'Pokemon' },
      { level: 2, text: 'Stats' },
      { level: 2, text: 'Moves' },
    ]);
  });

  it('PageHeader headingLevel demotes the tag (no h1) without dropping the title', () => {
    const { container } = renderWithProviders(<PageHeader title="Nested pane" headingLevel={2} />);

    expect(container.querySelectorAll('h1')).toHaveLength(0);
    expect(container.querySelector('h2')?.textContent).toBe('Nested pane');
  });

  it('PageSection headingLevel steps nested sections to h3', () => {
    const { container } = renderWithProviders(<PageSection title="Sub section" headingLevel={3} />);

    expect(container.querySelectorAll('h2')).toHaveLength(0);
    expect(container.querySelector('h3')?.textContent).toBe('Sub section');
  });

  it('Timeline label is an h2 section heading by default and steps via headingLevel', () => {
    const first = renderWithProviders(<Timeline entries={[]} label="Activity" />);
    expect(first.container.querySelector('h2')?.textContent).toBe('Activity');
    cleanup();

    const second = renderWithProviders(<Timeline entries={[]} label="Activity" headingLevel={3} />);
    expect(second.container.querySelector('h3')?.textContent).toBe('Activity');
    expect(second.container.querySelectorAll('h2')).toHaveLength(0);
  });
});

describe('multiple-h1 DEV warn (PageHeadingScope)', () => {
  beforeEach(() => {
    __resetDevWarnSeen();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function multipleH1Warnings(warn: ReturnType<typeof vi.spyOn>): string[] {
    return warn.mock.calls.map((call) => String(call[0])).filter((m) => m.includes('multiple-h1'));
  }

  it('warns when two h1 page headings mount under one Screen', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    renderWithProviders(
      <Screen scroll={false}>
        <PageHeader title="First" />
        <PageHeader title="Second" />
      </Screen>,
    );

    expect(multipleH1Warnings(warn).length).toBeGreaterThan(0);
  });

  it('does not warn for a single h1 with stepped sections', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    renderWithProviders(
      <Screen scroll={false}>
        <PageHeader title="Only title" />
        <PageSection title="Section" />
        <Timeline entries={[]} label="Activity" />
      </Screen>,
    );

    expect(multipleH1Warnings(warn)).toEqual([]);
  });

  it('does not warn when the second header is demoted via headingLevel', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    renderWithProviders(
      <Screen scroll={false}>
        <PageHeader title="Page title" />
        <PageHeader title="Pane title" headingLevel={2} />
      </Screen>,
    );

    expect(multipleH1Warnings(warn)).toEqual([]);
  });

  it('scopes the budget: sibling scopes each allow their own h1', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    renderWithProviders(
      <>
        <PageHeadingScope>
          <PageHeader title="Page A" />
        </PageHeadingScope>
        <PageHeadingScope>
          <PageHeader title="Page B" />
        </PageHeadingScope>
      </>,
    );

    expect(multipleH1Warnings(warn)).toEqual([]);
  });
});
