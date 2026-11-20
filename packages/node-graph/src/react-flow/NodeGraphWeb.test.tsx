/**
 * Task 1.11, the rendered half.
 *
 * The plan's four claims: it mounts, it renders N nodes, culling defaults on,
 * and `colorMode` follows the envelope scheme.
 *
 * ONE of those cannot be observed here and it is stated rather than faked.
 * `onlyRenderVisibleElements` culls through `getNodesInside`, which skips a
 * node React Flow has not MEASURED — and happy-dom measures nothing, so every
 * node is treated as unmeasured and nothing is ever culled. Measured directly:
 * a node parked at (900000, 900000) with the store reporting 500×500 renders
 * with culling on, off and unset alike. So the default is asserted where it is
 * decided (`graphCanvasDefaults`) plus the fact that the resolved value reaches
 * `ReactFlow` — proved through `colorMode`, which travels the same spread and
 * IS observable, as a wrapper class. The culling itself is measured in Chrome,
 * on `NodeGraph/NodeGraph → Large200`, and reported on the ticket.
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset, Surface } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Theme } from 'tamagui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BuiltinEdgeData } from '../edges/edge-kinds';
import { portConnectionRadius } from '../nodes/handle-geometry';
import { graphRootClassName } from '../theme/GraphVarsStyle';

import { demoGraphSchema } from './demo-node-body';
import { demoDocument, demoDocumentLarge } from './fixtures';
import type { DemoNodeData } from './fixtures';
import type { GraphCommandSlot } from './graph-handle';
import { mountedNodeCount, resetNodeCensus } from './node-census';
import { NodeGraphWeb, graphCanvasDefaults } from './NodeGraphWeb';
import type { NodeGraphWebProps } from './NodeGraphWeb';
import { useStore } from './xy';

const mount = (element: ReactElement) =>
  renderWithProviders(
    <Preset cascade={false}>
      <Surface
        size="medium"
        density="comfortable">
        {element}
      </Surface>
    </Preset>,
  );

/** React Flow tags every rendered node wrapper with the node id. */
const renderedNodeIds = (container: HTMLElement): string[] =>
  [...container.querySelectorAll<HTMLElement>('.react-flow__node')].map((element) => element.dataset.id ?? '');

/**
 * H5 (design §7.1, task 3.4). React Flow's magnetic drop radius defaults to
 * 20 px, which agrees with neither of our two hit diameters. 20 under a 44 px
 * touch target is a drop that looks on the port and refuses; 20 over a 24 px
 * mouse target is one that looks off it and takes. So the canvas sets the
 * radius to the hit diameter and the affordance and the behavior are one
 * number.
 *
 * Read off React Flow's OWN store rather than a prop we passed to ourselves —
 * that is the difference between asserting the wiring and asserting the
 * variable.
 */
const ConnectionRadiusProbe = ({ onValue }: { onValue: (value: number) => void }) => {
  onValue(useStore((state) => state.connectionRadius));
  return null;
};

const radiusFor = (coarsePointer: boolean): number => {
  let seen = Number.NaN;
  mount(
    <NodeGraphWeb
      schema={demoGraphSchema()}
      defaultDocument={demoDocument()}
      coarsePointer={coarsePointer}>
      <ConnectionRadiusProbe
        onValue={(value) => {
          seen = value;
        }}
      />
    </NodeGraphWeb>,
  );
  return seen;
};

/**
 * Removing `KnobEnvelopeProvider` outright SURVIVED the first version of this
 * file. On web the host's Preset stack is already above the canvas, so the
 * rebuild looks like a no-op — but it is the only path `props.knobs` takes to
 * a node, and it is the whole mechanism milestone 2 runs inside the WebView.
 * A composition nothing tests is a composition someone deletes.
 */
const radiusOf = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('[data-graph-node-radius]')].map(
    (element) => element.dataset.graphNodeRadius,
  );

