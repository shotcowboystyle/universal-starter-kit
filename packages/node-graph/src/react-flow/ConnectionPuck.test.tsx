/**
 * Task 3.5, the rendered half.
 *
 * The decision — which candidate is worth naming — is a pure function and is
 * asserted as one. What is left for a render is the two things a pure function
 * cannot say: that the puck reads REACT FLOW'S OWN connection state rather
 * than a shape we invented, and that it does not ride the pan/zoom matrix.
 *
 * So the connection is driven through the real store (`useStoreApi`), not a
 * mocked `useStore`. A mock would assert that our selector agrees with our
 * mock, which is the failure mode this file exists to avoid: the puck's whole
 * job is to be right about a library's state.
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset, Surface } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import type { PortRef } from '../model/index';

import { ConnectionPuck, connectionPuckLabel } from './ConnectionPuck';
import { demoGraphSchema } from './demo-node-body';
import { demoDocument } from './fixtures';
import { NodeGraphWeb } from './NodeGraphWeb';
import { useStoreApi } from './xy';

const doc = demoDocument;
const schema = demoGraphSchema;

/**
 * The demo fixture, in the terms this file needs:
 *   a (source) -- rows -->  b (transform) -- ok / err -->  c (sink)
 * and `a.rows -> b.in` ALREADY EXISTS, which is what makes `b.in` a duplicate
 * and therefore the illegal candidate every case below leans on.
 */
const fromA: PortRef = { node: 'a', port: 'rows' };

/**
 * Drives React Flow's own connection state, then reads what the puck did.
 *
 * `fromHandle` / `toHandle` carry more fields on a real drag; the puck reads
 * `nodeId` and `id`, and constructing a full `Handle` would be theatre.
 */
const DriveConnection = ({ to }: { to: { nodeId: string; id: string } | null }) => {
  const store = useStoreApi();
  useEffect(() => {
    store.setState({
      connection: {
        inProgress: true,
        isValid: null,
        from: { x: 0, y: 0 },
        to: { x: 0, y: 0 },
        fromPosition: 'right',
        toPosition: 'left',
        fromNode: null,
        toNode: null,
        fromHandle: { nodeId: 'a', id: 'rows', type: 'source' },
        toHandle: to ? { ...to, type: 'target' } : null,
      },
    } as never);
  }, [store, to]);
  return null;
};

/**
 * The canvas mounts its OWN puck (`connectionPuck` defaults to true), so this
 * adds only the driver. Rendering a second `<ConnectionPuck>` as a child is
 * what the "exactly one div" case below refuses, and it caught precisely that
 * mistake in this file before the case was written down.
 */
const mountWithConnection = (to: { nodeId: string; id: string } | null) =>
  renderWithProviders(
    <Preset cascade={false}>
      <Surface
        size="medium"
        density="comfortable">
        <NodeGraphWeb
          schema={schema()}
          defaultDocument={doc()}>
          <DriveConnection to={to} />
        </NodeGraphWeb>
      </Surface>
    </Preset>,
  );

const puckOf = (container: HTMLElement): HTMLElement | null => container.querySelector('[data-graph-connection-puck]');

