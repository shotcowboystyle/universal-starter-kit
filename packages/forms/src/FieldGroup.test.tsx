/**
 * @vitest-environment jsdom
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FieldGroup } from './FieldGroup';

afterEach(cleanup);

describe('FieldGroup design-law', () => {
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
    const legend = result.container.querySelector('[data-mpo-legend]') as HTMLElement | null;
    expect(legend).toBeTruthy();
    const weight =
      legend?.style.fontWeight ||
      (legend ? getComputedStyle(legend).fontWeight : '') ||
      (legend?.className.match(/fw-400|fow-400|font-weight-400/) ? '400' : '');
    expect(['400', 'normal']).toContain(String(weight));
  });

  it('field gap follows space, not sizeToken (density≠size)', () => {
    const result = renderWithProviders(
      <Preset overrides={{ size: 'large', space: 'small' }}>
        <FieldGroup legend="Billing">
          <div>card</div>
        </FieldGroup>
      </Preset>,
    );
    const group = result.container.querySelector('[data-mpo-field-group]');
    expect(group?.getAttribute('data-field-gap')).toBe('$2');
    expect(group?.getAttribute('data-size')).toBe('large');
  });

  it('compact nested scale steps density without reading sizeToken as gap', () => {
    const result = renderWithProviders(
      <FieldGroup legend="Compact" compact>
        <div>field</div>
      </FieldGroup>,
    );
    const group = result.container.querySelector('[data-mpo-field-group]');
    expect(group?.getAttribute('data-density')).toBe('compact');
    expect(group?.getAttribute('data-size')).toBe('medium');
    expect(group?.getAttribute('data-field-gap')).toBe('$2');
  });
});
