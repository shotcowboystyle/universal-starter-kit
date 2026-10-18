/**
 * Serialization is the one place a graph leaves this process, so both
 * directions are pinned here.
 *
 * The failures this catches are the ones that only show up in production. A
 * document that round-trips through a Frappe field and comes back with its
 * viewport gone. A `parseDocument` that throws on a truncated string and takes
 * the WebView with it, which is design §4.6's whole reason for returning a
 * `Result`. And a serializer whose key order follows insertion order, which
 * turns every save into a git diff nobody can read.
 */

import { describe, expect, it } from 'vitest';

import type { DocumentProblem, DocumentSchema, GraphDocument, Result } from './document';
import { parseDocument, serializeDocument } from './serialize';

// Type aliases, not interfaces: an interface has no implicit index signature,
// so `interface Nodes` does not satisfy `NodeKindDefs`. That is a TypeScript
// rule about declaration merging, not a modelling choice, and it bites every
// consumer the same way — so the spec uses the shape a consumer must use.
type Nodes = {
  readonly task: { readonly title: string; readonly retries: number };
  readonly gate: { readonly expression: string };
};

type Edges = {
  readonly flow: Record<string, never>;
  readonly error: { readonly reason: string };
};

/**
 * `parseDocument` reads only which kinds exist, so the spec can hand it the
 * kind names alone. Task 1.3's `GraphSchema` extends `DocumentSchema`, so the
 * design's `parseDocument(raw, schema)` call shape is unchanged.
 */
const schema: DocumentSchema<Nodes, Edges> = {
  nodes: { task: {}, gate: {} },
  edges: { flow: {}, error: {} },
};

function makeDocument(): GraphDocument<Nodes, Edges> {
  return {
    version: 1,
    nodes: [
      {
        id: 'n1',
        kind: 'task',
        position: { x: 12.5, y: -40.25 },
        data: { title: 'fetch', retries: 3 },
        size: { width: 190, height: 72 },
      },
      {
        id: 'n2',
        kind: 'gate',
        position: { x: 260, y: 0 },
        data: { expression: 'retries > 0' },
        parent: 'n1',
        locked: true,
      },
    ],
    edges: [
      {
        id: 'e1',
        kind: 'flow',
        source: { node: 'n1', port: 'out' },
        target: { node: 'n2', port: 'in' },
        data: {},
      },
      {
        id: 'e2',
        kind: 'error',
        source: { node: 'n1', port: 'err' },
        target: { node: 'n2', port: 'in' },
        data: { reason: 'timeout' },
        label: 'on failure',
      },
    ],
    viewport: { x: -100.5, y: 30, zoom: 0.75 },
    meta: { schemaId: 'demo', tags: ['a', 'b'], nested: { deep: true } },
  };
}

type Parsed = Result<GraphDocument<Nodes, Edges>, readonly DocumentProblem[]>;

