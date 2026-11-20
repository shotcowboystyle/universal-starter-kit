import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { KPICard } from '../views/Dashboard';

import { EmptyState } from './EmptyState';

const RADIUS_STOPS = ['none', 'small', 'medium', 'large', 'full'] as const;

const radiusAtoms = (el: Element): string[] =>
  el.className
    .split(' ')
    .filter((c) => /^_(?:btlr|btrr|bbrr|bblr)-/u.test(c))
    .toSorted();

describe(EmptyState, () => {
  afterEach(cleanup);

  it('does not pin compact, so the density knob restyles the frame', () => {
    const { container } = renderWithProviders(<EmptyState title="Create your first record" />);
    const frame = container.querySelector<HTMLElement>('[data-empty-intent]')!;
    expect(frame).toBeTruthy();
    expect(frame.dataset.density).toBeTruthy();
    expect(frame.dataset.density).not.toBe('');
  });

  it('publishes compact density when compact is set', () => {
    const { container } = renderWithProviders(
      <EmptyState
        compact
        title="No matching records"
      />,
    );
    const frame = container.querySelector<HTMLElement>('[data-empty-intent]')!;
    expect(frame.dataset.density).toBe('compact');
  });

  it('renders the title as a heading on the full-page frame', () => {
    const { container } = renderWithProviders(
      <EmptyState
        title="Create your first record"
        description="Records you add will show up here."
      />,
    );
    expect(container.querySelector('h2')?.textContent).toBe('Create your first record');
    expect(container.textContent).toContain('Records you add will show up here.');
  });

  // A refusal's server reason arrives as one message per line. One
  // web paragraph collapsed the break, so the lines read as a single sentence.
  it('renders each line of the description as its own paragraph', () => {
    const { container } = renderWithProviders(
      <EmptyState
        title="You can't create Pokemon"
        description={
          'You are not permitted to access this resource. Login to access\nThe requested endpoint is not allowed for this role.\n'
        }
      />,
    );
    expect([...container.querySelectorAll('p')].map((node) => node.textContent)).toStrictEqual([
      'You are not permitted to access this resource. Login to access',
      'The requested endpoint is not allowed for this role.',
    ]);
  });
});

/**
 * An icon well rides the radius scale
 * (DEFAULT); R-PILL is reserved for a well that IS a count badge. EmptyState
 * declared R-PILL and painted 1000, so its well stayed a circle at every
 * stop while KPICard's well — the dialect the ruling picked — rode the scale.
 */
describe('EmptyState icon well radius (R2e)', () => {
  afterEach(cleanup);

  it.each(RADIUS_STOPS)("at radius %s the well matches KPICard's well", (borderRadius) => {
    renderWithProviders(
      <Preset overrides={{ borderRadius }}>
        <>
          <EmptyState
            title="Nothing here"
            icon={<span data-testid="empty-icon">i</span>}
          />
          <KPICard config={{ id: 'k', title: 'K', value: 1, icon: <span data-testid="kpi-icon">i</span> }} />
        </>
      </Preset>,
    );
    const emptyWell = screen.getByTestId('empty-icon').parentElement!;
    const kpiWell = screen.getByTestId('kpi-icon').parentElement!;
    expect(radiusAtoms(emptyWell)).not.toHaveLength(0);
    expect(radiusAtoms(emptyWell)).toStrictEqual(radiusAtoms(kpiWell));
    // A knob-immunity declaration is what licensed the circle; the well is
    // not immune, so it must carry none.
    expect(emptyWell.dataset.radiusClass).toBeUndefined();
  });

  it('squares at radius none rather than staying a circle', () => {
    renderWithProviders(
      <Preset overrides={{ borderRadius: 'none' }}>
        <EmptyState
          title="Nothing here"
          icon={<span data-testid="empty-icon">i</span>}
        />
      </Preset>,
    );
    const well = screen.getByTestId('empty-icon').parentElement!;
    expect(radiusAtoms(well)).toStrictEqual([
      '_bblr-t-radius-0',
      '_bbrr-t-radius-0',
      '_btlr-t-radius-0',
      '_btrr-t-radius-0',
    ]);
  });
});
