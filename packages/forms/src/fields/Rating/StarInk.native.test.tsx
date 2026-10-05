import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it } from 'vitest';

import { StarInk as StarInkWeb } from './StarInk';
import { StarInk, inkMotionProps } from './StarInk.native';
import type { StarIconType } from './types';

/**
 * Native ink layer. The device arm is BLOCKED, so this is the native
 * evidence: `.native` specs are the standing substitute for a simulator
 * capture.
 *
 * It cannot prove the RN driver's frame output. What it CAN prove is the
 * property that made the star dead: the ink change has to land on a key the
 * driver animates, driven by the knob token, with silence at `none`.
 */

const captured: Array<{ size: number; weight: string; color: string; keys: string[] }> = [];

/** Records EVERY prop the contract hands the glyph, so an added one shows up. */
const SpyStarIcon: StarIconType = (props) => {
  captured.push({ ...props, keys: Object.keys(props).sort() });
  return <span data-testid="glyph" data-weight={props.weight} data-color={props.color} />;
};

function renderInk(overrides: Partial<Parameters<typeof StarInk>[0]> = {}) {
  captured.length = 0;
  return renderWithProviders(
    <StarInk
      StarIcon={SpyStarIcon}
      size={24}
      filled={false}
      filledColor="#634FC4"
      emptyColor="#D3D1D6"
      transition="quick"
      {...overrides}
    />,
  );
}

const layer = (container: HTMLElement, which: 'empty' | 'filled') =>
  container.querySelector(`[data-rating-ink='${which}']`) as HTMLElement | null;

/** Tamagui emits opacity as the atomic class `_o-<value>`, not inline style. */
function opacityOf(container: HTMLElement, which: 'empty' | 'filled'): number | null {
  const match = layer(container, which)?.className.match(/(?:^|\s)_o-([\d.]+)(?:\s|$)/);
  return match ? Number(match[1]) : null;
}

describe('StarInk (native) motion props', () => {
  // Axiom 4: the token IS the knob's. A hardcoded duration, or a token not
  // scoped to opacity, fails here.
  it('scopes the knob token to opacity', () => {
    expect(inkMotionProps('quick')).toEqual({ transition: { opacity: 'quick' } });
    // A different knob must produce a different token — pinning only "quick"
    // would pass against a hardcoded default.
    expect(inkMotionProps('bouncy')).toEqual({ transition: { opacity: 'bouncy' } });
  });

  // Axiom 3. The positive control is the assertion above: the same
  // helper demonstrably yields a transition when a token exists, so the empty
  // object here is a measured absence rather than a probe that sees nothing.
  it('emits NO transition at animation=none / reduced motion', () => {
    expect(inkMotionProps(undefined)).toEqual({});
  });

  // The web fix deliberately dropped `|| "quick"`; native must not reintroduce
  // it. `none` resolving to a token is exactly the regression this catches.
  it('never substitutes a default token for a missing knob', () => {
    expect(inkMotionProps(undefined)).not.toHaveProperty('transition');
  });
});

describe('StarInk (native) layer stack', () => {
  // The defect: one glyph swapped in place, so the ink could only jump. Both
  // states must be MOUNTED for opacity to have anything to cross-fade.
  it('mounts both glyph states so the ink rides opacity', () => {
    const { container } = renderInk({ filled: false });
    expect(layer(container, 'empty')).not.toBeNull();
    expect(layer(container, 'filled')).not.toBeNull();
    expect(captured.map((c) => c.weight).sort()).toEqual(['fill', 'regular']);
  });

  it('cross-fades opacity with the filled state', () => {
    const empty = renderInk({ filled: false });
    expect(opacityOf(empty.container, 'empty')).toBe(1);
    expect(opacityOf(empty.container, 'filled')).toBe(0);

    const full = renderInk({ filled: true });
    expect(opacityOf(full.container, 'empty')).toBe(0);
    expect(opacityOf(full.container, 'filled')).toBe(1);
  });

  // Settled-state parity: exactly one layer is visible at rest, so a
  // filled star is the fill glyph alone and an empty star the outline alone —
  // the same pixels the pre-fix single-glyph render produced. A cross-fade
  // that left both layers partly visible at rest would dim every star.
  it('shows exactly one layer at rest in both states', () => {
    for (const filled of [false, true]) {
      const { container } = renderInk({ filled });
      const opacities = (['empty', 'filled'] as const).map((which) => opacityOf(container, which));
      expect(opacities.filter((o) => o === 1)).toHaveLength(1);
      expect(opacities.filter((o) => o === 0)).toHaveLength(1);
    }
  });

  // The prop has to survive onto the element, not just out of the helper: the
  // transition must name `opacity` (never `all`, which would drag the layout
  // props animating alongside it).
  it('arms an opacity-scoped transition on both layers', () => {
    const { container } = renderInk({ transition: 'quick' });
    for (const which of ['empty', 'filled'] as const) {
      const declared = layer(container, which)?.style.transition ?? '';
      expect(declared).toContain('opacity');
      expect(declared).not.toContain('all');
    }
  });

  // Axiom 4 end to end: swapping the knob must change the motion the element
  // declares. Identical strings here would mean a hardcoded duration.
  it('changes the declared motion when the knob changes', () => {
    const quick = layer(renderInk({ transition: 'quick' }).container, 'filled')?.style.transition;
    const lazy = layer(renderInk({ transition: 'lazy' }).container, 'filled')?.style.transition;
    expect(quick).toBeTruthy();
    expect(lazy).toBeTruthy();
    expect(lazy).not.toBe(quick);
  });

  // Axiom 3 at the element. Positive control: the two tests above show this
  // same probe reading a real transition off these same layers, so an empty
  // string here is a measured silence, not a blind spot.
  it('declares no transition at all when the knob is none', () => {
    const { container } = renderInk({ transition: undefined });
    for (const which of ['empty', 'filled'] as const) {
      expect(layer(container, which)?.style.transition ?? '').toBe('');
    }
  });

  // The whole point of the layer-stack route: the icon never learns about it.
  it('hands starIcon the three contract props and nothing else', () => {
    renderInk({ filled: true });
    expect(captured).toHaveLength(2);
    for (const props of captured) {
      expect(props.keys).toEqual(['color', 'size', 'weight']);
    }
    expect(captured.find((c) => c.weight === 'fill')?.color).toBe('#634FC4');
    expect(captured.find((c) => c.weight === 'regular')?.color).toBe('#D3D1D6');
  });
});

describe('StarInk web/native parity', () => {
  // Axiom 13 ONE BODY: same contract, same props, two renderers. The web half
  // must stay the bare glyph — the descendant stylesheet in index.tsx arms it,
  // and an extra wrapper node would sit between the ink class and the svg.
  it('web renders the single glyph the stylesheet targets', () => {
    captured.length = 0;
    const { container } = renderWithProviders(
      <StarInkWeb
        StarIcon={SpyStarIcon}
        size={24}
        filled
        filledColor="#634FC4"
        emptyColor="#D3D1D6"
        transition="quick"
      />,
    );
    expect(captured).toHaveLength(1);
    expect(captured[0]?.weight).toBe('fill');
    expect(captured[0]?.color).toBe('#634FC4');
    expect(captured[0]?.keys).toEqual(['color', 'size', 'weight']);
    // No ink layers on web: the cascade does that job there.
    expect(container.querySelector('[data-rating-ink]')).toBeNull();
  });
});
