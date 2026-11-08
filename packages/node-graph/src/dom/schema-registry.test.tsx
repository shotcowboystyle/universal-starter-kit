/**
 * The m6 device pass's first defect: an entry that could supply ONE schema.
 *
 * `render: no graph schema registered as "node-graph-demo-control"` on the
 * iPhone 16e, with a canvas that painted nothing. Only `schemaId` crosses the
 * bridge — a `render` is a `ComponentType` and cannot be JSON — so the schema
 * has to be resolved inside the DOM bundle, and the entry could hand the shell
 * exactly one. Design §13.2 mandates the plain-div control condition in every
 * measurement session, so one schema per entry meant the Tamagui cost on device
 * stayed carried over from web rather than measured.
 *
 * These are the resolution rules, stated as behaviour rather than as a shape:
 * the list is keyed BY ID, a non-matching schema is never substituted, a miss
 * still reports what is missing, and the process-wide registry still wins so the
 * two mechanisms compose.
 *
 * `NodeGraphDomInner` is rendered directly rather than through the shell: the
 * shell reaches the inner tree through a dynamic `import()` and mounts
 * `expo/dom`, and neither is what is under test here.
 */

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { knobEnvelopeSchemaVersion } from '../knobs/envelope';
import { clearGraphSchemas, registerGraphSchema } from '../model/index';
import type { GraphSchema } from '../model/index';
import { demoControlSchema } from '../react-flow/demo-control-body';
import { demoGraphSchema } from '../react-flow/demo-node-body';
import { demoControlSchemaId, demoGraphSchemaId } from '../react-flow/fixtures';

import type { GraphDomCommandSlot } from './node-graph-dom-shell';
import { NodeGraphDomInner } from './NodeGraphDomInner';
import { decodeGraphEvent } from './wire';
import type { GraphEventWire } from './wire';

type AnySchema = GraphSchema<never, never>;

/**
 * The same erasure `registerGraphSchema` and the shell both perform.
 *
 * A schema's type parameters describe the app's own node data, and the registry
 * is keyed by a string: the erasure happens once at that boundary in the
 * product code, and once here so the spec crosses it the same way.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the deliberate type erasure under test; any schema goes in
const erased = (schema: unknown): AnySchema => schema as AnySchema;

const envelopeJson = JSON.stringify({
  schemaVersion: knobEnvelopeSchemaVersion,
  knobs: {},
  intent: null,
  surface: { size: 'md', density: 'comfortable' },
  scheme: 'light',
  themeName: 'light',
  prefersReducedMotion: true,
  vars: {},
  fonts: [],
  pixelRatio: 1,
  revision: 1,
});

/** One node of the demo schema's own `source` kind, so both schemas accept it. */
const documentJson = JSON.stringify({
  version: 1,
  nodes: [{ id: 'n0', kind: 'source', position: { x: 0, y: 0 }, data: { table: 'orders' } }],
  edges: [],
});

const mount = (schemaId: string, realm: { schema?: AnySchema; schemas?: readonly AnySchema[] }) => {
  const events: GraphEventWire[] = [];
  const commands: GraphDomCommandSlot = { current: null };
  render(
    <NodeGraphDomInner
      commands={commands}
      documentJson={documentJson}
      envelopeJson={envelopeJson}
      onEvent={async (json) => {
        events.push(decodeGraphEvent(json));
      }}
      optionsJson="{}"
      rev={1}
      schema={realm.schema as never}
      schemas={realm.schemas as never}
      schemaId={schemaId}
    />,
  );
  return {
    events,
    /** The `{ t: "error", phase: "render" }` message, or null. */
    problem: () => {
      const failure = events.find((event) => event.t === 'error' && event.phase === 'render');
      return failure?.t === 'error' ? failure.message : null;
    },
  };
};

describe('schema-registry', () => {
  afterEach(() => {
    cleanup();
    clearGraphSchemas();
  });

  describe("the DOM entry's schema registry", () => {
    it('resolves the CONTROL schema when the entry registered both', async () => {
      const harness = mount(demoControlSchemaId, {
        schemas: [erased(demoGraphSchema()), erased(demoControlSchema())],
      });
      await waitFor(() => {
        expect(harness.events.length).toBeGreaterThan(0);
      });
      // `null` is the whole assertion: the m6 device defect WAS this string.
      expect(harness.problem(), 'no graph schema registered as …').toBeNull();
    });

    it('resolves the DEMO schema from the same list — one entry, two canvases', async () => {
      const harness = mount(demoGraphSchemaId, {
        schemas: [erased(demoGraphSchema()), erased(demoControlSchema())],
      });
      await waitFor(() => {
        expect(harness.events.length).toBeGreaterThan(0);
      });
      expect(harness.problem()).toBeNull();
    });

    /**
     * The rule that makes the list safe. Taking "the first one" would paint the
     * wrong node bodies and report nothing at all, which is a debugging session
     * with no thread to pull; a refusal that names the missing id is one line.
     */
    it('never substitutes a schema whose id does not match', async () => {
      const harness = mount('node-graph-something-else', {
        schemas: [erased(demoGraphSchema()), erased(demoControlSchema())],
      });
      await waitFor(() => {
        expect(harness.problem()).not.toBeNull();
      });
      expect(harness.problem()).toMatch(/no graph schema registered as "node-graph-something-else"/u);
    });

    /** And the refusal names the mechanism that would have fixed it. */
    it('names `schemas` in the refusal, because that is the fix for more than one', async () => {
      const harness = mount('node-graph-absent', { schema: erased(demoGraphSchema()) });
      await waitFor(() => {
        expect(harness.problem()).not.toBeNull();
      });
      expect(harness.problem()).toMatch(/schemas/u);
    });

    /**
     * The two mechanisms compose. An app that would rather import a registration
     * module than thread a prop still wins, so adding `schemas` took nothing
     * away.
     */
    it("still prefers the process-wide registry over the entry's list", async () => {
      const registered = { ...demoControlSchema(), nodes: { ...demoControlSchema().nodes } };
      const renderSpy = vi.fn<(...args: unknown[]) => null>(() => null);
      registerGraphSchema({
        ...registered,
        nodes: {
          ...registered.nodes,
          source: { ...registered.nodes.source, render: renderSpy as never },
        },
      } as never);
      const harness = mount(demoControlSchemaId, {
        schemas: [erased(demoControlSchema())],
      });
      await waitFor(() => {
        expect(renderSpy).toHaveBeenCalledWith(expect.objectContaining({ id: expect.any(String) }), undefined);
      });
      expect(harness.problem()).toBeNull();
    });
  });

  describe('the control schema', () => {
    /**
     * The id is the one string two realms have to agree on. A rename on one side
     * is the exact failure this whole commit exists to fix, and it is silent.
     */
    it('registers under the id the constant names', () => {
      expect(demoControlSchema().id).toBe(demoControlSchemaId);
      expect(demoControlSchemaId).toBe('node-graph-demo-control');
    });

    /** Same geometry as the subject, or the two cells are two experiments. */
    it("carries the demo schema's measures, so the delta is the node body alone", () => {
      const control = demoControlSchema();
      const demo = demoGraphSchema();
      for (const kind of ['source', 'transform', 'sink'] as const) {
        expect(control.nodes[kind].measure).toStrictEqual(demo.nodes[kind].measure);
        expect(control.nodes[kind].ports).toStrictEqual(demo.nodes[kind].ports);
      }
    });
  });
});