function expectOk(result: Parsed): GraphDocument<Nodes, Edges> {
  if (!result.ok) {
    throw new Error(`expected ok, got problems: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

function expectProblems(result: Parsed): readonly DocumentProblem[] {
  if (result.ok) {
    throw new Error('expected problems, got a document');
  }
  return result.error;
}

describe('round trip', () => {
  it('restores the document exactly, viewport and meta included', () => {
    const doc = makeDocument();
    const back = expectOk(parseDocument(serializeDocument(doc), schema));
    expect(back).toEqual(doc);
    expect(back.viewport).toEqual(doc.viewport);
    expect(back.meta).toEqual(doc.meta);
  });

  it('keeps a document with no viewport and no meta free of both keys', () => {
    const doc: GraphDocument<Nodes, Edges> = { version: 1, nodes: [], edges: [] };
    const text = serializeDocument(doc);
    expect(text).not.toContain('viewport');
    expect(text).not.toContain('meta');
    expect(expectOk(parseDocument(text, schema))).toEqual(doc);
  });

  it('accepts an already-parsed object, not only a string', () => {
    const doc = makeDocument();
    const back = expectOk(parseDocument(JSON.parse(serializeDocument(doc)), schema));
    expect(back).toEqual(doc);
  });
});

describe('parseDocument never throws', () => {
  // The point of design §4.6: a corrupt document renders an EmptyState, never a
  // blank WebView. Each of these is a real shape a truncated write produces.
  const corrupt: readonly [name: string, raw: unknown][] = [
    ['a truncated object', '{'],
    ['null', null],
    ['a bare number', 42],
    ['an unsupported version', { version: 99, nodes: [], edges: [] }],
    ['the empty string', ''],
    ['an array', '[]'],
    ['nodes that are not an array', { version: 1, nodes: {}, edges: [] }],
    ['a node with no id', { version: 1, nodes: [{ kind: 'task', position: { x: 0, y: 0 } }], edges: [] }],
    [
      'a node position that is not finite',
      {
        version: 1,
        nodes: [{ id: 'a', kind: 'task', position: { x: Number.NaN, y: 0 }, data: {} }],
        edges: [],
      },
    ],
    [
      'an edge pointing at a node that is not there',
      {
        version: 1,
        nodes: [],
        edges: [
          {
            id: 'e',
            kind: 'flow',
            source: { node: 'gone', port: 'o' },
            target: { node: 'gone', port: 'i' },
            data: {},
          },
        ],
      },
    ],
  ];

  for (const [name, raw] of corrupt) {
    it(`returns problems on ${name}`, () => {
      const result = parseDocument(raw, schema);
      const problems = expectProblems(result);
      expect(problems.length).toBeGreaterThan(0);
      for (const problem of problems) {
        expect(problem.path).toBeTypeOf('string');
        expect(problem.code).toBeTruthy();
        expect(problem.message).toBeTruthy();
      }
    });
  }

  it('names the failing version with a path', () => {
    const problems = expectProblems(parseDocument({ version: 99, nodes: [], edges: [] }, schema));
    expect(problems).toContainEqual(expect.objectContaining({ path: 'version', code: 'unsupported-version' }));
  });

  it('names the failing node by index, not just by id', () => {
    const problems = expectProblems(
      parseDocument(
        {
          version: 1,
          nodes: [
            { id: 'ok', kind: 'task', position: { x: 0, y: 0 }, data: {} },
            { id: 'bad', kind: 'task', position: { x: '0', y: 0 }, data: {} },
          ],
          edges: [],
        },
        schema,
      ),
    );
    expect(problems).toContainEqual(expect.objectContaining({ path: 'nodes[1].position.x' }));
  });
});

describe('unknown kinds', () => {
  const withUnknown = {
    version: 1,
    nodes: [
      { id: 'n1', kind: 'task', position: { x: 0, y: 0 }, data: { title: 'a', retries: 0 } },
      { id: 'n2', kind: 'wormhole', position: { x: 10, y: 10 }, data: {} },
    ],
    edges: [
      {
        id: 'e1',
        kind: 'flow',
        source: { node: 'n1', port: 'out' },
        target: { node: 'n2', port: 'in' },
        data: {},
      },
    ],
  };

  it('refuses by default, with the path of the offending node', () => {
    const problems = expectProblems(parseDocument(withUnknown, schema));
    expect(problems).toContainEqual(expect.objectContaining({ path: 'nodes[1].kind', code: 'unknown-node-kind' }));
  });

  it('drops the node under dropUnknownKinds', () => {
    const doc = expectOk(parseDocument(withUnknown, schema, { dropUnknownKinds: true }));
    expect(doc.nodes.map((n) => n.id)).toEqual(['n1']);
  });

  it('drops the edges left dangling by a dropped node, rather than emitting a broken graph', () => {
    const doc = expectOk(parseDocument(withUnknown, schema, { dropUnknownKinds: true }));
    expect(doc.edges).toEqual([]);
  });

  it('drops an unknown EDGE kind under the flag and refuses it without', () => {
    const raw = {
      version: 1,
      nodes: [{ id: 'n1', kind: 'task', position: { x: 0, y: 0 }, data: { title: 'a', retries: 0 } }],
      edges: [
        {
          id: 'e1',
          kind: 'telepathy',
          source: { node: 'n1', port: 'o' },
          target: { node: 'n1', port: 'i' },
          data: {},
        },
      ],
    };
    expect(expectProblems(parseDocument(raw, schema))).toContainEqual(
      expect.objectContaining({ path: 'edges[0].kind', code: 'unknown-edge-kind' }),
    );
    expect(expectOk(parseDocument(raw, schema, { dropUnknownKinds: true })).edges).toEqual([]);
  });
});

describe('numbers', () => {
  it('rounds geometry to 2 dp', () => {
    const doc: GraphDocument<Nodes, Edges> = {
      version: 1,
      nodes: [
        {
          id: 'n',
          kind: 'task',
          position: { x: 1.23456, y: -9.87654 },
          data: { title: 't', retries: 1 },
          size: { width: 190.567, height: 72.4449 },
        },
      ],
      edges: [],
      viewport: { x: 0.111, y: 0.999, zoom: 0.356789 },
    };
    const back = expectOk(parseDocument(serializeDocument(doc), schema));
    expect(back.nodes[0].position).toEqual({ x: 1.23, y: -9.88 });
    expect(back.nodes[0].size).toEqual({ width: 190.57, height: 72.44 });
    expect(back.viewport).toEqual({ x: 0.11, y: 1, zoom: 0.36 });
  });

  it('rounds the stored double, not a multiply of it, so the result is deterministic', () => {
    // 190.005 is stored as 190.00499999999999545, and the two obvious
    // implementations disagree about it: `Number(v.toFixed(2))` is 190 and
    // `Math.round(v * 100) / 100` is 190.01, because the multiply rounds a
    // second time. Measured, not assumed. `toFixed` is the one that follows the
    // number actually held, which is the only version of "2 dp" that cannot
    // depend on how a value got there.
    const doc: GraphDocument<Nodes, Edges> = {
      version: 1,
      nodes: [
        {
          id: 'n',
          kind: 'task',
          position: { x: 190.005, y: 2.675 },
          data: { title: 't', retries: 0 },
        },
      ],
      edges: [],
    };
    expect(expectOk(parseDocument(serializeDocument(doc), schema)).nodes[0].position).toEqual({
      x: 190,
      y: 2.67,
    });
  });

  it("leaves a consumer's own data numbers alone", () => {
    // Rounding a payload would silently corrupt it. Geometry is the package's
    // to normalise; `data` is not.
    const doc: GraphDocument<Nodes, Edges> = {
      version: 1,
      nodes: [{ id: 'n', kind: 'task', position: { x: 0, y: 0 }, data: { title: 't', retries: 3.14159 } }],
      edges: [],
    };
    const back = expectOk(parseDocument(serializeDocument(doc), schema));
    expect(back.nodes[0].data).toEqual({ title: 't', retries: 3.14159 });
  });

  it('never yields -0, so two structurally equal documents cannot differ by a sign', () => {
    // Three measurements narrow this to one real path. A literal -0 is already
    // harmless: `JSON.stringify(-0)` emits `0` and `(-0).toFixed(2)` gives
    // "0.00". A small NEGATIVE that rounds to zero is not: `(-0.001).toFixed(2)`
    // is "-0.00", which reads back as -0. And the string round trip cannot show
    // it either, because `JSON.stringify` erases the sign on the way out.
    //
    // So the path that can actually carry a -0 into a live document is
    // `parseDocument` on an already-parsed OBJECT — a graph handed over the DOM
    // bridge, never through `JSON.parse`. `Object.is(-0, 0)` is false, so that
    // node is not interchangeable with the equal one beside it, and `toEqual`
    // cannot see the difference. Hence `Object.is`.
    const back = expectOk(
      parseDocument(
        {
          version: 1,
          nodes: [
            {
              id: 'n',
              kind: 'task',
              position: { x: -0.001, y: -0 },
              data: { title: 't', retries: 0 },
            },
          ],
          edges: [],
          viewport: { x: -0.004, y: 0, zoom: 1 },
        },
        schema,
      ),
    );
    expect(Object.is(back.nodes[0].position.x, 0)).toBe(true);
    expect(Object.is(back.nodes[0].position.y, 0)).toBe(true);
    expect(Object.is(back.viewport!.x, 0)).toBe(true);
  });
});

describe('key order', () => {
  it('is stable across two serializations of structurally equal documents', () => {
    const a: GraphDocument<Nodes, Edges> = {
      version: 1,
      nodes: [{ id: 'n', kind: 'task', position: { x: 1, y: 2 }, data: { title: 't', retries: 1 } }],
      edges: [],
      meta: { alpha: 1, beta: 2 },
    };
    // Same document, every object literal written in a different key order.
    const b = {
      meta: { beta: 2, alpha: 1 },
      edges: [],
      nodes: [{ data: { retries: 1, title: 't' }, position: { y: 2, x: 1 }, kind: 'task', id: 'n' }],
      version: 1,
    } as unknown as GraphDocument<Nodes, Edges>;
    expect(serializeDocument(b)).toBe(serializeDocument(a));
  });

  it("emits the document's own keys in the declared order, not alphabetically", () => {
    const text = serializeDocument(makeDocument());
    const order = ['version', 'nodes', 'edges', 'viewport', 'meta'].map((k) => text.indexOf(`"${k}"`));
    expect(order).toEqual([...order].sort((x, y) => x - y));
    expect(order.every((i) => i >= 0)).toBe(true);
  });

  it("sorts the keys inside a consumer's own data, which has no declared order", () => {
    const doc = {
      version: 1,
      nodes: [{ id: 'n', kind: 'task', position: { x: 0, y: 0 }, data: { zeta: 1, alpha: 2 } }],
      edges: [],
    } as unknown as GraphDocument<Nodes, Edges>;
    const text = serializeDocument(doc);
    expect(text.indexOf('"alpha"')).toBeLessThan(text.indexOf('"zeta"'));
  });
});