describe('node-graph-web', () => {
  afterEach(() => {
    cleanup();
    // The census is a module global by design — one JS realm holds one canvas
    // inside a WebView. Across tests in one process it has to be cleared, or the
    // previous mount's nodes are still counted.
    resetNodeCensus();
  });

  describe('it mounts', () => {
    it('renders one React Flow node per document node', () => {
      const { container } = mount(
        <NodeGraphWeb
          schema={demoGraphSchema()}
          defaultDocument={demoDocument()}
        />,
      );
      expect(renderedNodeIds(container).toSorted()).toStrictEqual(['a', 'b', 'c']);
    });

    it('renders twelve for the twelve-node graph the Main story shows', () => {
      const { container } = mount(
        <NodeGraphWeb
          schema={demoGraphSchema()}
          defaultDocument={demoDocumentLarge(12)}
        />,
      );
      expect(renderedNodeIds(container)).toHaveLength(12);
      // Not the edges. React Flow builds an edge from its two HANDLE BOUNDS, and
      // happy-dom measures no element, so `handleBounds` is never populated and
      // every edge is dropped before it paints — measured here, 8 edges in the
      // document and 0 in the DOM. The edge MAPPING is asserted in
      // `use-graph-controller.test.tsx` (ids, handles, marker, kind) and the
      // painted result in Chrome, on `NodeGraph/Edges` and `NodeGraph/NodeGraph`.
      expect(container.querySelector('.react-flow__edges')).not.toBeNull();
    });

    it('counts the nodes it mounted in the census, which is what nodesMounted reports', () => {
      // Design 9.5's `nodesMounted` used to be filled with `document.nodes.length`
      // — the document's count, which is a different number the moment culling
      // drops one. This is the register that makes it the mounted count instead.
      // happy-dom cannot cull (see the header), so here the two agree at twelve,
      // and the number that matters on device is read off the panel.
      const { container, unmount } = mount(
        <NodeGraphWeb
          schema={demoGraphSchema()}
          defaultDocument={demoDocumentLarge(12)}
        />,
      );
      expect(mountedNodeCount()).toBe(renderedNodeIds(container).length);
      expect(mountedNodeCount()).toBe(12);
      unmount();
      // And it releases: a canvas that has gone away must not still be counted,
      // or a second mount reports twenty-four.
      expect(mountedNodeCount()).toBe(0);
    });

    it("renders each node's own Tamagui body, not a placeholder", () => {
      const { container } = mount(
        <NodeGraphWeb
          schema={demoGraphSchema()}
          defaultDocument={demoDocument()}
        />,
      );
      // The bodies come from the schema's `render`, so the titles differ per kind.
      const titles = [...container.querySelectorAll('[data-graph-node-title]')].map((element) => element.textContent);
      expect(titles.toSorted()).toStrictEqual(['Sink', 'Source', 'Transform']);
      // …and each carries its ports, which only the schema knows.
      expect(container.querySelectorAll('[data-graph-port]')).toHaveLength(5);
    });

    it('renders an empty graph without throwing', () => {
      const { container } = mount(
        <NodeGraphWeb
          schema={demoGraphSchema()}
          defaultDocument={{ version: 1, nodes: [], edges: [] }}
        />,
      );
      expect(renderedNodeIds(container)).toHaveLength(0);
      expect(container.querySelector(`.${graphRootClassName}`)).not.toBeNull();
    });

    it('says so, loudly, when a document names a kind the schema does not declare', () => {
      const { container } = mount(
        <NodeGraphWeb
          schema={demoGraphSchema()}
          defaultDocument={
            {
              version: 1,
              nodes: [{ id: 'x', kind: 'wormhole', position: { x: 0, y: 0 }, data: {} }],
              edges: [],
              // biome-ignore lint: the point of the case is a document the schema refuses
            } as never
          }
        />,
      );
      expect(container.querySelector("[data-graph-node-unknown='wormhole']")).not.toBeNull();
    });
  });

  describe("the kind's declared measure reaches the painted node", () => {
    it("paints the width the seed predicted, not the default table's", () => {
      // Found by the knob fuzz, not by a spec: `NodeKindSpec.measure` reached
      // the React Flow SEED and stopped there, because `GraphNodeRenderProps`
      // carried no `measure` for the body to forward. So a node was seeded at
      // one width and painted at another, and every kind with a non-default
      // width defeated the seeding it exists to feed.
      const { container } = mount(
        <NodeGraphWeb
          schema={demoGraphSchema()}
          defaultDocument={demoDocument()}
        />,
      );
      const painted = Object.fromEntries(
        [...container.querySelectorAll<HTMLElement>('[data-graph-node]')].map((element) => [
          element.dataset.graphNode,
          element.dataset.graphNodeWidth,
        ]),
      );
      // `sink` declares 240; the default table has no 240 at any size stop.
      expect(painted.c).toBe('240');
      expect(painted.a).toBe('190');
      expect(painted.b).toBe('190');
    });
  });

  describe('the root', () => {
    it('carries the scope class every rule in css/graph.css is written against', () => {
      const { container } = mount(
        <NodeGraphWeb
          schema={demoGraphSchema()}
          defaultDocument={demoDocument()}
        />,
      );
      const root = container.querySelector(`.${graphRootClassName}`);
      expect(root).not.toBeNull();
      // The React Flow wrapper is INSIDE it, so the var layer written on the root
      // cascades into React Flow's own stylesheet.
      expect(root?.querySelector("[data-testid='rf__wrapper']")).not.toBeNull();
    });

    it("keeps a consumer's className alongside its own", () => {
      const { container } = mount(
        <NodeGraphWeb
          schema={demoGraphSchema()}
          defaultDocument={demoDocument()}
          className="editor-pane"
        />,
      );
      const root = container.querySelector('.editor-pane');
      expect(root?.classList.contains(graphRootClassName)).toBe(true);
    });

    it('writes the --xy-* sheet, so React Flow paints from mpo tokens', () => {
      const { container } = mount(
        <NodeGraphWeb
          schema={demoGraphSchema()}
          defaultDocument={demoDocument()}
        />,
      );
      const style = container.querySelector('style[data-mpo-graph-vars]');
      expect(style).not.toBeNull();
      const text = style?.textContent ?? '';
      expect(text).toContain(`.${graphRootClassName} {`);
      expect(text).toMatch(/--xy-edge-stroke:/u);
      // The bridge's whole point: no literal color reaches the sheet.
      expect(/#[0-9a-f]{3,8}\b/iu.test(text)).toBe(false);
    });
  });

  describe('the knob envelope reaches the nodes', () => {
    it('carries props.knobs through the envelope and onto every node frame', () => {
      const square = mount(
        <NodeGraphWeb
          schema={demoGraphSchema()}
          defaultDocument={demoDocument()}
          knobs={{ borderRadius: 'none' }}
        />,
      );
      const squareRadii = radiusOf(square.container);
      cleanup();

      const round = mount(
        <NodeGraphWeb
          schema={demoGraphSchema()}
          defaultDocument={demoDocument()}
          knobs={{ borderRadius: 'full' }}
        />,
      );
      const roundRadii = radiusOf(round.container);

      expect(squareRadii).toHaveLength(3);
      expect(new Set(squareRadii)).toStrictEqual(new Set(['0']));
      expect(roundRadii).toHaveLength(3);
      expect(roundRadii).not.toStrictEqual(squareRadii);
    });
  });

  describe('colorMode follows the envelope scheme', () => {
    it.each([
      ['light', 'light'],
      ['dark', 'dark'],
    ])('under <Theme name=%s> the canvas is %s', (themeName, expected) => {
      const { container } = mount(
        <Theme name={themeName as 'light' | 'dark'}>
          <NodeGraphWeb
            schema={demoGraphSchema()}
            defaultDocument={demoDocument()}
          />
        </Theme>,
      );
      const wrapper = container.querySelector("[data-testid='rf__wrapper']");
      expect(wrapper?.classList.contains(expected)).toBe(true);
      expect(container.querySelector<HTMLElement>(`.${graphRootClassName}`)?.dataset.graphScheme).toBe(expected);
    });

    it('is the same value the sheet declares, so chrome and bodies cannot disagree', () => {
      const { container } = mount(
        <Theme name="dark">
          <NodeGraphWeb
            schema={demoGraphSchema()}
            defaultDocument={demoDocument()}
          />
        </Theme>,
      );
      expect(container.querySelector('style[data-mpo-graph-vars]')?.textContent).toContain('color-scheme: dark;');
    });
  });

  describe('onlyRenderVisibleElements', () => {
    it("defaults to true — React Flow's own default is false", () => {
      // The measured reason, design §5: node drag 25.71 ms → 10.58 ms at 200
      // nodes / 4× throttle. If this flips, the 200-node story gets slower and
      // nothing else in the suite notices.
      expect(graphCanvasDefaults.onlyRenderVisibleElements).toBe(true);
    });

    it('cannot be observed in happy-dom, and that is measured, not assumed', () => {
      // A node 900000 px away is culled in a browser and rendered here, because
      // `getNodesInside` skips unmeasured nodes and happy-dom measures none.
      // Written as a test so the day happy-dom starts measuring, this fails and
      // someone strengthens the assertion above instead of trusting a comment.
      const far = {
        version: 1 as const,
        nodes: [
          ...demoDocument().nodes,
          {
            id: 'far',
            kind: 'sink' as const,
            position: { x: 900_000, y: 900_000 },
            data: { target: 'x' },
          },
        ],
        edges: [],
      };
      const { container } = mount(
        <NodeGraphWeb
          schema={demoGraphSchema()}
          defaultDocument={far}
          onlyRenderVisibleElements
        />,
      );
      expect(renderedNodeIds(container)).toContain('far');
    });

    /**
     * IT FLIPS IN PLACE. React Flow takes it as an ordinary prop, and until the
     * m6 device pass `Perf200` toggled it with a `key` on `<NodeGraph>` instead —
     * which throws the canvas away and builds a new one.
     *
     * On a phone that is not a slow toggle, it is a lost harness: the remount
     * discards the frame sampler mid-session and resets the viewport, so the five
     * runs design §13.2 asks for are five runs of five different starting states.
     * It also discarded the imperative handle, which is what left the culling-OFF
     * readout on `sampling…` forever (see `native/graph-handle-remount.test.tsx`).
     *
     * Three things have to survive the flip, and node identity alone is not
     * enough — React would give the same ids to a freshly built canvas.
     */
    it('flips in place: the same nodes, the same DOM, the same command slot', () => {
      const slot: GraphCommandSlot = { current: null };
      const onCanvasMounted = vi.fn<() => void>();
      const canvas = (culling: boolean) => (
        <NodeGraphWeb
          schema={demoGraphSchema()}
          defaultDocument={demoDocumentLarge(12)}
          onlyRenderVisibleElements={culling}
          commandSlot={slot}
          onCanvasMounted={onCanvasMounted}
        />
      );
      const view = mount(canvas(true));
      const before = renderedNodeIds(view.container);
      const firstNode = view.container.querySelector('.react-flow__node');
      const commands = slot.current;
      expect(before).toHaveLength(12);
      expect(commands, 'the bridge never registered its commands').not.toBeNull();
      // Counted rather than pinned to 1: what matters is that the TOGGLE adds
      // none, not how many times the bridge's own effect settled on first mount.
      const mountsBefore = onCanvasMounted.mock.calls.length;

      view.rerender(
        <Preset cascade={false}>
          <Surface
            size="medium"
            density="comfortable">
            {canvas(false)}
          </Surface>
        </Preset>,
      );

      expect(renderedNodeIds(view.container), 'the node ids did not survive the toggle').toStrictEqual(before);
      expect(
        view.container.querySelector('.react-flow__node'),
        'the canvas was rebuilt: same ids, different elements',
      ).toBe(firstNode);
      expect(slot.current, 'the command bridge remounted, so the sampler mid-run was discarded').toBe(commands);
      expect(onCanvasMounted).toHaveBeenCalledTimes(mountsBefore);
    });
  });

  describe('readOnly', () => {
    it('stops React Flow from dragging or connecting, and still renders', () => {
      const { container } = mount(
        <NodeGraphWeb
          schema={demoGraphSchema()}
          defaultDocument={demoDocument()}
          readOnly
        />,
      );
      expect(renderedNodeIds(container)).toHaveLength(3);
      // React Flow marks a draggable node with the `draggable` class; a read-only
      // canvas has none.
      expect(container.querySelectorAll('.react-flow__node.draggable')).toHaveLength(0);
    });
  });

  describe('the controlled canvas', () => {
    it('reports a change without moving until the parent sends a new document', () => {
      const onDocumentChange =
        vi.fn<NonNullable<NodeGraphWebProps<DemoNodeData, BuiltinEdgeData>['onDocumentChange']>>();
      const document = demoDocument();
      const { container } = mount(
        <NodeGraphWeb
          schema={demoGraphSchema()}
          document={document}
          onDocumentChange={onDocumentChange}
        />,
      );
      expect(renderedNodeIds(container).toSorted()).toStrictEqual(['a', 'b', 'c']);
      expect(onDocumentChange).not.toHaveBeenCalled();
    });
  });

  describe('connectionRadius matches the visible affordance', () => {
    it('is the press floor on a coarse pointer', () => {
      expect(radiusFor(true)).toBe(portConnectionRadius({ size: 'medium', coarsePointer: true }));
      expect(radiusFor(true)).toBe(44);
    });

    it('is the fine-pointer hit diameter on a fine pointer', () => {
      expect(radiusFor(false)).toBe(portConnectionRadius({ size: 'medium', coarsePointer: false }));
      expect(radiusFor(false)).toBe(24);
    });

    it("is never React Flow's 20 px default on either pointer kind", () => {
      expect(radiusFor(true)).not.toBe(20);
      expect(radiusFor(false)).not.toBe(20);
    });
  });
});
