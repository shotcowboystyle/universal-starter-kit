/**
 * Connection rules, design §4.4.
 *
 * Two things are pinned here and they are not the same thing. The rules
 * themselves — each refuses its own case and, on a document where nothing else
 * is wrong, passes every other rule's, which is what stops a rule from
 * accidentally covering for a broken neighbour. And the SPLIT: `refuseCycle` is
 * O(V+E) and React Flow calls `isValidConnection` on every pointer tick, so a
 * cycle check on the tick path is a frame budget spent per mouse move. The
 * split is a type, not a comment, and the `@ts-expect-error` below is what
 * makes it one. If `ConnectionRule` and `DropOnlyRule` ever collapse into the
 * same type, that directive goes unused and `tsgo` fails on TS2578.
 */

import { describe, expect, it } from 'vitest';

import {
  defaultDropRules,
  defaultRules,
  refuseCycle,
  refuseDataTypeMismatch,
  refuseDirection,
  refuseDuplicate,
  refusePortArity,
  refuseSelfLoop,
  validateConnection,
  validateDrop,
} from './connect';
import type { ConnectionContext } from './connect';
import type { GraphDocument, PortRef } from './document';
import { createGraphSchema } from './schema';

interface Nodes {
  readonly source: Record<string, never>;
  readonly sink: Record<string, never>;
}

interface Edges {
  readonly flow: Record<string, never>;
}

const nothing = () => null;

const schema = createGraphSchema<Nodes, Edges>({
  id: 'connect-spec',
  nodes: {
    source: {
      kind: 'source',
      render: nothing,
      defaultData: {},
      measure: { width: 172, minHeight: 48 },
      ports: [
        { id: 'out', side: 'right', direction: 'out', dataType: 'number' },
        { id: 'outOne', side: 'right', direction: 'out', dataType: 'number', arity: 'one' },
        // An input on a `source` node, so the direction fixture can point the
        // SOURCE end of a candidate at an input without also being a self loop.
        { id: 'in', side: 'left', direction: 'in', dataType: 'number' },
      ],
    },
    sink: {
      kind: 'sink',
      render: nothing,
      defaultData: {},
      measure: { width: 172, minHeight: 48 },
      ports: [
        { id: 'in', side: 'left', direction: 'in', dataType: 'number' },
        { id: 'inMany', side: 'left', direction: 'in', dataType: 'number', arity: 'many' },
        { id: 'inText', side: 'left', direction: 'in', dataType: 'string', arity: 'many' },
        { id: 'out', side: 'right', direction: 'out', dataType: 'number' },
      ],
    },
  },
  edges: { flow: { kind: 'flow', defaultData: {} } },
  rules: defaultRules,
  dropRules: defaultDropRules,
});

type Doc = GraphDocument<Nodes, Edges>;

function node(id: string, kind: 'source' | 'sink') {
  return { id, kind, position: { x: 0, y: 0 }, data: {} } as const;
}

function edge(id: string, source: PortRef, target: PortRef) {
  return { id, kind: 'flow', source, target, data: {} } as const;
}

const threeNodes: Doc = {
  version: 1,
  nodes: [node('a', 'source'), node('b', 'sink'), node('c', 'source')],
  edges: [],
};

function ctx(doc: Doc, source: PortRef, target: PortRef): ConnectionContext<Nodes, Edges> {
  return { document: doc, schema, source, target };
}

function withEdges(edges: Doc['edges']): Doc {
  return { ...threeNodes, edges };
}

/**
 * One fixture per rule: a candidate connection that violates exactly that rule
 * on a document where nothing else is wrong.
 */
const fixtures = {
  refuseDirection: {
    rule: refuseDirection,
    code: 'wrong-direction',
    // The source end is an INPUT port. Different nodes, no existing edges,
    // matching data types, so no other rule has anything to say.
    context: () => ctx(threeNodes, { node: 'a', port: 'in' }, { node: 'b', port: 'in' }),
  },
  refuseSelfLoop: {
    rule: refuseSelfLoop,
    code: 'self-loop',
    context: () => ctx(threeNodes, { node: 'a', port: 'out' }, { node: 'a', port: 'in' }),
  },
  refusePortArity: {
    rule: refusePortArity,
    code: 'port-arity',
    // `sink.in` defaults to arity "one" and c already fills it.
    context: () =>
      ctx(
        withEdges([edge('e0', { node: 'c', port: 'out' }, { node: 'b', port: 'in' })]),
        { node: 'a', port: 'out' },
        { node: 'b', port: 'in' },
      ),
  },
  refuseDuplicate: {
    rule: refuseDuplicate,
    code: 'duplicate-edge',
    // Same pair twice, on a "many" input so arity has nothing to say.
    context: () =>
      ctx(
        withEdges([edge('e0', { node: 'a', port: 'out' }, { node: 'b', port: 'inMany' })]),
        { node: 'a', port: 'out' },
        { node: 'b', port: 'inMany' },
      ),
  },
  refuseDataTypeMismatch: {
    rule: refuseDataTypeMismatch(),
    code: 'data-type-mismatch',
    // number -> string, on a "many" input with no existing edge.
    context: () => ctx(threeNodes, { node: 'a', port: 'out' }, { node: 'b', port: 'inText' }),
  },
} as const;

