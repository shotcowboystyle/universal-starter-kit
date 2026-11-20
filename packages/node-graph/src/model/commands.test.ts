/**
 * Commands and their inverses, design §4.5.
 *
 * The journal stores inverse COMMANDS, not snapshots: at 200 nodes a snapshot
 * is ~70 KB and a hundred of them is 7 MB of retained JSON for nothing. That
 * only works if every inverse is exact, so the property below is checked for
 * every variant of the union — including array ORDER, because React Flow
 * paints later nodes on top and a restore that reorders them is a visible
 * change the user did not ask for.
 */

import { describe, expect, it } from 'vitest';

import { applyCommand, invertCommand } from './commands';
import type { GraphCommand } from './commands';
import type { GraphDocument } from './document';

// oxlint-disable-next-line typescript/consistent-type-definitions -- must stay an alias: interfaces lack the implicit index signature the NodeKindDefs/EdgeKindDefs constraint needs
type Nodes = {
  readonly task: { readonly title: string };
};
// oxlint-disable-next-line typescript/consistent-type-definitions -- must stay an alias: interfaces lack the implicit index signature the NodeKindDefs/EdgeKindDefs constraint needs
type Edges = {
  readonly flow: { readonly weight: number };
};
type Doc = GraphDocument<Nodes, Edges>;

const node = (id: string, x: number, title = id) =>
  ({ id, kind: 'task', position: { x, y: 0 }, data: { title } }) as const;

const edge = (id: string, from: string, to: string, weight = 1) =>
  ({
    id,
    kind: 'flow',
    source: { node: from, port: 'out' },
    target: { node: to, port: 'in' },
    data: { weight },
  }) as const;

const doc: Doc = {
  version: 1,
  nodes: [node('a', 0), node('b', 100), node('c', 200)],
  edges: [edge('ab', 'a', 'b'), edge('bc', 'b', 'c')],
  viewport: { x: 0, y: 0, zoom: 1 },
  meta: { schemaId: 'demo' },
};

/** One of every variant of the union, so the round trip covers all nine. */
const variants = {
  addNodes: { t: 'addNodes', nodes: [node('d', 300)] },
  addNodesAt: { t: 'addNodes', nodes: [node('d', 300)], at: 1 },
  removeNodes: { t: 'removeNodes', ids: ['b'] },
  removeFirstAndLastNode: { t: 'removeNodes', ids: ['a', 'c'] },
  moveNodes: { t: 'moveNodes', deltas: { a: { x: 5, y: -5 }, c: { x: 1, y: 1 } } },
  setPositions: { t: 'setPositions', positions: { a: { x: 42, y: 42 } } },
  setNodeData: { t: 'setNodeData', id: 'b', data: { title: 'renamed' } },
  addEdges: { t: 'addEdges', edges: [edge('ac', 'a', 'c')] },
  addEdgesAt: { t: 'addEdges', edges: [edge('ac', 'a', 'c')], at: 0 },
  removeEdges: { t: 'removeEdges', ids: ['ab'] },
  setEdgeData: { t: 'setEdgeData', id: 'ab', data: { weight: 9 } },
  batch: {
    t: 'batch',
    commands: [
      { t: 'removeNodes', ids: ['a'] },
      { t: 'moveNodes', deltas: { b: { x: 10, y: 10 } } },
      { t: 'addNodes', nodes: [node('z', 999)] },
      { t: 'setEdgeData', id: 'bc', data: { weight: 3 } },
    ],
  },
  emptyBatch: { t: 'batch', commands: [] },
  // A batch whose second step depends on what the first one did. Inverting
  // every step against the ORIGINAL document passes every other variant here,
  // so without this one that bug ships.
  orderSensitiveBatch: {
    t: 'batch',
    commands: [
      { t: 'moveNodes', deltas: { a: { x: 5, y: 0 } } },
      { t: 'setPositions', positions: { a: { x: 99, y: 99 } } },
    ],
  },
} satisfies Record<string, GraphCommand<Nodes, Edges>>;

describe('applyCommand(doc, invertCommand(doc, c)) restores doc', () => {
  it.each(Object.entries(variants))('%s', (_name, command) => {
    const changed = applyCommand(doc, command);
    const restored = applyCommand(changed, invertCommand(doc, command));
    expect(restored).toStrictEqual(doc);
    // Order, not just membership. `toEqual` on an array is ordered, so this
    // is really asserting the ids line up index by index.
    expect(restored.nodes.map((n) => n.id)).toStrictEqual(['a', 'b', 'c']);
    expect(restored.edges.map((e) => e.id)).toStrictEqual(['ab', 'bc']);
  });

  it('actually changed something first, so the round trip is not vacuous', () => {
    for (const [name, command] of Object.entries(variants)) {
      if (name === 'emptyBatch') {
        continue;
      }
      expect(applyCommand(doc, command), name).not.toStrictEqual(doc);
    }
  });
});

