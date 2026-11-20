/**
 * Task 3.5. What a finger is allowed to land on.
 *
 * The claim is an EQUALITY, not a sample: `legalTargets` returns exactly the
 * ports `validateConnection` says yes to. So the oracle here is
 * `validateConnection` itself, run by brute force over every port in the
 * document, and the fixture is built so that every refusal code in design §4.4
 * is actually exercised — a set equality over a document where nothing refuses
 * is an equality between two empty filters.
 *
 * `validateConnection`, never `validateDrop`: this runs on the pointer-tick
 * path, the same one React Flow's `isValidConnection` runs on, and the O(V+E)
 * cycle rule is a `DropOnlyRule` the type refuses here (design §4.4). A puck
 * that promised a target the drop then rejected would be worse than no puck.
 */

import { describe, expect, it } from 'vitest';

import type { ConnectionRule, GraphDocument, GraphSchema, PortRef, PortSpec } from '../model/index';
import {
  createGraphSchema,
  defaultRules,
  refuseDataTypeMismatch,
  refuseDirection,
  refuseDuplicate,
  refusePortArity,
  resolvePorts,
  validateConnection,
} from '../model/index';

import { legalTargets, isLegalTarget } from './legal-targets';

// oxlint-disable-next-line typescript/consistent-type-definitions -- must stay an alias: interfaces lack the implicit index signature the NodeKindDefs/EdgeKindDefs constraint needs
type Kinds = {
  readonly emit: { readonly note: string };
  readonly relay: { readonly note: string };
  readonly sink: { readonly note: string };
  /** In and out on ONE node, so a self-loop is geometrically possible. */
  readonly loop: { readonly note: string };
};
// oxlint-disable-next-line typescript/consistent-type-definitions -- must stay an alias: interfaces lack the implicit index signature the NodeKindDefs/EdgeKindDefs constraint needs
type Edges = {
  readonly flow: Record<string, never>;
};

const noRender = (() => null) as unknown as never;

const port = (spec: PortSpec): PortSpec => spec;

/**
 * Four kinds chosen so every refusal code has a real port to refuse.
 *
 *  - `wrong-direction`: every `out` port is a candidate the enumerator offers
 *    and direction throws out.
 *  - `self-loop`: `loop` carries both an in and an out.
 *  - `port-arity`: `sink.only` is arity "one" and already taken.
 *  - `duplicate-edge`: `relay.in` already has the very edge under test.
 *  - `data-type-mismatch`: `relay.typed` takes `text`, the source emits `rows`.
 *  - `unknown-node` / `unknown-port`: a source that names neither.
 */
const schema = (rules: readonly ConnectionRule<Kinds, Edges>[] = defaultRules) =>
  createGraphSchema<Kinds, Edges>({
    id: 'legal-targets-fixture',
    nodes: {
      emit: {
        kind: 'emit',
        render: noRender,
        defaultData: { note: '' },
        measure: { width: 190, minHeight: 72 },
        ports: [port({ id: 'rows', side: 'right', direction: 'out', dataType: 'rows' })],
      },
      relay: {
        kind: 'relay',
        render: noRender,
        defaultData: { note: '' },
        measure: { width: 190, minHeight: 72 },
        ports: [
          port({ id: 'in', side: 'left', direction: 'in', arity: 'many', dataType: 'rows' }),
          port({ id: 'typed', side: 'left', direction: 'in', arity: 'many', dataType: 'text' }),
          port({ id: 'free', side: 'left', direction: 'in', arity: 'many' }),
          port({ id: 'out', side: 'right', direction: 'out', dataType: 'rows' }),
        ],
      },
      sink: {
        kind: 'sink',
        render: noRender,
        defaultData: { note: '' },
        measure: { width: 190, minHeight: 72 },
        ports: [
          port({ id: 'only', side: 'left', direction: 'in', arity: 'one', dataType: 'rows' }),
          port({ id: 'spare', side: 'left', direction: 'in', arity: 'many', dataType: 'rows' }),
        ],
      },
      loop: {
        kind: 'loop',
        render: noRender,
        defaultData: { note: '' },
        measure: { width: 190, minHeight: 72 },
        ports: [
          port({ id: 'self-in', side: 'left', direction: 'in', arity: 'many' }),
          port({ id: 'self-out', side: 'right', direction: 'out' }),
        ],
      },
    },
    edges: { flow: { kind: 'flow', defaultData: {} } },
    rules,
  });

