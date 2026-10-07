// @vitest-environment jsdom

import { renderWithProviders } from '@repo/test-utils';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Fieldset } from './FormSection';

const legendWeight = (legend: HTMLElement | null): string => {
  if (legend === null) {
    return '';
  }
  if (legend.style.fontWeight !== '') {
    return legend.style.fontWeight;
  }
  const computed = getComputedStyle(legend).fontWeight;
  if (computed !== '') {
    return computed;
  }
  return /fw-400|fow-400|font-weight-400/u.test(legend.className) ? '400' : '';
};

describe(Fieldset, () => {
  afterEach(cleanup);

  it('renders a semantic fieldset + legend on web', () => {
    const result = renderWithProviders(
      <Fieldset label="Contact">
        <div>email</div>
      </Fieldset>,
    );
    expect(result.container.querySelector('fieldset')).toBeTruthy();
    expect(result.container.querySelector('[data-mpo-fieldset]')).toBeTruthy();
    expect(result.container.querySelector('legend')?.textContent).toContain('Contact');
  });

  it('paints the legend at weight 400', () => {
    const result = renderWithProviders(
      <Fieldset label="Account">
        <div>name</div>
      </Fieldset>,
    );
    const legend =
      result.container.querySelector<HTMLElement>('[data-mpo-legend]') ??
      result.container.querySelector<HTMLElement>('legend');
    expect(legend).toBeTruthy();
    expect(['400', 'normal']).toContain(legendWeight(legend));
  });
});
