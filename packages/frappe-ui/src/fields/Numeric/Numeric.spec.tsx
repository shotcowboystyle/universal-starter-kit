import { formCommonColors } from '@repo/forms';
import { renderWithProviders } from '@repo/test-utils';
// Regression test for the FrappeUI/Numeric contrast residual (contrast
// resweep: currency/percent adornments measured 3.96:1 at $color10 on the
// form surface). The unit adornments are semantic content, so they must
// render at the form ramp's body-text tier (formCommonColors.text →
// $color11), never the muted tier.
// jsdom/happy-dom cannot cascade Tamagui's class-based CSS, so this asserts
// on the atomic color classes against same-tree reference elements (same
// approach as tags-trigger.spec.tsx).
import { cleanup, screen } from '@testing-library/react';
import { Text } from 'tamagui';
import { afterEach, describe, expect, it } from 'vitest';

import { Numeric } from './index';

afterEach(cleanup);

function colorClasses(el: Element): string[] {
  return String(el.className || '')
    .split(' ')
    .filter((c) => c.startsWith('_col-'))
    .sort();
}

function renderWithRefs(ui: React.ReactNode) {
  return renderWithProviders(
    <>
      {ui}
      <Text color={formCommonColors.text}>ramp-text-ref</Text>
      <Text color="$color10">muted-ref</Text>
    </>,
  );
}

describe('Numeric unit adornments (contrast residual)', () => {
  it('ramp contract: formCommonColors.text is the $color11 tier', () => {
    expect(formCommonColors.text).toBe('$color11');
  });

  it('Currency symbol renders at the ramp body-text tier, not the muted tier', () => {
    renderWithRefs(
      <Numeric
        type="Currency"
        label="Amount"
        currencySymbol="$"
      />,
    );
    const symbol = screen.getByText('$');
    const rampRef = colorClasses(screen.getByText('ramp-text-ref'));
    const mutedRef = colorClasses(screen.getByText('muted-ref'));
    expect(rampRef.length).toBeGreaterThan(0);
    expect(colorClasses(symbol)).toEqual(rampRef);
    expect(colorClasses(symbol)).not.toEqual(mutedRef);
  });

  it('Percent sign renders at the ramp body-text tier, not the muted tier', () => {
    renderWithRefs(
      <Numeric
        type="Percent"
        label="Ratio"
      />,
    );
    const symbol = screen.getByText('%');
    const rampRef = colorClasses(screen.getByText('ramp-text-ref'));
    const mutedRef = colorClasses(screen.getByText('muted-ref'));
    expect(colorClasses(symbol)).toEqual(rampRef);
    expect(colorClasses(symbol)).not.toEqual(mutedRef);
  });

  it('custom currency symbols inherit the same ramp tier', () => {
    renderWithRefs(
      <Numeric
        type="Currency"
        label="Price"
        currencySymbol="€"
      />,
    );
    const symbol = screen.getByText('€');
    expect(colorClasses(symbol)).toEqual(colorClasses(screen.getByText('ramp-text-ref')));
  });
});

describe('Numeric design-law — compose forms Stepper', () => {
  it('renders a numeric input (Stepper chrome, not a forked Input)', () => {
    const result = renderWithProviders(
      <Numeric
        type="Float"
        label="Qty"
      />,
    );
    expect(result.container.querySelector('input')).toBeTruthy();
  });
});
