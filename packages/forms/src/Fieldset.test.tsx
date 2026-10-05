/**
 * @vitest-environment jsdom
 */

import { renderWithProviders } from '@repo/test-utils';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Fieldset } from './FormSection';

afterEach(cleanup);

describe('Fieldset', () => {
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
    const legend = (result.container.querySelector('[data-mpo-legend]') ||
      result.container.querySelector('legend')) as HTMLElement | null;
    expect(legend).toBeTruthy();
    const weight =
      legend?.style.fontWeight ||
      (legend ? getComputedStyle(legend).fontWeight : '') ||
      (legend?.className.match(/fw-400|fow-400|font-weight-400/) ? '400' : '');
    expect(['400', 'normal']).toContain(String(weight));
  });
});
