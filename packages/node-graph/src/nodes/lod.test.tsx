/**
 * Task 3.8. The level-of-detail crossing, and the invariant that makes it safe.
 *
 * Two claims, and the second is the one that bites.
 *
 * `lodForZoom` crosses at `overviewZoom` and nowhere else — swept over a grid
 * rather than sampled at three points, because "nowhere else" is a statement
 * about every zoom, and a three-point test would pass on a function with a
 * second threshold hidden at 1.5.
 *
 * The rendered height in `detail` equals the rendered height in `overview` for
 * the same node and the same knobs. React Flow 12 installs a per-node
 * `ResizeObserver`; a height-changing LOD would re-measure every node on every
 * zoom tick and move every attached edge endpoint with it (design §5).
 *
 * HOW that height is asserted, honestly: happy-dom lays nothing out, so
 * `getBoundingClientRect()` is zeros here and a spec written against it would
 * pass whatever the component did — the same limit `NodeGraphWeb.test.tsx`
 * states about culling. What IS observable is the CAUSE. A box changes height
 * because something unmounted or because a declared height changed, so this
 * asserts the element tree is identical across modes and that the declared
 * width and min-height are the same numbers. The rendered pixels are the
 * story's arm, on `NodeGraph/Overview` in Chrome, with edge endpoints read
 * before and after the crossover.
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset, Surface } from '@repo/theme';
import type { Knobs } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { declarationFor } from '../../tests/styles';
import { ReactFlowProvider } from '../react-flow/xy';

import { GraphNode } from './GraphNode';
import { GraphPort } from './GraphPort';
import { defaultOverviewZoom, detailOpacity, isOverview, lodForZoom } from './lod';
import type { GraphRenderMode } from './lod';
import type { GraphNodePort, GraphNodeSizeKnob } from './node-measure';
import { graphNodeMinHeight, graphNodeWidth, portSpacing } from './node-measure';
import { OverviewNode } from './overview-node';

const ports: GraphNodePort[] = [
  { id: 'in', side: 'left', direction: 'in', label: 'rows' },
  { id: 'ok', side: 'right', direction: 'out', label: 'ok' },
  { id: 'err', side: 'right', direction: 'out', label: 'error' },
];

const sizes = ['small', 'medium', 'large'] as const satisfies readonly GraphNodeSizeKnob[];

/** Every transition in a fine sweep, as the zoom where the mode flipped. */
const transitions = (overviewZoom: number, step = 0.001): number[] => {
  const found: number[] = [];
  let previous = lodForZoom(0.001, overviewZoom);
  for (let zoom = 0.001; zoom <= 4; zoom += step) {
    const mode = lodForZoom(zoom, overviewZoom);
    if (mode !== previous) {
      found.push(zoom);
    }
    previous = mode;
  }
  return found;
};

// ── the height invariant ─────────────────────────────────────────────────────

const renderNode = (renderMode: GraphRenderMode, overrides?: Partial<Knobs>, size: GraphNodeSizeKnob = 'medium') =>
  renderWithProviders(
    <Preset
      cascade={false}
      overrides={overrides}>
      <Surface
        size={size}
        density="comfortable">
        <ReactFlowProvider>
          <GraphNode
            id="n1"
            title="Validate"
            subtitle="Three in, three out"
            ports={ports}
            renderMode={renderMode}
            renderPort={(port) => (
              <GraphPort
                id={port.id}
                side={port.side}
                direction={port.direction}
              />
            )}>
            <div data-graph-node-body-extra="">extra body content</div>
          </GraphNode>
        </ReactFlowProvider>
      </Surface>
    </Preset>,
  );

const frameOf = (container: HTMLElement): HTMLElement => {
  const el = container.querySelector('[data-graph-node]');
  if (!el) {
    throw new Error('GraphNode did not render a frame');
  }
  return el as HTMLElement;
};

/** Every element in the subtree, as `tag + the data-* attributes it carries`. */
const elementTreeOf = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('*')].map((el) => {
    const data = [...el.attributes]
      .filter((attr) => attr.name.startsWith('data-'))
      .map((attr) => `${attr.name}=${attr.value}`)
      .toSorted()
      .join(',');
    return `${el.tagName.toLowerCase()}[${data}]`;
  });

