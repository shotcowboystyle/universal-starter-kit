/**
 * Task 1.9, the rendered half.
 *
 * Two claims, both from the plan:
 *  - the disc is a circle at every radius stop, `none` included (§11: the
 *    borderRadius knob is IGNORED on this part, because a square port reads as
 *    a resize grip and the circle is the part's identity);
 *  - the emitted `::after` rule carries `pointer-events: all`.
 *
 * The second is read off the SHEET, not the DOM, and deliberately so: jsdom and
 * happy-dom cannot resolve a pseudo-element, so `getComputedStyle(el,
 * "::after")` returns an empty declaration and a spec written against it would
 * pass whatever the sheet said. Design §7.1 says as much — "reading CSS is not
 * proof" — and hands the real proof to the device arm in task 3.4.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderWithProviders } from '@repo/test-utils';
import { MIN_PRESS_TARGET, Preset, Surface } from '@repo/theme';
import type { Knobs } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { topLevelSelectors } from '../../tests/styles';
import { getHandlePosition, Position, ReactFlowProvider } from '../react-flow/xy';
import type { HandleBounds, InternalNodeBase } from '../react-flow/xy';

import { GraphPort } from './GraphPort';
import {
  FINE_PORT_HIT_MIN,
  paintedPortSize,
  portGeometry,
  portHitSize,
  portRegionInset,
  portRegionInsetAtZoom,
  portRegionScreenSize,
} from './handleGeometry';
import type { PortRect } from './handleGeometry';
import type { GraphNodeSizeKnob, GraphPortSide } from './nodeMeasure';

const radiusStops = ['none', 'small', 'medium', 'large', 'full'] as const satisfies readonly Knobs['borderRadius'][];
const sizes = ['small', 'medium', 'large'] as const satisfies readonly GraphNodeSizeKnob[];

const graphCss = readFileSync(join(import.meta.dirname, '../../css/graph.css'), 'utf-8');

const afterRule = /\.mp-graph-port::after\s*\{([^}]*)\}/.exec(graphCss);
const discRule = /\.mp-graph-port\s*\{([^}]*)\}/.exec(graphCss);

/**
 * `Surface` is the size AUTHORITY, not the size knob: `applySurfaceToKnobs`
 * replaces `knobs.size` outright when no explicit `size` option is passed to
 * `useResolvedKnobs` (LC-68). So the size stops are driven through the Surface
 * here — setting `overrides={{ size }}` under a fixed Surface is a no-op, and a
 * spec that did it would be testing nothing while looking like it tested a lot.
 */
function renderPort(
  props: { side: GraphPortSide; coarsePointer?: boolean; portSpacingPx?: number },
  overrides?: Partial<Knobs>,
  surfaceSize: GraphNodeSizeKnob = 'medium',
) {
  return renderWithProviders(
    <Preset
      cascade={false}
      overrides={overrides}>
      <Surface
        size={surfaceSize}
        density="comfortable">
        <ReactFlowProvider>
          <GraphPort
            id="p1"
            direction="out"
            {...props}
          />
        </ReactFlowProvider>
      </Surface>
    </Preset>,
  );
}

function discOf(container: HTMLElement): HTMLElement {
  const el = container.querySelector('.mp-graph-port');
  if (!el) {
    throw new Error('GraphPort did not render a handle');
  }
  return el as HTMLElement;
}

afterEach(cleanup);

describe('the disc is a circle at every radius stop, `none` included', () => {
  it.each(radiusStops)('stays a circle at borderRadius: %s', (borderRadius) => {
    const { container } = renderPort({ side: 'right' }, { borderRadius });
    expect(getComputedStyle(discOf(container)).borderRadius).toBe('50%');
  });

  it('ignores the knob rather than merely happening to agree with it', () => {
    // If the part HONOURED the knob, `none` and `full` would differ. They must
    // not: an identity immunity means the knob never reaches the part at all.
    const seen = new Set<string>();
    for (const borderRadius of radiusStops) {
      const { container } = renderPort({ side: 'right' }, { borderRadius });
      seen.add(getComputedStyle(discOf(container)).borderRadius);
      cleanup();
    }
    expect(seen).toStrictEqual(new Set(['50%']));
  });

  it('stays a circle at every size stop too — width and height always match', () => {
    for (const size of sizes) {
      const { container } = renderPort({ side: 'right' }, undefined, size);
      const style = getComputedStyle(discOf(container));
      expect(style.width).toBe(style.height);
      expect(style.width).toBe(`${paintedPortSize(size)}px`);
      cleanup();
    }
  });

  it('casts no shadow at any elevation stop — §11 GraphPort: ignore', () => {
    for (const elevation of ['none', 'small', 'medium', 'large'] as const) {
      const { container } = renderPort({ side: 'right' }, { elevation });
      expect(getComputedStyle(discOf(container)).boxShadow).toBe('none');
      cleanup();
    }
  });
});