type Doc = GraphDocument<Kinds, Edges>;

const document = (): Doc => ({
  version: 1,
  nodes: [
    { id: 'e1', kind: 'emit', position: { x: 0, y: 0 }, data: { note: '' } },
    { id: 'r1', kind: 'relay', position: { x: 260, y: 0 }, data: { note: '' } },
    { id: 's1', kind: 'sink', position: { x: 520, y: 0 }, data: { note: '' } },
    { id: 'l1', kind: 'loop', position: { x: 780, y: 0 }, data: { note: '' } },
  ],
  edges: [
    // Makes `r1.in` a DUPLICATE for a drag starting at `e1.rows`.
    {
      id: 'e1->r1',
      kind: 'flow',
      source: { node: 'e1', port: 'rows' },
      target: { node: 'r1', port: 'in' },
      data: {},
    },
    // Fills `s1.only`, whose arity is "one".
    {
      id: 'r1->s1',
      kind: 'flow',
      source: { node: 'r1', port: 'out' },
      target: { node: 's1', port: 'only' },
      data: {},
    },
  ],
});

/** Every (node, port) pair in the document, in document order. */
const everyPort = (doc: Doc, graph: GraphSchema<Kinds, Edges>): PortRef[] =>
  doc.nodes.flatMap((node) => resolvePorts(graph, node).map((spec) => ({ node: node.id, port: spec.id })));

/** The oracle: filter every port by the rule engine, directly. */
const bruteForce = (
  doc: Doc,
  graph: GraphSchema<Kinds, Edges>,
  source: PortRef,
  rules?: readonly ConnectionRule<Kinds, Edges>[],
): PortRef[] =>
  everyPort(doc, graph).filter(
    (target) => validateConnection({ document: doc, schema: graph, source, target }, rules).ok,
  );

const key = (ref: PortRef) => `${ref.node}:${ref.port}`;

describe('the fixture exercises every refusal code, or the equality below is empty', () => {
  it('produces all five tick-safe codes plus both lookup failures', () => {
    const doc = document();
    const graph = schema();
    const source: PortRef = { node: 'e1', port: 'rows' };
    const codeFor = (target: PortRef) => {
      const verdict = validateConnection({ document: doc, schema: graph, source, target });
      return verdict.ok ? 'ok' : verdict.code;
    };
    expect(codeFor({ node: 'r1', port: 'out' })).toBe('wrong-direction');
    expect(codeFor({ node: 'r1', port: 'in' })).toBe('duplicate-edge');
    expect(codeFor({ node: 'r1', port: 'typed' })).toBe('data-type-mismatch');
    expect(codeFor({ node: 's1', port: 'only' })).toBe('port-arity');
    expect(codeFor({ node: 's1', port: 'spare' })).toBe('ok');
    expect(
      validateConnection({
        document: doc,
        schema: graph,
        source: { node: 'l1', port: 'self-out' },
        target: { node: 'l1', port: 'self-in' },
      }),
    ).toMatchObject({ code: 'self-loop' });
    expect(codeFor({ node: 'nope', port: 'rows' })).toBe('unknown-node');
    expect(codeFor({ node: 'r1', port: 'nope' })).toBe('unknown-port');
  });
});

