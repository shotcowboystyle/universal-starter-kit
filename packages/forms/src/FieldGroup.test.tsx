// @vitest-environment jsdom

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FieldGroup } from './FieldGroup';

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

describe('FieldGroup design-law', () => {
  afterEach(cleanup);

  it('renders a semantic fieldset + legend on web', () => {
    const result = renderWithProviders(
      <FieldGroup legend="Billing">
        <div>card</div>
      </FieldGroup>,
    );
    expect(result.container.querySelector('fieldset[data-mpo-field-group]')).toBeTruthy();
    expect(result.container.querySelector('[data-mpo-legend]')?.textContent).toBe('Billing');
  });

  it('paints the legend at weight 400', () => {
    const result = renderWithProviders(
      <FieldGroup legend="Name">
        <div>first</div>
      </FieldGroup>,
    );
    const legend = result.container.querySelector<HTMLElement>('[data-mpo-legend]');
    expect(legend).toBeTruthy();
    expect(['400', 'normal']).toContain(legendWeight(legend));
  });

  it('field gap follows space, not sizeToken (density≠size)', () => {
    const result = renderWithProviders(
      <Preset overrides={{ size: 'large', space: 'small' }}>
        <FieldGroup legend="Billing">
          <div>card</div>
        </FieldGroup>
      </Preset>,
    );
    const group = result.container.querySelector<HTMLElement>('[data-mpo-field-group]');
    expect(group?.dataset.fieldGap).toBe('$2');
    expect(group?.dataset.size).toBe('large');
  });

  it('compact nested scale steps density without reading sizeToken as gap', () => {
    const result = renderWithProviders(
      <FieldGroup
        legend="Compact"
        compact>
        <div>field</div>
      </FieldGroup>,
    );
    const group = result.container.querySelector<HTMLElement>('[data-mpo-field-group]');
    expect(group?.dataset.density).toBe('compact');
    expect(group?.dataset.size).toBe('medium');
    expect(group?.dataset.fieldGap).toBe('$2');
  });
});