describe('the painted dot and the hit region are two different numbers', () => {
  it('publishes both, and the painted one is never the press floor', () => {
    for (const size of sizes) {
      const { container } = renderPort({ side: 'right', coarsePointer: true }, undefined, size);
      const disc = discOf(container);
      expect(disc.dataset.graphPortPainted).toBe(String(paintedPortSize(size)));
      expect(disc.dataset.graphPortHit).toBe(String(portHitSize({ size, coarsePointer: true })));
      expect(disc.dataset.graphPortPainted).not.toBe('44');
      cleanup();
    }
  });

  it('reports the zoom-1 inset, which grows the region OUTWARD, ring included', () => {
    const { container } = renderPort({ side: 'right', coarsePointer: true });
    const disc = discOf(container);
    // An ATTRIBUTE, not a custom property, since milestone 6: the sheet does
    // this arithmetic itself because it depends on the live viewport zoom, and
    // a var nothing read would be drift. The number is still published, because
    // the `HitTarget` story prints it and this spec checks it.
    const inset = disc.dataset.graphPortInset;
    const borderWidthPx = Number.parseFloat(getComputedStyle(disc).borderTopWidth);
    expect(borderWidthPx).toBeGreaterThan(0);
    expect(inset).toBe(String(portRegionInset({ size: 'medium', coarsePointer: true, borderWidthPx })));
    expect(Number.parseFloat(inset!)).toBeLessThan(0);
    // The region the browser will lay out: padding box, grown by the inset on
    // each side. It must land ON the press floor, not two pixels under it.
    const paddingBox = paintedPortSize('medium') - 2 * borderWidthPx;
    expect(paddingBox - 2 * Number.parseFloat(inset!)).toBe(portHitSize({ size: 'medium', coarsePointer: true }));
  });

  it('publishes the three INPUTS the sheet needs, including the ring', () => {
    const { container } = renderPort({ side: 'right', coarsePointer: true });
    const disc = discOf(container);
    const borderWidthPx = Number.parseFloat(getComputedStyle(disc).borderTopWidth);
    expect(disc.style.getPropertyValue('--mpo-graph-handle-size')).toBe(`${paintedPortSize('medium')}px`);
    expect(disc.style.getPropertyValue('--mpo-graph-handle-hit')).toBe(
      `${portHitSize({ size: 'medium', coarsePointer: true })}px`,
    );
    expect(disc.style.getPropertyValue('--mpo-graph-handle-border')).toBe(`${borderWidthPx}px`);
    // Gone on purpose. The sheet computes the inset from the three above plus
    // the live zoom, so an answer published here could only be the wrong one at
    // every zoom but 1.
    expect(disc.style.getPropertyValue('--mpo-graph-handle-inset')).toBe('');
  });

  it("honours the borderWidth knob on the dot's ring", () => {
    const thin = renderPort({ side: 'right' }, { borderWidth: 'small' });
    const thinWidth = getComputedStyle(discOf(thin.container)).borderTopWidth;
    cleanup();
    const thick = renderPort({ side: 'right' }, { borderWidth: 'large' });
    const thickWidth = getComputedStyle(discOf(thick.container)).borderTopWidth;
    expect(Number.parseFloat(thickWidth)).toBeGreaterThan(Number.parseFloat(thinWidth));
  });
});

describe('the emitted ::after rule', () => {
  it('carries pointer-events: all', () => {
    expect(afterRule, 'css/graph.css has no .mp-graph-port::after rule').not.toBeNull();
    expect(afterRule![1]).toMatch(/pointer-events:\s*all\s*;/);
  });

  it('is a pseudo-element region, not element growth (§7.1 H2)', () => {
    expect(afterRule![1]).toMatch(/content:\s*""\s*;/);
    expect(afterRule![1]).toMatch(/position:\s*absolute\s*;/);
    // H7: the inset is COMPUTED from the three inputs and the live zoom.
    expect(afterRule![1]).toMatch(/inset:\s*calc\(/);
    expect(afterRule![1]).toMatch(/border-radius:\s*50%\s*;/);
  });

  it('scopes every rule under .mp-graph so importing the sheet restyles nothing else', () => {
    const selectors = topLevelSelectors(graphCss);
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector).toMatch(/^\.mp-graph\b/);
    }
  });

  it('makes the dot its own containing block, so the region cannot resolve elsewhere', () => {
    // Measured in Chrome: without this, a port outside a mounted canvas
    // computes `position: static`, the ::after resolves against the nearest
    // positioned ancestor, and a 44 px region renders as 80 px.
    expect(discRule![1]).toMatch(/position:\s*absolute\s*;/);
  });

  it('paints the disc from the same custom properties the component publishes', () => {
    expect(discRule).not.toBeNull();
    expect(discRule![1]).toMatch(/width:\s*var\(--mpo-graph-handle-size\)\s*;/);
    expect(discRule![1]).toMatch(/height:\s*var\(--mpo-graph-handle-size\)\s*;/);
  });
});