const fixtureNames = Object.keys(fixtures) as (keyof typeof fixtures)[];

describe('each rule refuses its own case', () => {
  for (const name of fixtureNames) {
    it(`${name} refuses`, () => {
      const verdict = fixtures[name].rule(fixtures[name].context());
      expect(verdict.ok).toBe(false);
      if (verdict.ok) {
        return;
      }
      expect(verdict.code).toBe(fixtures[name].code);
      expect(verdict.message).toBeTruthy();
    });
  }
});

describe('and passes the other four', () => {
  for (const own of fixtureNames) {
    for (const other of fixtureNames) {
      if (own === other) {
        continue;
      }
      it(`${other} passes ${own}'s case`, () => {
        expect(fixtures[other].rule(fixtures[own].context())).toEqual({ ok: true });
      });
    }
  }
});

describe('refuseDirection checks BOTH ends', () => {
  // The fixture in the matrix points the SOURCE end at an input. A rule that
  // only checked that end would pass every test above, so the other end gets
  // its own case — and the same "passes the other four" treatment, because a
  // candidate ending at an output is otherwise perfectly legal.
  const targetIsAnOutput = () => ctx(threeNodes, { node: 'a', port: 'out' }, { node: 'b', port: 'out' });

  it('refuses a candidate that ends at an output', () => {
    expect(refuseDirection(targetIsAnOutput())).toEqual(
      expect.objectContaining({ ok: false, code: 'wrong-direction' }),
    );
  });

  for (const other of fixtureNames) {
    if (other === 'refuseDirection') {
      continue;
    }
    it(`${other} passes it`, () => {
      expect(fixtures[other].rule(targetIsAnOutput())).toEqual({ ok: true });
    });
  }
});

describe('a legal connection', () => {
  it('passes every default rule', () => {
    const legal = ctx(threeNodes, { node: 'a', port: 'out' }, { node: 'b', port: 'in' });
    for (const rule of defaultRules) {
      expect(rule(legal)).toEqual({ ok: true });
    }
    expect(validateConnection(legal)).toEqual({ ok: true });
    expect(validateDrop(legal)).toEqual({ ok: true });
  });
});

describe('first refusal wins, in declared order', () => {
  // A candidate that is BOTH a self loop and pointed the wrong way.
  const both = () => ctx(threeNodes, { node: 'a', port: 'in' }, { node: 'a', port: 'in' });

  it('reports the earlier rule when direction comes first', () => {
    const verdict = validateConnection(both(), [refuseDirection, refuseSelfLoop]);
    expect(verdict).toEqual(expect.objectContaining({ ok: false, code: 'wrong-direction' }));
  });

  it('reports the other one when the order is reversed', () => {
    const verdict = validateConnection(both(), [refuseSelfLoop, refuseDirection]);
    expect(verdict).toEqual(expect.objectContaining({ ok: false, code: 'self-loop' }));
  });

  it('puts refuseDirection first in defaultRules, so an impossible pair reports the clearest reason', () => {
    expect(validateConnection(both())).toEqual(expect.objectContaining({ ok: false, code: 'wrong-direction' }));
  });
});

