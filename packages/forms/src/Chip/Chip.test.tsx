import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CHIP_DISMISS_MIN_TARGET_FINE, Chip, chipDismissFloorOutset } from './index';

describe('Chip', () => {
  it('renders its label', () => {
    const result = renderWithProviders(<Chip>Tag</Chip>);
    expect(result.findTextElement('Tag')).toBeDefined();
  });

  // Axiom 6 HONEST STATE: disabled must live in the a11y tree.
  it('disabled chip exposes aria-disabled on its frame', () => {
    const result = renderWithProviders(<Chip disabled>Muted</Chip>);
    expect(result.container.querySelector("[aria-disabled='true']")).not.toBeNull();
  });

  it('enabled chip carries no aria-disabled', () => {
    const result = renderWithProviders(<Chip>Live</Chip>);
    expect(result.container.querySelector("[aria-disabled='true']")).toBeNull();
  });

  it('disabled chip removes the dismiss affordance', () => {
    const onDismiss = vi.fn();
    const result = renderWithProviders(
      <Chip disabled onDismiss={onDismiss}>
        Locked
      </Chip>,
    );
    expect(result.container.querySelector("[aria-label^='Remove']")).toBeNull();
  });

  // ── Dismiss ✕ regression pins (owner-reported, twice) ──────────────────

  // The dismiss label must name the chip so rows with many chips stay
  // navigable; plain "Remove" was undifferentiated.
  it('dismiss aria-label carries the chip label', () => {
    const result = renderWithProviders(<Chip onDismiss={() => {}}>engineering</Chip>);
    expect(result.container.querySelector("[aria-label='Remove engineering']")).not.toBeNull();
  });

  it('dismiss aria-label falls back to plain Remove for non-string children', () => {
    const result = renderWithProviders(
      <Chip onDismiss={() => {}}>
        <span>rich</span>
      </Chip>,
    );
    expect(result.container.querySelector("[aria-label='Remove']")).not.toBeNull();
  });

  it('dismiss end-cap is CIRCULAR-AT-FULL: the token below full, a circle at full', () => {
    const atoms = (borderRadius: 'none' | 'small' | 'large' | 'full') => {
      const result = renderWithProviders(
        <Preset overrides={{ borderRadius }}>
          <Chip onDismiss={() => {}}>Tag</Chip>
        </Preset>,
      );
      const button = result.container.querySelector("[aria-label='Remove Tag']") as HTMLElement;
      const ring = button.querySelector('.mp-chip-dismiss-ring') as HTMLElement;
      const found = [button, ring].map((el) =>
        String(el.className)
          .split(' ')
          .filter((c) => c.startsWith('_btlr-')),
      );
      result.unmount();
      return found;
    };
    expect(atoms('none')).toEqual([['_btlr-0px'], ['_btlr-0px']]);
    expect(atoms('small')).toEqual([['_btlr-5px'], ['_btlr-5px']]);
    expect(atoms('large')).toEqual([['_btlr-16px'], ['_btlr-16px']]);
    expect(atoms('full')).toEqual([['_btlr-1000px'], ['_btlr-1000px']]);
  });

  // COLOR: the ✕ glyph must receive a RESOLVED ink. Passing the raw token
  // string ("$color12") as the SVG fill attribute never resolved — invalid
  // CSS falls back to initial black, which measured 1.32:1 against the dark
  // chip tint (the "invisible ✕"). In-browser after-fix: 5.39:1 light /
  // 7.16:1 dark at the 0.7 rest opacity, 13:1 at full.
  it('dismiss glyph fill is a resolved color, never a raw token string', () => {
    const result = renderWithProviders(<Chip onDismiss={() => {}}>Tag</Chip>);
    const svg = result.container.querySelector("[aria-label='Remove Tag'] svg");
    expect(svg).not.toBeNull();
    const fill = svg?.getAttribute('fill');
    expect(fill).toBeTruthy();
    expect(fill?.startsWith('$')).toBe(false);
  });

  // GEOMETRY: the ≥24 fine-pointer floor is an absolute overlay that spills
  // symmetrically instead of growing the pill (the 24px minHeight box grew
  // $2 chips 20.5 → 26). Verified in-browser: gaps right/top/bottom equal at
  // every size token ($2 5.25, $3 6, $4 5.75, $5 7.75).
  it('floor outset expands sub-24 end caps symmetrically and leaves larger ones alone', () => {
    expect(CHIP_DISMISS_MIN_TARGET_FINE).toBe(24);
    expect(chipDismissFloorOutset(18.5)).toBeCloseTo(2.75);
    expect(chipDismissFloorOutset(22)).toBeCloseTo(1);
    expect(chipDismissFloorOutset(24)).toBe(0);
    expect(chipDismissFloorOutset(27.5)).toBe(0);
  });

  it('dismiss fires onDismiss on click', () => {
    const onDismiss = vi.fn();
    const result = renderWithProviders(<Chip onDismiss={onDismiss}>Tag</Chip>);
    const target = result.container.querySelector("[aria-label='Remove Tag']") as HTMLElement;
    expect(target).not.toBeNull();
    fireEvent.click(target);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dismiss fires onDismiss on Enter and Space', () => {
    const onDismiss = vi.fn();
    const result = renderWithProviders(<Chip onDismiss={onDismiss}>Tag</Chip>);
    const target = result.container.querySelector("[aria-label='Remove Tag']") as HTMLElement;
    fireEvent.keyDown(target, { key: 'Enter' });
    fireEvent.keyDown(target, { key: ' ' });
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  // Regression guard for the ring anatomy (the painted hover ring moved to a
  // glyph-scale inner node): activation must still reach the press target
  // through the inner ring, for pointer AND keyboard.
  it('dismiss fires onDismiss when the click lands on the inner ring', () => {
    const onDismiss = vi.fn();
    const result = renderWithProviders(<Chip onDismiss={onDismiss}>Tag</Chip>);
    const target = result.container.querySelector("[aria-label='Remove Tag']") as HTMLElement;
    expect(target).not.toBeNull();
    // The ring (and the glyph inside it) is where real pointers land.
    const inner = (target.firstElementChild ?? target) as HTMLElement;
    fireEvent.click(inner);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dismiss fires onDismiss on Enter', () => {
    const onDismiss = vi.fn();
    const result = renderWithProviders(<Chip onDismiss={onDismiss}>Tag</Chip>);
    const target = result.container.querySelector("[aria-label='Remove Tag']") as HTMLElement;
    fireEvent.keyDown(target, { key: 'Enter' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('display-only chip is not a tab stop', () => {
    const result = renderWithProviders(<Chip>Tag</Chip>);
    expect(result.container.querySelector('.mp-chip-body')).toBeNull();
    expect(result.container.querySelector("[aria-label='Remove']")).toBeNull();
  });

  it('dismissible chip has two tab stops (pill + glyph)', () => {
    const result = renderWithProviders(<Chip onDismiss={vi.fn()}>Tag</Chip>);
    const body = result.container.querySelector('.mp-chip-body') as HTMLElement;
    const dismiss = result.container.querySelector("[aria-label='Remove Tag']") as HTMLElement;
    expect(body).not.toBeNull();
    expect(body.tabIndex).toBe(0);
    expect(dismiss).not.toBeNull();
    expect(dismiss.tabIndex).toBe(0);
    expect(dismiss.querySelector('.mp-chip-dismiss-ring')).not.toBeNull();
  });

  it('unselected frame stays 1px under borderWidth none and large (chip-frame pin)', () => {
    for (const stop of ['none', 'large'] as const) {
      const result = renderWithProviders(
        <Preset overrides={{ borderWidth: stop }}>
          <Chip>Tag</Chip>
        </Preset>,
      );
      const frame = result.container.querySelector('[data-mp-chip]') as HTMLElement;
      expect(frame).not.toBeNull();
      expect(String(frame.className)).toMatch(/bw-1|borderWidth-1/);
      expect(String(frame.className)).not.toMatch(/bw-2|borderWidth-2/);
    }
  });

  it('selected chip marks fill, not a selection outline', () => {
    const result = renderWithProviders(
      <Chip selected variant="outline">
        On
      </Chip>,
    );
    const frame = result.container.querySelector('[data-mp-chip]') as HTMLElement;
    expect(frame.getAttribute('data-selected')).toBe('true');
    // Selection is fill (data-selected), not a thicker outline — Tamagui
    // zeros borderWidth via class, not inline style.
    expect(String(frame.className)).toMatch(/bw-0|borderWidth-0/);
  });

  it('selected chip renders a leading check when no icon is passed', () => {
    const result = renderWithProviders(<Chip selected>On</Chip>);
    const fill = result.container.querySelector('svg')?.getAttribute('fill');
    expect(fill).toBeTruthy();
    expect(fill?.startsWith('$')).toBe(false);
  });

  it('onPress fires from the chip body and does not fire dismiss', () => {
    const onPress = vi.fn();
    const onDismiss = vi.fn();
    const result = renderWithProviders(
      <Chip onPress={onPress} onDismiss={onDismiss}>
        Tag
      </Chip>,
    );
    fireEvent.click(result.container.querySelector('.mp-chip-body') as HTMLElement);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('Delete on the chip body dismisses (Material input-chip)', () => {
    const onDismiss = vi.fn();
    const result = renderWithProviders(<Chip onDismiss={onDismiss}>Tag</Chip>);
    fireEvent.keyDown(result.container.querySelector('.mp-chip-body') as HTMLElement, {
      key: 'Delete',
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('label click on a dismiss-only chip does not dismiss (parent press still works)', () => {
    const onDismiss = vi.fn();
    const result = renderWithProviders(<Chip onDismiss={onDismiss}>Tag</Chip>);
    fireEvent.click(result.container.querySelector('.mp-chip-body') as HTMLElement);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('stacked groupPosition is declared on the frame', () => {
    const result = renderWithProviders(
      <Chip groupPosition="first" groupOrientation="horizontal">
        A
      </Chip>,
    );
    const frame = result.container.querySelector('[data-mp-chip]') as HTMLElement;
    expect(frame.getAttribute('data-group-position')).toBe('first');
  });

  it('filled/outlined/ghost aliases resolve without throwing', () => {
    const result = renderWithProviders(
      <>
        <Chip variant="filled">A</Chip>
        <Chip variant="outlined">B</Chip>
        <Chip variant="ghost">C</Chip>
      </>,
    );
    expect(result.findTextElement('A')).toBeDefined();
    expect(result.findTextElement('B')).toBeDefined();
    expect(result.findTextElement('C')).toBeDefined();
  });
});