const renderOverviewNode = (size: GraphNodeSizeKnob) =>
  renderWithProviders(
    <Preset cascade={false}>
      <Surface
        size={size}
        density="comfortable">
        <ReactFlowProvider>
          <OverviewNode
            id="n1"
            ports={ports}
          />
        </ReactFlowProvider>
      </Surface>
    </Preset>,
  );

describe('level of detail', () => {
  afterEach(cleanup);

  // ── lodForZoom ───────────────────────────────────────────────────────────────

  describe('lodForZoom crosses at overviewZoom and nowhere else', () => {
    it('has exactly one transition across a sweep from 0.001 to 4', () => {
      const found = transitions(defaultOverviewZoom);
      expect(found).toHaveLength(1);
      expect(found[0]).toBeGreaterThanOrEqual(defaultOverviewZoom);
      expect(found[0]).toBeLessThan(defaultOverviewZoom + 0.002);
    });

    it('moves that single transition when overviewZoom moves', () => {
      for (const overviewZoom of [0.1, 0.25, 0.35, 0.8, 1.5]) {
        const found = transitions(overviewZoom);
        expect(found, `overviewZoom ${overviewZoom}`).toHaveLength(1);
        expect(found[0]).toBeGreaterThanOrEqual(overviewZoom);
        expect(found[0]).toBeLessThan(overviewZoom + 0.002);
      }
    });

    it('puts the threshold itself in detail, and everything under it in overview', () => {
      expect(lodForZoom(defaultOverviewZoom)).toBe('detail');
      expect(lodForZoom(defaultOverviewZoom - 0.0001)).toBe('overview');
      expect(lodForZoom(defaultOverviewZoom + 0.0001)).toBe('detail');
    });

    it('is monotone: once detail, always detail as zoom rises', () => {
      let seenDetail = false;
      const reappeared: number[] = [];
      for (let zoom = 0.01; zoom <= 4; zoom += 0.01) {
        if (lodForZoom(zoom) === 'detail') {
          seenDetail = true;
        } else if (seenDetail) {
          reappeared.push(zoom);
        }
      }
      expect(reappeared, 'overview reappeared after detail at these zooms').toStrictEqual([]);
    });

    it('renders the full body rather than a grey box when the zoom is not a number', () => {
      // Reachable from a store mid-initialization. A screen of grey rectangles
      // at unknown zoom gives the user no way back; a full body always does.
      expect(lodForZoom(Number.NaN)).toBe('detail');
      expect(lodForZoom(Number.POSITIVE_INFINITY)).toBe('detail');
    });

    it('agrees with the canvas default, which is the same constant and not a copy', async () => {
      const { graphCanvasDefaults } = await import('../react-flow/NodeGraphWeb');
      expect(graphCanvasDefaults.overviewZoom).toBe(defaultOverviewZoom);
    });

    it("sits above the canvas's minZoom, or the crossing is unreachable", async () => {
      // React Flow's OWN default minZoom is 0.5 — above overviewZoom. Measured in
      // Chrome on NodeGraph/Overview at 500 nodes before this was set: the
      // zoom-out control bottomed out at 0.5, fitView clamped there and showed 50
      // of 500 nodes, and overview mode never fired once. Every spec in this file
      // was green throughout. A threshold under a floor the user cannot cross is
      // dead code that tests clean, so the relationship is pinned here.
      const { graphCanvasDefaults } = await import('../react-flow/NodeGraphWeb');
      expect(graphCanvasDefaults.minZoom).toBeLessThan(graphCanvasDefaults.overviewZoom);
      expect(graphCanvasDefaults.minZoom).toBeLessThan(0.5);
      expect(lodForZoom(graphCanvasDefaults.minZoom, graphCanvasDefaults.overviewZoom)).toBe('overview');
    });
  });

  describe('the fade helpers say the same thing the mode does', () => {
    it('is zero in overview and one in detail — never display:none, never an unmount', () => {
      expect(detailOpacity('overview')).toBe(0);
      expect(detailOpacity('detail')).toBe(1);
      expect(isOverview('overview')).toBe(true);
      expect(isOverview('detail')).toBe(false);
    });
  });

  describe('the box is the same box in both modes', () => {
    it('declares the same width and min-height at every size stop', () => {
      for (const size of sizes) {
        const detail = renderNode('detail', undefined, size);
        const detailBox = {
          width: declarationFor(frameOf(detail.container), 'width'),
          minHeight: declarationFor(frameOf(detail.container), 'min-height'),
        };
        cleanup();
        const overview = renderNode('overview', undefined, size);
        const overviewBox = {
          width: declarationFor(frameOf(overview.container), 'width'),
          minHeight: declarationFor(frameOf(overview.container), 'min-height'),
        };
        cleanup();
        expect(overviewBox, `size ${size}`).toStrictEqual(detailBox);
        // …and the numbers are the recipe's, not both-empty-so-equal.
        expect(detailBox.width).toBe(`${graphNodeWidth({ size })}px`);
        expect(detailBox.minHeight).toBe(
          `${graphNodeMinHeight({ size, ports, portSpacingPx: portSpacing({ coarsePointer: false }) })}px`,
        );
      }
    });

    it('renders the IDENTICAL element tree — nothing unmounts on the way to overview', () => {
      const detail = renderNode('detail');
      const detailTree = elementTreeOf(detail.container);
      cleanup();
      const overview = renderNode('overview');
      const overviewTree = elementTreeOf(overview.container);
      cleanup();
      // The render-mode attribute is the one legitimate difference.
      expect(overviewTree.map((entry) => entry.replace('overview', 'MODE'))).toStrictEqual(
        detailTree.map((entry) => entry.replace('detail', 'MODE')),
      );
      expect(detailTree.length).toBeGreaterThan(5);
    });

    it('keeps the subtitle, the ports and the children mounted in overview', () => {
      const { container } = renderNode('overview');
      expect(container.querySelector('[data-graph-node-ports]')).not.toBeNull();
      expect(container.querySelector('[data-graph-node-children]')).not.toBeNull();
      expect(container.querySelector('[data-graph-node-body-extra]')).not.toBeNull();
      expect(container.textContent).toContain('Three in, three out');
      // Three real ports, still measurable, still holding the height floor open.
      expect(container.querySelectorAll('.mp-graph-port')).toHaveLength(ports.length);
    });

    it('fades them with opacity rather than hiding them', () => {
      const { container } = renderNode('overview');
      const portsStack = container.querySelector('[data-graph-node-ports]') as HTMLElement;
      const childrenStack = container.querySelector('[data-graph-node-children]') as HTMLElement;
      for (const el of [portsStack, childrenStack]) {
        expect(declarationFor(el, 'opacity')).toBe('0');
        // `display: none` would collapse the box, which is the whole failure.
        expect(declarationFor(el, 'display')).not.toBe('none');
      }
    });

    it('holds the same box across a knob flip, in both modes', () => {
      for (const borderWidth of ['small', 'large'] as const) {
        const detail = renderNode('detail', { borderWidth });
        const detailBox = declarationFor(frameOf(detail.container), 'min-height');
        cleanup();
        const overview = renderNode('overview', { borderWidth });
        const overviewBox = declarationFor(frameOf(overview.container), 'min-height');
        cleanup();
        expect(overviewBox, `borderWidth ${borderWidth}`).toBe(detailBox);
      }
    });
  });

  describe('OverviewNode measures from the same recipe the detail body does', () => {
    it('declares the same width and min-height GraphNode would, at every size stop', () => {
      for (const size of sizes) {
        const detail = renderNode('detail', undefined, size);
        const expected = {
          width: declarationFor(frameOf(detail.container), 'width'),
          minHeight: declarationFor(frameOf(detail.container), 'min-height'),
        };
        cleanup();
        const plain = renderOverviewNode(size);
        const actual = {
          width: declarationFor(frameOf(plain.container), 'width'),
          minHeight: declarationFor(frameOf(plain.container), 'min-height'),
        };
        cleanup();
        // Swapping the body cannot move the node's box, so it cannot move an
        // edge endpoint either. A "small grey rectangle" here would move every
        // endpoint on the canvas the moment a user zoomed out.
        expect(actual, `size ${size}`).toStrictEqual(expected);
      }
    });

    it('is one box, not a body — that is the cost it saves at 500 nodes', () => {
      const { container } = renderOverviewNode('medium');
      expect(container.querySelector('[data-graph-node-overview]')).not.toBeNull();
      expect(container.querySelector('[data-graph-node-title]')).toBeNull();
      expect(container.querySelector('[data-graph-node-ports]')).toBeNull();
    });

    it('does not clip, because the ports still overhang the frame (§7.1 H6)', () => {
      const { container } = renderOverviewNode('medium');
      expect(declarationFor(frameOf(container), 'overflow-x')).not.toBe('hidden');
      expect(declarationFor(frameOf(container), 'overflow-y')).not.toBe('hidden');
    });
  });
});