describe('legalTargets returns exactly what validateConnection accepts', () => {
  it('equals the brute-force oracle for every source port in the document', () => {
    const doc = document();
    const graph = schema();
    let checkedNonEmpty = 0;
    for (const source of everyPort(doc, graph)) {
      const expected = bruteForce(doc, graph, source).map(key);
      const actual = legalTargets({ document: doc, schema: graph, source }).map(key);
      expect(actual, `source ${key(source)}`).toStrictEqual(expected);
      if (expected.length > 0) {
        checkedNonEmpty += 1;
      }
    }
    // An equality between two empty lists proves nothing about the filter.
    expect(checkedNonEmpty).toBeGreaterThan(0);
  });

  it('accepts the untyped and the spare port, and nothing the rules refused', () => {
    const doc = document();
    const graph = schema();
    expect(legalTargets({ document: doc, schema: graph, source: { node: 'e1', port: 'rows' } }).map(key)).toStrictEqual(
      ['r1:free', 's1:spare', 'l1:self-in'],
    );
  });

  it('returns nothing for a source that is not a real port', () => {
    const doc = document();
    const graph = schema();
    expect(legalTargets({ document: doc, schema: graph, source: { node: 'nope', port: 'rows' } })).toStrictEqual([]);
    expect(legalTargets({ document: doc, schema: graph, source: { node: 'e1', port: 'nope' } })).toStrictEqual([]);
  });

  it('returns nothing for a source that is an INPUT — a connection starts at an output', () => {
    const doc = document();
    const graph = schema();
    expect(legalTargets({ document: doc, schema: graph, source: { node: 'r1', port: 'in' } })).toStrictEqual([]);
  });

  it('keeps document order, so a candidate list is stable between ticks', () => {
    const doc = document();
    const graph = schema();
    const source: PortRef = { node: 'r1', port: 'out' };
    const once = legalTargets({ document: doc, schema: graph, source }).map(key);
    const twice = legalTargets({ document: doc, schema: graph, source }).map(key);
    expect(once).toStrictEqual(twice);
    expect(once).toStrictEqual(bruteForce(doc, graph, source).map(key));
  });
});

describe('a port on the source node itself', () => {
  it('is never returned while a rule refuses self-loops', () => {
    const doc = document();
    const graph = schema();
    const targets = legalTargets({
      document: doc,
      schema: graph,
      source: { node: 'l1', port: 'self-out' },
    });
    expect(targets.some((target) => target.node === 'l1')).toBe(false);
    // …and there IS a same-node input to have returned, so the absence is the
    // rule biting rather than the fixture having nothing to offer.
    expect(everyPort(doc, graph).some((ref) => ref.node === 'l1' && ref.port === 'self-in')).toBe(true);
  });

  it("IS returned when the schema's rules allow self-loops", () => {
    const doc = document();
    // Every default rule except `refuseSelfLoop`. A schema that wants loops
    // says so by leaving the rule out; `legalTargets` has no opinion of its own.
    const graph = schema([
      refuseDirection,
      refusePortArity,
      refuseDuplicate,
      refuseDataTypeMismatch(),
    ] as readonly ConnectionRule<Kinds, Edges>[]);
    const targets = legalTargets({
      document: doc,
      schema: graph,
      source: { node: 'l1', port: 'self-out' },
    }).map(key);
    expect(targets).toContain('l1:self-in');
    expect(targets).toStrictEqual(bruteForce(doc, graph, { node: 'l1', port: 'self-out' }, graph.rules).map(key));
  });
});

describe('isLegalTarget is the same answer for one candidate', () => {
  it('agrees with legalTargets on every port in the document', () => {
    const doc = document();
    const graph = schema();
    const source: PortRef = { node: 'e1', port: 'rows' };
    const legal = new Set(legalTargets({ document: doc, schema: graph, source }).map(key));
    for (const target of everyPort(doc, graph)) {
      expect(isLegalTarget({ document: doc, schema: graph, source, target }), key(target)).toBe(legal.has(key(target)));
    }
  });

  it('says no to a candidate React Flow snapped to but the rules refuse', () => {
    // This is the magnetic case: `connectionRadius` is the 44 px hit diameter,
    // so React Flow will happily snap the drag onto a port the schema refuses.
    // The puck asks this before it names anything.
    const doc = document();
    const graph = schema();
    expect(
      isLegalTarget({
        document: doc,
        schema: graph,
        source: { node: 'e1', port: 'rows' },
        target: { node: 's1', port: 'only' },
      }),
    ).toBe(false);
  });
});
