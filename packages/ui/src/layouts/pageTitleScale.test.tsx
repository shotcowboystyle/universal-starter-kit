import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
// Hero-H1 dial: product screens take the moderate page-title step and the
// 64px display scale is an explicit opt-in. jsdom cannot cascade Tamagui's
// class-based CSS, so this asserts on the atomic font-size classes the size
// token emits (same technique as Timeline.radius.test.tsx).
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PageHeader } from './Page';

afterEach(cleanup);

function titleFontClasses(): string[] {
  const title = screen.getByText('Workspace Settings');
  return String(title.className || '')
    .split(' ')
    .filter((c) => c.startsWith('_fos-') || c.startsWith('_lh-'));
}

function renderTitle(node: React.ReactElement): string[] {
  renderWithProviders(node);
  const classes = titleFontClasses();
  cleanup();
  return classes;
}

describe('PageHeader page-title scale', () => {
  it('defaults to the moderate step, not the display H1', () => {
    const byDefault = renderTitle(<PageHeader title="Workspace Settings" />);
    const moderate = renderTitle(<PageHeader title="Workspace Settings" titleScale="moderate" />);
    const display = renderTitle(<PageHeader title="Workspace Settings" titleScale="display" />);

    expect(byDefault).not.toHaveLength(0);
    expect(byDefault).toEqual(moderate);
    expect(byDefault).not.toEqual(display);
  });

  it('the pageTitleScale knob re-scales the title without touching the screen', () => {
    const knobDisplay = renderTitle(
      <Preset overrides={{ pageTitleScale: 'display' }}>
        <PageHeader title="Workspace Settings" />
      </Preset>,
    );
    const propDisplay = renderTitle(<PageHeader title="Workspace Settings" titleScale="display" />);
    const knobModerate = renderTitle(
      <Preset overrides={{ pageTitleScale: 'moderate' }}>
        <PageHeader title="Workspace Settings" />
      </Preset>,
    );

    // Both opt-in channels resolve through the one table, so they agree.
    expect(knobDisplay).toEqual(propDisplay);
    expect(knobDisplay).not.toEqual(knobModerate);
  });

  it('the per-instance eject still wins over the surface knob', () => {
    const ejected = renderTitle(
      <Preset overrides={{ pageTitleScale: 'display' }}>
        <PageHeader title="Workspace Settings" titleScale="moderate" />
      </Preset>,
    );
    const moderate = renderTitle(<PageHeader title="Workspace Settings" titleScale="moderate" />);
    expect(ejected).toEqual(moderate);
  });

  it('the heading level is semantics, not scale — h1 either way', () => {
    renderWithProviders(<PageHeader title="Workspace Settings" titleScale="display" />);
    expect(screen.getByText('Workspace Settings').tagName).toBe('H1');
  });
});
