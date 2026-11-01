// FrappeDashboard refresh trigger — LC-54 PRESS-FLOOR-CHANNEL (amendment
// 2026-08-13, "the grown box NEVER PAINTS"): the refresh affordance used to
// be a raw tamagui Button riding a grown transparent press target (negative
// outsets escaping the header slot) whose default hover fill painted the
// whole escaped 44px floor. The fix migrates it to the house forms Button
// with `circular`, whose painted box ITSELF is the 44×44 control — feedback
// stays inside its own reserved layout slot (box-is-control mechanism).
//
// jsdom never applies :hover, but tamagui compiles style props into
// value-carrying atomic classes, so both the escape mechanism (negative
// margin atoms) and the paint channel are asserted through the atoms each
// node carries, with a positive control proving the detectors see them.
import { renderWithProviders } from '@repo/test-utils';
import { pressTargetStyle } from '@repo/theme';
import { cleanup, screen } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { View } from 'tamagui';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { FrappeDashboard } from './FrappeDashboard';
import { FrappeProvider } from './FrappeProvider';

/** The retired anatomy, re-created as the positive control for both detectors. */
const OldGrownPaintedFloor = () => (
  <View
    data-testid="old-anatomy"
    {...pressTargetStyle()}
    marginVertical={-8}
    marginHorizontal={-8}
    hoverStyle={{ backgroundColor: '$color4' }}
  />
);

// Grown-box escape mechanism: any negative margin atom on the press floor.
const negativeMarginAtom = /_m[trbl]--\d/u;
// Painted state feedback: any non-transparent hover/press background atom.
const paintedStateAtom = /_bg-0(?:hover|active)-(?!transparent)/u;

const renderStatic = () =>
  renderWithProviders(
    <FrappeProvider baseURL="https://dashboard.spec.test">
      <FrappeDashboard
        title="Sales"
        widgets={[]}
      />
    </FrappeProvider>,
  );

describe('FrappeDashboard refresh press floor (LC-54 amendment)', () => {
  beforeAll(async () => {
    // oxlint-disable-next-line import/no-named-as-default-member -- chained setup on the default instance is i18next's documented API
    await i18next.use(initReactI18next).init({
      lng: 'en',
      interpolation: { escapeValue: false },
      resources: { en: { translation: {} } },
    });
  });
  afterEach(cleanup);

  it('positive control: the detectors see the retired grown painted anatomy', () => {
    renderWithProviders(<OldGrownPaintedFloor />);
    const oldFloor = screen.getByTestId('old-anatomy');
    expect(oldFloor.className).toMatch(negativeMarginAtom);
    expect(oldFloor.className).toMatch(paintedStateAtom);
  });

  it('renders the refresh trigger as a role=button with its accessible name', () => {
    const { container } = renderStatic();
    const refresh = container.querySelector<HTMLElement>('[aria-label="Refresh"]');
    expect(refresh).not.toBeNull();
    expect(refresh?.getAttribute('role')).toBe('button');
  });

  it('the refresh floor is its own box — no grown-target negative outset', () => {
    const { container } = renderStatic();
    const refresh = container.querySelector<HTMLElement>('[aria-label="Refresh"]');
    // The house circular Button reserves the 44px floor as REAL layout
    // (box-is-control); the escape mechanism (negative margins pulling the
    // grown box over neighbors) must be gone.
    expect(refresh?.className).not.toMatch(negativeMarginAtom);
    expect(refresh?.className).toMatch(/_mih-44px/u);
    expect(refresh?.className).toMatch(/_miw-44px/u);
  });

  it("hover feedback rides the button's own in-slot box (house channel)", () => {
    const { container } = renderStatic();
    const refresh = container.querySelector<HTMLElement>('[aria-label="Refresh"]');
    // Paint on the OWN box is the sanctioned own-size mechanism — what the
    // amendment bans is paint on a box that escapes its slot. With the
    // outset gone (arm above), the house hover fill on this node is legal
    // and expected; its absence would mean the house Button stopped
    // owning the feedback.
    expect(refresh?.className).toMatch(paintedStateAtom);
    expect(refresh?.querySelector('svg')).not.toBeNull();
  });
});