describe(refuseCycle, () => {
  const cycle = refuseCycle();

  // a -> b -> c, candidate c -> a closes it.
  const chain: Doc = {
    version: 1,
    nodes: [node('a', 'source'), node('b', 'sink'), node('c', 'sink')],
    edges: [
      edge('ab', { node: 'a', port: 'out' }, { node: 'b', port: 'inMany' }),
      edge('bc', { node: 'b', port: 'out' }, { node: 'c', port: 'inMany' }),
    ],
  };

  it('catches a 3-node cycle', () => {
    const verdict = cycle(ctx(chain, { node: 'c', port: 'out' }, { node: 'a', port: 'in' }));
    expect(verdict).toEqual(expect.objectContaining({ ok: false, code: 'cycle' }));
  });

  it('catches the 1-hop cycle too', () => {
    const twoNodes: Doc = {
      version: 1,
      nodes: [node('a', 'source'), node('b', 'sink')],
      edges: [edge('ab', { node: 'a', port: 'out' }, { node: 'b', port: 'inMany' })],
    };
    expect(cycle(ctx(twoNodes, { node: 'b', port: 'out' }, { node: 'a', port: 'in' }))).toEqual(
      expect.objectContaining({ ok: false, code: 'cycle' }),
    );
  });

  it('allows a diamond, which reconverges without ever going back', () => {
    // a -> b, a -> c, b -> d. Candidate c -> d closes the diamond, not a cycle.
    const diamond: Doc = {
      version: 1,
      nodes: [node('a', 'source'), node('b', 'sink'), node('c', 'sink'), node('d', 'sink')],
      edges: [
        edge('ab', { node: 'a', port: 'out' }, { node: 'b', port: 'inMany' }),
        edge('ac', { node: 'a', port: 'out' }, { node: 'c', port: 'inMany' }),
        edge('bd', { node: 'b', port: 'out' }, { node: 'd', port: 'inMany' }),
      ],
    };
    expect(cycle(ctx(diamond, { node: 'c', port: 'out' }, { node: 'd', port: 'inMany' }))).toEqual({
      ok: true,
    });
  });

  it('allows a candidate that only reaches a node the source cannot reach back from', () => {
    expect(cycle(ctx(chain, { node: 'a', port: 'out' }, { node: 'c', port: 'inMany' }))).toEqual({
      ok: true,
    });
  });
});

describe('the split between the tick path and the drop path', () => {
  it('keeps refuseCycle out of defaultRules and in defaultDropRules', () => {
    expect(defaultRules).toHaveLength(5);
    expect(defaultDropRules).toHaveLength(1);
  });

  it('marks every tick-path rule and no drop-only rule', () => {
    // The runtime half of the type below. `validateConnection` demands the
    // marker; `refuseCycle` does not carry it.
    for (const rule of defaultRules) {
      expect(rule.tickSafe).toBe(true);
    }
    expect((refuseCycle() as unknown as { tickSafe?: unknown }).tickSafe).toBeUndefined();
  });

  it('leaves the cycle check OFF until a schema asks for it', () => {
    // `createGraphSchema` does not default `dropRules`. The DFS is O(V+E) and
    // design §4.4 says its cost at 200 nodes / 400 edges is unmeasured, so
    // switching it on for every consumer would be spending a budget nobody has
    // measured. A schema that wants it says so.
    const noDropRules = createGraphSchema<Nodes, Edges>({
      id: 'no-drop-rules',
      nodes: schema.nodes,
      edges: schema.edges,
      rules: defaultRules,
    });
    expect(noDropRules.dropRules).toEqual([]);
    const closes = {
      document: {
        version: 1,
        nodes: [node('a', 'source'), node('b', 'sink')],
        edges: [edge('ab', { node: 'a', port: 'out' }, { node: 'b', port: 'inMany' })],
      } as Doc,
      schema: noDropRules,
      source: { node: 'b', port: 'out' },
      target: { node: 'a', port: 'in' },
    };
    expect(validateDrop(closes)).toEqual({ ok: true });
    // ...and the same candidate is refused once the rule is passed in.
    expect(validateDrop(closes, defaultRules, defaultDropRules)).toEqual(
      expect.objectContaining({ ok: false, code: 'cycle' }),
    );
  });

  it('runs the drop rules only on validateDrop', () => {
    const closes = ctx(
      {
        version: 1,
        nodes: [node('a', 'source'), node('b', 'sink')],
        edges: [edge('ab', { node: 'a', port: 'out' }, { node: 'b', port: 'inMany' })],
      },
      { node: 'b', port: 'out' },
      { node: 'a', port: 'in' },
    );
    // The tick path is blind to the cycle, on purpose: it is the O(V+E) check.
    expect(validateConnection(closes)).toEqual({ ok: true });
    expect(validateDrop(closes)).toEqual(expect.objectContaining({ ok: false, code: 'cycle' }));
  });

  it('will not let validateConnection take a DropOnlyRule', () => {
    const legal = ctx(threeNodes, { node: 'a', port: 'out' }, { node: 'b', port: 'in' });
    // THIS DIRECTIVE IS THE TEST. `refuseCycle()` returns a `DropOnlyRule`,
    // which lacks the `tickSafe` marker `ConnectionRule` carries, so it is not
    // assignable. Collapse the two types and `tsgo` reports TS2578 here — an
    // unused '@ts-expect-error' — which is the failure this is written to
    // produce. Verified by `pnpm -F @repo/node-graph typecheck`.
    // @ts-expect-error a DropOnlyRule is too expensive for the pointer-tick path
    validateConnection(legal, [refuseCycle()]);
    // validateDrop, by contrast, takes both.
    expect(validateDrop(legal, defaultRules, [refuseCycle()])).toEqual({ ok: true });
  });
});