/**
 * THE endpoint test (task 3.4, design §7.1 H2).
 *
 * Every other assertion about the 44pt target passes under the BROKEN
 * mechanism too. The painted centre is invariant under element growth; so is
 * the `pointer-events: all` rule; so is the crowding cap. What element growth
 * changes, and nothing else here would notice, is the point React Flow draws
 * an edge TO — because `getEdgePosition` calls `getHandlePosition` with
 * `center` defaulting to false (`positions.ts:61-62`, `:99-125`), so a Left
 * handle's endpoint is the box's OUTER edge, not its middle.
 *
 * This calls React Flow's own `getHandlePosition`, not a local restatement of
 * it. A reimplementation would prove that our arithmetic agrees with our
 * arithmetic.
 */

const nodeAt = (position: { x: number; y: number }): InternalNodeBase =>
  ({
    id: 'n1',
    position,
    data: {},
    // The two fields `getHandlePosition` actually reads. A full InternalNode
    // carries a dozen more; constructing them would be theatre.
    measured: { width: 190, height: 72 },
    internals: { positionAbsolute: position },
  }) as unknown as InternalNodeBase;

const handleFrom = (rect: PortRect, position: Position): HandleBounds =>
  ({
    id: 'p1',
    type: 'source',
    nodeId: 'n1',
    position,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  }) as unknown as HandleBounds;

const nodeOrigin = { x: 300, y: 120 };
const nodeBox = { nodeWidth: 190, nodeHeight: 72 };

function endpointOf(rect: PortRect, side: Position = Position.Left) {
  return getHandlePosition(nodeAt(nodeOrigin), handleFrom(rect, side), side);
}

describe('a 44pt hit region leaves the rendered edge endpoint where the 8px dot put it', () => {
  const small = portGeometry({ painted: 8, hit: 8, side: 'left', offset: 36, ...nodeBox });
  const big = portGeometry({ painted: 8, hit: 44, side: 'left', offset: 36, ...nodeBox });

  it('returns the IDENTICAL getHandlePosition point at hit 8 and at hit 44', () => {
    expect(endpointOf(big.box)).toEqual(endpointOf(small.box));
  });

  it('really did change the hit region, so the invariance above is not vacuous', () => {
    expect(small.region.width).toBe(8);
    expect(big.region.width).toBe(44);
    expect(big.region).not.toEqual(small.region);
  });

  it('would have moved the endpoint 18 units under element growth — the control', () => {
    // The mechanism H2 refuses: grow the ELEMENT to 44 and the same call
    // returns a different point. Without this the test above could pass on a
    // function that ignored `hit` for both rectangles, which is a different
    // bug wearing the same green.
    const grown = portGeometry({ painted: 44, hit: 44, side: 'left', offset: 36, ...nodeBox });
    const moved = endpointOf(grown.box);
    expect(moved).not.toEqual(endpointOf(small.box));
    expect(endpointOf(small.box).x - moved.x).toBe(18);
  });

  it('holds on the right edge too — the other side an LR graph uses', () => {
    const smallRight = portGeometry({ painted: 8, hit: 8, side: 'right', offset: 36, ...nodeBox });
    const bigRight = portGeometry({ painted: 8, hit: 44, side: 'right', offset: 36, ...nodeBox });
    expect(endpointOf(bigRight.box, Position.Right)).toEqual(endpointOf(smallRight.box, Position.Right));
  });

  it('holds at every painted stop and both pointer kinds', () => {
    for (const size of sizes) {
      const painted = paintedPortSize(size);
      const fine = portGeometry({
        painted,
        hit: portHitSize({ size, coarsePointer: false }),
        side: 'left',
        offset: 36,
        ...nodeBox,
      });
      const coarse = portGeometry({
        painted,
        hit: portHitSize({ size, coarsePointer: true }),
        side: 'left',
        offset: 36,
        ...nodeBox,
      });
      expect(endpointOf(coarse.box)).toEqual(endpointOf(fine.box));
      expect(coarse.region.width).toBe(44);
    }
  });
});