describe('removeNodes', () => {
  it('takes the attached edges with it, rather than leaving them dangling', () => {
    const after = applyCommand(doc, { t: 'removeNodes', ids: ['b'] });
    expect(after.nodes.map((n) => n.id)).toStrictEqual(['a', 'c']);
    expect(after.edges).toStrictEqual([]);
  });

  it('restores those edges, in their original places', () => {
    const command: GraphCommand<Nodes, Edges> = { t: 'removeNodes', ids: ['b'] };
    const restored = applyCommand(applyCommand(doc, command), invertCommand(doc, command));
    expect(restored.edges.map((e) => e.id)).toStrictEqual(['ab', 'bc']);
  });
});

describe('moveNodes', () => {
  it('carries deltas, so two moves compose by addition', () => {
    const once = applyCommand(doc, { t: 'moveNodes', deltas: { a: { x: 5, y: 3 } } });
    const twice = applyCommand(once, { t: 'moveNodes', deltas: { a: { x: 2, y: -1 } } });
    expect(twice.nodes[0].position).toStrictEqual({ x: 7, y: 2 });
  });

  it('inverts to the negated deltas', () => {
    expect(invertCommand(doc, { t: 'moveNodes', deltas: { a: { x: 5, y: 3 } } })).toStrictEqual({
      t: 'moveNodes',
      deltas: { a: { x: -5, y: -3 } },
    });
  });

  it('negates a zero component to 0, not -0', () => {
    // `-0` is what `-v` gives, and `Object.is(-0, 0)` is false, so the inverse
    // of a purely horizontal drag would not compare equal to the same command
    // written by hand. Found by `toEqual`, which does see the sign.
    const inverse = invertCommand(doc, { t: 'moveNodes', deltas: { a: { x: 5, y: 0 } } });
    expect(inverse).toStrictEqual({ t: 'moveNodes', deltas: { a: { x: -5, y: 0 } } });
    if (inverse.t !== 'moveNodes') {
      return;
    }
    expect(Object.is(inverse.deltas.a.y, 0)).toBe(true);
  });

  it('ignores an id the document does not have', () => {
    expect(applyCommand(doc, { t: 'moveNodes', deltas: { ghost: { x: 1, y: 1 } } })).toStrictEqual(doc);
  });
});

describe('setPositions', () => {
  it('carries absolutes, and inverts to the PRIOR absolutes', () => {
    // That is what makes one undo restore a whole pre-layout arrangement.
    expect(invertCommand(doc, { t: 'setPositions', positions: { a: { x: 42, y: 42 } } })).toStrictEqual({
      t: 'setPositions',
      positions: { a: { x: 0, y: 0 } },
    });
  });
});

describe('batch', () => {
  it('inverts in reverse order, each step against the document it will meet', () => {
    // Removing `a` and then moving `b` cannot be undone by moving `b` and then
    // re-adding `a` in the same order — the inverse list runs backwards.
    const command = variants.batch;
    const inverse = invertCommand(doc, command);
    expect(inverse.t).toBe('batch');
    if (inverse.t !== 'batch') {
      return;
    }
    expect(inverse.commands.map((c) => c.t)).toStrictEqual(['setEdgeData', 'removeNodes', 'moveNodes', 'batch']);
  });

  it('is not defeated by a nested batch', () => {
    const nested: GraphCommand<Nodes, Edges> = {
      t: 'batch',
      commands: [
        { t: 'batch', commands: [{ t: 'removeNodes', ids: ['a'] }] },
        { t: 'moveNodes', deltas: { c: { x: 1, y: 1 } } },
      ],
    };
    expect(applyCommand(applyCommand(doc, nested), invertCommand(doc, nested))).toStrictEqual(doc);
  });
});

describe('data commands', () => {
  it('replaces node data rather than merging it', () => {
    const after = applyCommand(doc, { t: 'setNodeData', id: 'b', data: { title: 'x' } });
    expect(after.nodes[1].data).toStrictEqual({ title: 'x' });
  });

  it('inverts a missing id to a no-op, instead of inventing prior data', () => {
    expect(invertCommand(doc, { t: 'setNodeData', id: 'ghost', data: {} })).toStrictEqual({
      t: 'batch',
      commands: [],
    });
    expect(invertCommand(doc, { t: 'setEdgeData', id: 'ghost', data: {} })).toStrictEqual({
      t: 'batch',
      commands: [],
    });
  });
});

describe('applyCommand leaves the input alone', () => {
  it('does not mutate the document it was given', () => {
    const before = JSON.stringify(doc);
    applyCommand(doc, variants.batch);
    applyCommand(doc, variants.removeNodes);
    applyCommand(doc, variants.moveNodes);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('keeps viewport and meta across every variant', () => {
    for (const [name, command] of Object.entries(variants)) {
      const after = applyCommand(doc, command);
      expect(after.viewport, name).toStrictEqual(doc.viewport);
      expect(after.meta, name).toStrictEqual(doc.meta);
    }
  });
});