describe('ports that are not there', () => {
  it('refuses a candidate naming a node the document does not have', () => {
    expect(validateConnection(ctx(threeNodes, { node: 'ghost', port: 'out' }, { node: 'b', port: 'in' }))).toEqual(
      expect.objectContaining({ ok: false, code: 'unknown-node' }),
    );
  });

  it('refuses a candidate naming a port the kind does not have', () => {
    expect(validateConnection(ctx(threeNodes, { node: 'a', port: 'nope' }, { node: 'b', port: 'in' }))).toEqual(
      expect.objectContaining({ ok: false, code: 'unknown-port' }),
    );
  });
});

describe(refuseDataTypeMismatch, () => {
  it('takes a compatibility predicate', () => {
    const lenient = refuseDataTypeMismatch(() => true);
    expect(lenient(fixtures.refuseDataTypeMismatch.context())).toEqual({ ok: true });
  });

  it('lets an untyped port connect to anything, so dataType stays opt-in', () => {
    const untyped = createGraphSchema<Nodes, Edges>({
      id: 'untyped',
      nodes: {
        source: {
          kind: 'source',
          render: nothing,
          defaultData: {},
          measure: { width: 172, minHeight: 48 },
          ports: [{ id: 'out', side: 'right', direction: 'out' }],
        },
        sink: {
          kind: 'sink',
          render: nothing,
          defaultData: {},
          measure: { width: 172, minHeight: 48 },
          ports: [{ id: 'in', side: 'left', direction: 'in', dataType: 'string' }],
        },
      },
      edges: { flow: { kind: 'flow', defaultData: {} } },
      rules: defaultRules,
    });
    const verdict = refuseDataTypeMismatch()({
      document: { version: 1, nodes: [node('a', 'source'), node('b', 'sink')], edges: [] },
      schema: untyped,
      source: { node: 'a', port: 'out' },
      target: { node: 'b', port: 'in' },
    });
    expect(verdict).toEqual({ ok: true });
  });
});

describe('ports as a function of data', () => {
  it('resolves them per node, so a switch grows outputs without a new kind', () => {
    interface SwitchNodes {
      readonly split: { readonly branches: number };
    }
    const dynamic = createGraphSchema<SwitchNodes, Edges>({
      id: 'dynamic',
      nodes: {
        split: {
          kind: 'split',
          render: nothing,
          defaultData: { branches: 1 },
          measure: { width: 172, minHeight: 48 },
          ports: (data) => [
            { id: 'in', side: 'left' as const, direction: 'in' as const },
            ...Array.from({ length: data.branches }, (_, i) => ({
              id: `out${i}`,
              side: 'right' as const,
              direction: 'out' as const,
            })),
          ],
        },
      },
      edges: { flow: { kind: 'flow', defaultData: {} } },
      rules: defaultRules,
    });
    const doc: GraphDocument<SwitchNodes, Edges> = {
      version: 1,
      nodes: [
        { id: 'a', kind: 'split', position: { x: 0, y: 0 }, data: { branches: 3 } },
        { id: 'b', kind: 'split', position: { x: 0, y: 0 }, data: { branches: 1 } },
      ],
      edges: [],
    };
    const reach = (port: string) =>
      validateConnection({
        document: doc,
        schema: dynamic,
        source: { node: 'a', port },
        target: { node: 'b', port: 'in' },
      });
    // out2 exists on a 3-branch node...
    expect(reach('out2')).toEqual({ ok: true });
    // ...and out9 does not, on the same kind.
    expect(reach('out9')).toEqual(expect.objectContaining({ ok: false, code: 'unknown-port' }));
  });
});