describe('the resolved --mpo-graph-handle-hit', () => {
  it('is 44 on a coarse pointer at every size stop', () => {
    for (const size of sizes) {
      const { container } = renderPort({ side: 'right', coarsePointer: true }, undefined, size);
      expect(discOf(container).style.getPropertyValue('--mpo-graph-handle-hit')).toBe(`${MIN_PRESS_TARGET}px`);
      cleanup();
    }
  });

  it('is max(painted, 24) on a fine pointer at every size stop', () => {
    for (const size of sizes) {
      const { container } = renderPort({ side: 'right', coarsePointer: false }, undefined, size);
      expect(discOf(container).style.getPropertyValue('--mpo-graph-handle-hit')).toBe(
        `${Math.max(paintedPortSize(size), FINE_PORT_HIT_MIN)}px`,
      );
      cleanup();
    }
  });

  it('holds the crowding cap: a pitch tighter than the floor wins', () => {
    const { container } = renderPort({ side: 'right', coarsePointer: true, portSpacingPx: 30 });
    expect(discOf(container).style.getPropertyValue('--mpo-graph-handle-hit')).toBe('30px');
    expect(discOf(container).dataset.graphPortHit).toBe('30');
  });

  it('never lets the cap shrink the region below the dot the user can see', () => {
    const { container } = renderPort({ side: 'right', coarsePointer: true, portSpacingPx: 4 });
    const disc = discOf(container);
    expect(disc.style.getPropertyValue('--mpo-graph-handle-hit')).toBe(`${paintedPortSize('medium')}px`);
  });
});

/**
 * H7 (milestone 6): the rule text and `portRegionInsetAtZoom` are the SAME
 * arithmetic, and the region measures 44 screen px at every zoom.
 *
 * jsdom and happy-dom cannot resolve a pseudo-element at all —
 * `getComputedStyle(el, "::after")` returns an empty declaration — so this
 * cannot be measured here and is not pretended to be. What CAN be checked
 * without a browser is that the two expressions agree, which is the half that
 * silently rots. The rendered-width half is a browser check: see
 * `tests/port-hit-zoom.spec.mjs`, driven against the built Storybook.
 */
describe('the 44pt region at zoom (§7.1 H7)', () => {
  /** The `inset: calc(...)` expression, evaluated against real numbers. */
  function insetFromRuleText(inputs: { size: number; hit: number; border: number; zoom: number }): number {
    const text = afterRule![1];
    const match = /inset:\s*calc\(([\s\S]*?)\);/.exec(text);
    expect(match, 'the ::after rule has no `inset: calc(...)`').not.toBeNull();
    const expression = match![1]
      .replaceAll('var(--mpo-graph-handle-size)', String(inputs.size))
      .replaceAll('var(--mpo-graph-handle-hit)', String(inputs.hit))
      .replaceAll(/var\(--mpo-graph-handle-border,\s*0px\)/g, String(inputs.border))
      .replaceAll(/var\(--mpo-graph-zoom,\s*1\)/g, String(inputs.zoom))
      .replaceAll('px', '');
    // The rule text is arithmetic over four substituted numbers and nothing
    // else. Asserted BEFORE it is evaluated, and asserted as a whitelist rather
    // than a blacklist: what has to be true is that nothing but digits, the
    // four operators, parentheses and whitespace survived the substitutions —
    // a `var(--something-new)` that no branch above replaced would otherwise
    // reach `new Function` as a bare identifier.
    expect(expression).toMatch(/^[\d\s+\-*/().]+$/);
    // oxlint-disable-next-line no-new-func -- four digits and four operators
    return Number(new Function(`return (${expression});`)());
  }

  it('evaluates to portRegionInsetAtZoom at 1, 0.4 and 2', () => {
    for (const zoom of [1, 0.4, 2]) {
      for (const size of sizes) {
        for (const coarsePointer of [true, false]) {
          const border = 1;
          const expected = portRegionInsetAtZoom({
            size,
            coarsePointer,
            borderWidthPx: border,
            zoom,
          });
          const fromCss = insetFromRuleText({
            size: paintedPortSize(size),
            hit: portHitSize({ size, coarsePointer }),
            border,
            zoom,
          });
          expect(fromCss).toBeCloseTo(expected, 10);
        }
      }
    }
  });

  it('makes the region the SAME number of screen px at every zoom', () => {
    // The claim MPO-212's 3.4 is about. Before milestone 6 this was
    // `hit * zoom` — 16.6 px at the 0.377 the iPhone 16e was actually at.
    for (const zoom of [0.377, 0.4, 1, 2]) {
      expect(portRegionScreenSize({ size: 'small', coarsePointer: true, borderWidthPx: 1, zoom })).toBeCloseTo(
        portHitSize({ size: 'small', coarsePointer: true }),
        10,
      );
    }
  });

  it('is unchanged at zoom 1, so the desktop canvas keeps the number it had', () => {
    for (const size of sizes) {
      expect(portRegionInsetAtZoom({ size, coarsePointer: true, borderWidthPx: 1, zoom: 1 })).toBe(
        portRegionInset({ size, coarsePointer: true, borderWidthPx: 1 }),
      );
    }
  });
});