describe(ConnectionPuck, () => {
  afterEach(cleanup);

  describe(connectionPuckLabel, () => {
    const base = { document: doc(), schema: schema() };

    it('is null when no connection is in progress', () => {
      expect(connectionPuckLabel({ ...base, source: null, candidate: null })).toBeNull();
    });

    it('names the candidate node and port when the candidate is legal', () => {
      const label = connectionPuckLabel({
        ...base,
        source: fromA,
        candidate: { node: 'c', port: 'in' },
      });
      expect(label).toMatchObject({ legal: true, target: 'c:in' });
      expect(label?.text).toContain('c');
      // The PORT's label, not its id, when the schema gives it one.
      expect(label?.text).toContain('rows');
    });

    it('falls back to naming the source when the candidate is refused', () => {
      // `a.rows -> b.in` is already in the document, so it is a duplicate.
      const label = connectionPuckLabel({
        ...base,
        source: fromA,
        candidate: { node: 'b', port: 'in' },
      });
      expect(label).toMatchObject({ legal: false, target: '' });
      expect(label?.text).toContain('from');
      expect(label?.text).toContain('a');
    });

    it('falls back the same way over open canvas, with no candidate at all', () => {
      const label = connectionPuckLabel({ ...base, source: fromA, candidate: null });
      expect(label).toMatchObject({ legal: false, target: '' });
    });

    it("uses a consumer's node name when one is supplied", () => {
      const label = connectionPuckLabel({
        ...base,
        source: fromA,
        candidate: { node: 'c', port: 'in' },
        nodeLabel: (id) => (id === 'c' ? 'Warehouse' : undefined),
      });
      expect(label?.text).toContain('Warehouse');
      expect(label?.text).not.toContain('c /');
    });

    it('falls back to the port id when the schema declares no label', () => {
      const label = connectionPuckLabel({
        ...base,
        source: fromA,
        candidate: { node: 'nope', port: 'mystery' },
      });
      // An unresolvable candidate is not legal, so the SOURCE is named — and the
      // source resolves, so this is still a real name rather than an id soup.
      expect(label?.legal).toBe(false);
    });
  });

  describe("the puck reads React Flow's own connection state", () => {
    it('renders nothing while no connection is in progress', () => {
      const { container } = renderWithProviders(
        <Preset cascade={false}>
          <Surface
            size="medium"
            density="comfortable">
            <NodeGraphWeb
              schema={schema()}
              defaultDocument={doc()}
            />
          </Surface>
        </Preset>,
      );
      expect(puckOf(container)).toBeNull();
    });

    it('names the legal candidate the store snapped to', () => {
      const { container } = mountWithConnection({ nodeId: 'c', id: 'in' });
      const puck = puckOf(container);
      expect(puck).not.toBeNull();
      expect(puck?.dataset.graphPuckLegal).toBe('true');
      expect(puck?.dataset.graphPuckTarget).toBe('c:in');
      expect(puck?.textContent).toContain('c');
    });

    it('refuses to name a candidate the rules reject, even though React Flow snapped to it', () => {
      // The magnetic case, and the reason the filter exists: `connectionRadius`
      // is the 44 px hit diameter, so a finger 20 px off a duplicate port still
      // snaps to it. The puck must not promise what the drop will refuse.
      const { container } = mountWithConnection({ nodeId: 'b', id: 'in' });
      const puck = puckOf(container);
      expect(puck?.dataset.graphPuckLegal).toBe('false');
      expect(puck?.dataset.graphPuckTarget).toBe('');
    });

    it('is exactly ONE div, however many ports the graph has', () => {
      const { container } = mountWithConnection({ nodeId: 'c', id: 'in' });
      expect(container.querySelectorAll('[data-graph-connection-puck]')).toHaveLength(1);
    });

    it('can be turned off, for a consumer that draws its own', () => {
      const { container } = renderWithProviders(
        <Preset cascade={false}>
          <Surface
            size="medium"
            density="comfortable">
            <NodeGraphWeb
              schema={schema()}
              defaultDocument={doc()}
              connectionPuck={false}>
              <DriveConnection to={{ nodeId: 'c', id: 'in' }} />
            </NodeGraphWeb>
          </Surface>
        </Preset>,
      );
      expect(puckOf(container)).toBeNull();
    });

    it('mounted a second time renders a second div — which is why the canvas owns it', () => {
      const { container } = renderWithProviders(
        <Preset cascade={false}>
          <Surface
            size="medium"
            density="comfortable">
            <NodeGraphWeb
              schema={schema()}
              defaultDocument={doc()}
              connectionPuck={false}>
              <DriveConnection to={{ nodeId: 'c', id: 'in' }} />
              <ConnectionPuck
                document={doc()}
                schema={schema()}
              />
            </NodeGraphWeb>
          </Surface>
        </Preset>,
      );
      expect(container.querySelectorAll('[data-graph-connection-puck]')).toHaveLength(1);
    });
  });

  /**
   * Counter-scaled, measured rather than claimed.
   *
   * happy-dom lays nothing out, so a `getBoundingClientRect` here is zeros and
   * would pass whatever the puck did. What IS observable is placement: React
   * Flow's children are siblings of `.react-flow__viewport`, and only the
   * viewport carries the pan/zoom matrix. An element outside it cannot scale
   * with the graph, and an element inside it cannot help but. So the assertion
   * is the DOM relationship, which is the mechanism, not the symptom. The
   * symptom — the puck staying the same physical size through a pinch — is the
   * device arm's, and it is recorded as pending.
   */
  describe('the puck does not ride the pan/zoom matrix', () => {
    it('renders outside .react-flow__viewport', () => {
      const { container } = mountWithConnection({ nodeId: 'c', id: 'in' });
      const puck = puckOf(container);
      expect(puck).not.toBeNull();
      expect(puck?.closest('.react-flow__viewport')).toBeNull();
    });

    it("still renders inside the canvas root, so it moves with the graph's box", () => {
      const { container } = mountWithConnection({ nodeId: 'c', id: 'in' });
      expect(puckOf(container)?.closest('.react-flow')).not.toBeNull();
    });

    it('applies no scale of its own — a 1/zoom here would shrink it when zooming IN', () => {
      const { container } = mountWithConnection({ nodeId: 'c', id: 'in' });
      const transform = puckOf(container)?.style.transform ?? '';
      expect(transform).not.toContain('scale');
    });
  });
});
