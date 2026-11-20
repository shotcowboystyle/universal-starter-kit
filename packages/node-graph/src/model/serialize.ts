/**
 * Serialization, design §4.6.
 *
 * Two properties carry the weight. `parseDocument` NEVER throws: a corrupt
 * document renders an `EmptyState`, never a blank WebView, and on native there
 * is no console to find the exception in. And the output is canonical —
 * geometry rounded to 2 dp, document keys in a declared order, consumer payload
 * keys sorted — so the same graph saved twice produces the same bytes and a
 * change is a readable diff rather than a whole-file rewrite.
 */

/*
 * This module IS the I/O boundary: it parses untrusted JSON into the domain
 * type and emits the canonical wire form. Inspecting `unknown` with `typeof`,
 * open string-keyed records for wire rows, and helpers that take `unknown` are
 * the parsing itself, so the anti-slop "parse at the boundary" rules misfire here.
 */
/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type, anti-slop/no-known-value-widening */

import type {
  DocumentProblem,
  DocumentSchema,
  EdgeKindDefs,
  GraphDocument,
  GraphEdgeOf,
  GraphNodeOf,
  JsonValue,
  NodeKindDefs,
  Result,
  Size,
  Viewport,
  XY,
} from './document';

export interface ParseOptions {
  /**
   * Drop nodes and edges whose kind the schema does not know, instead of
   * refusing the document. For a read-only viewer that would rather show most
   * of the graph than nothing. Edges left dangling by a dropped node are
   * dropped with it — a graph with an edge pointing at nothing is not a
   * partial render, it is a broken one.
   */
  readonly dropUnknownKinds?: boolean;
}

const documentVersion = 1;

/**
 * 2 dp via the decimal string, not `Math.round(v * 100) / 100`.
 *
 * The two disagree, and the disagreement is measured in `serialize.test.ts`.
 * 190.005 is stored as 190.00499999999999545; `toFixed` reads that and gives
 * 190, while the multiply rounds a second time and gives 190.01. `toFixed`
 * follows the number actually held, so the output depends only on the value and
 * not on the arithmetic that produced it. Canonical output needs exactly that.
 */
const round2 = (value: number): number => {
  const rounded = Number(value.toFixed(2));
  // -0 serializes as `-0` and compares equal to 0, so two structurally equal
  // documents could differ by a sign that means nothing. Normalize it away.
  return Object.is(rounded, -0) ? 0 : rounded;
};

const roundXY = (value: XY): XY => ({ x: round2(value.x), y: round2(value.y) });

/** Consumer payloads have no declared key order, so canonical order is sorted. */
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  // SAFETY: non-null, non-array object (checked above); reading own keys as unknown is always sound.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- object -> string-keyed record of unknown loses nothing
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).toSorted()) {
    out[key] = canonical(source[key]);
  }
  return out;
};

/**
 * Emits the document's own keys in a declared order and everything below them
 * canonically. `JSON.stringify` walks insertion order, so the order below IS
 * the format.
 */
export const serializeDocument = <N extends NodeKindDefs, E extends EdgeKindDefs>(doc: GraphDocument<N, E>): string => {
  const out: Record<string, unknown> = { version: doc.version };
  out.nodes = doc.nodes.map((node) => {
    const row: Record<string, unknown> = {
      id: node.id,
      kind: node.kind,
      position: roundXY(node.position),
      data: canonical(node.data),
    };
    if (node.size) {
      row.size = { width: round2(node.size.width), height: round2(node.size.height) };
    }
    if (node.parent !== undefined) {
      row.parent = node.parent;
    }
    if (node.locked !== undefined) {
      row.locked = node.locked;
    }
    return row;
  });
  out.edges = doc.edges.map((edge) => {
    const row: Record<string, unknown> = {
      id: edge.id,
      kind: edge.kind,
      source: { node: edge.source.node, port: edge.source.port },
      target: { node: edge.target.node, port: edge.target.port },
      data: canonical(edge.data),
    };
    if (edge.label !== undefined) {
      row.label = edge.label;
    }
    return row;
  });
  if (doc.viewport) {
    out.viewport = {
      x: round2(doc.viewport.x),
      y: round2(doc.viewport.y),
      zoom: round2(doc.viewport.zoom),
    };
  }
  if (doc.meta) {
    out.meta = canonical(doc.meta);
  }
  return JSON.stringify(out, null, 2);
};

interface Collector {
  readonly problems: DocumentProblem[];
}

const NOT_AN_OBJECT = 'not-an-object';
const NOT_A_FINITE_NUMBER = 'not-a-finite-number';

const fail = (collector: Collector, path: string, code: string, message: string): void => {
  collector.problems.push({ path, code, message });
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readFinite = (value: unknown, path: string, collector: Collector): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(collector, path, NOT_A_FINITE_NUMBER, 'expected a finite number');
    return undefined;
  }
  return value;
};

const readXY = (value: unknown, path: string, collector: Collector): XY | undefined => {
  if (!isPlainObject(value)) {
    fail(collector, path, NOT_AN_OBJECT, 'expected an object with numeric x and y');
    return undefined;
  }
  const x = readFinite(value.x, `${path}.x`, collector);
  const y = readFinite(value.y, `${path}.y`, collector);
  return x === undefined || y === undefined ? undefined : { x: round2(x), y: round2(y) };
};

const readSize = (value: unknown, path: string, collector: Collector): Size | undefined => {
  if (!isPlainObject(value)) {
    fail(collector, path, NOT_AN_OBJECT, 'expected an object with numeric width and height');
    return undefined;
  }
  const width = readFinite(value.width, `${path}.width`, collector);
  const height = readFinite(value.height, `${path}.height`, collector);
  return width === undefined || height === undefined ? undefined : { width: round2(width), height: round2(height) };
};

const readViewport = (value: unknown, collector: Collector): Viewport | undefined => {
  const xy = readXY(value, 'viewport', collector);
  const zoom = readFinite(isPlainObject(value) ? value.zoom : undefined, 'viewport.zoom', collector);
  if (zoom === undefined) {
    return undefined;
  }
  return xy ? { ...xy, zoom: round2(zoom) } : undefined;
};

const readString = (
  source: Record<string, unknown>,
  key: string,
  path: string,
  collector: Collector,
): string | undefined => {
  const value = source[key];
  if (typeof value !== 'string' || value.length === 0) {
    fail(collector, `${path}.${key}`, 'not-a-non-empty-string', 'expected a non-empty string');
    return undefined;
  }
  return value;
};

const readPortRef = (
  value: unknown,
  path: string,
  collector: Collector,
): { node: string; port: string } | undefined => {
  if (!isPlainObject(value)) {
    fail(collector, path, NOT_AN_OBJECT, 'expected { node, port }');
    return undefined;
  }
  const node = readString(value, 'node', path, collector);
  const port = readString(value, 'port', path, collector);
  return node !== undefined && port !== undefined ? { node, port } : undefined;
};

interface ReadContext {
  readonly collector: Collector;
  readonly drop: boolean;
  readonly nodeKinds: ReadonlySet<string>;
  readonly edgeKinds: ReadonlySet<string>;
  readonly nodeIds: Set<string>;
  readonly edgeIds: Set<string>;
}

const readNode = <N extends NodeKindDefs>(
  entry: unknown,
  index: number,
  ctx: ReadContext,
): GraphNodeOf<N> | undefined => {
  const { collector } = ctx;
  const path = `nodes[${index}]`;
  if (!isPlainObject(entry)) {
    fail(collector, path, NOT_AN_OBJECT, 'expected a node object');
    return undefined;
  }
  const id = readString(entry, 'id', path, collector);
  const kind = readString(entry, 'kind', path, collector);
  const position = readXY(entry.position, `${path}.position`, collector);
  if (kind !== undefined && !ctx.nodeKinds.has(kind)) {
    if (!ctx.drop) {
      fail(collector, `${path}.kind`, 'unknown-node-kind', `the schema has no node kind ${JSON.stringify(kind)}`);
    }
    return undefined;
  }
  if (!('data' in entry)) {
    fail(collector, `${path}.data`, 'missing-field', "a node carries its kind's data");
  }
  if (id !== undefined && ctx.nodeIds.has(id)) {
    fail(collector, `${path}.id`, 'duplicate-id', `node id ${JSON.stringify(id)} is used twice`);
  }
  const size = 'size' in entry ? readSize(entry.size, `${path}.size`, collector) : undefined;
  if (id === undefined || kind === undefined || position === undefined) {
    return undefined;
  }
  ctx.nodeIds.add(id);
  const node: Record<string, unknown> = { id, kind, position, data: entry.data };
  if (size) {
    node.size = size;
  }
  if (typeof entry.parent === 'string') {
    node.parent = entry.parent;
  }
  if (typeof entry.locked === 'boolean') {
    node.locked = entry.locked;
  }
  // SAFETY: id, kind (known to the schema) and position are validated above; `data` is the consumer's payload, which the document format does not validate.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- validated wire row -> domain node
  return node as GraphNodeOf<N>;
};

const readEdge = <E extends EdgeKindDefs>(
  entry: unknown,
  index: number,
  ctx: ReadContext,
): GraphEdgeOf<E> | undefined => {
  const { collector } = ctx;
  const path = `edges[${index}]`;
  if (!isPlainObject(entry)) {
    fail(collector, path, NOT_AN_OBJECT, 'expected an edge object');
    return undefined;
  }
  const id = readString(entry, 'id', path, collector);
  const kind = readString(entry, 'kind', path, collector);
  const source = readPortRef(entry.source, `${path}.source`, collector);
  const target = readPortRef(entry.target, `${path}.target`, collector);
  if (kind !== undefined && !ctx.edgeKinds.has(kind)) {
    if (!ctx.drop) {
      fail(collector, `${path}.kind`, 'unknown-edge-kind', `the schema has no edge kind ${JSON.stringify(kind)}`);
    }
    return undefined;
  }
  if (!('data' in entry)) {
    fail(collector, `${path}.data`, 'missing-field', "an edge carries its kind's data");
  }
  if (id !== undefined && ctx.edgeIds.has(id)) {
    fail(collector, `${path}.id`, 'duplicate-id', `edge id ${JSON.stringify(id)} is used twice`);
  }
  for (const [end, ref] of [
    ['source', source],
    ['target', target],
  ] as const) {
    if (ref && !ctx.nodeIds.has(ref.node)) {
      // Under dropUnknownKinds the node may have been dropped on purpose,
      // so the edge goes with it instead of reporting.
      if (ctx.drop) {
        return undefined;
      }
      fail(
        collector,
        `${path}.${end}.node`,
        'dangling-edge-endpoint',
        `no node ${JSON.stringify(ref.node)} in this document`,
      );
    }
  }
  if (id === undefined || kind === undefined || source === undefined || target === undefined) {
    return undefined;
  }
  ctx.edgeIds.add(id);
  const edge: Record<string, unknown> = { id, kind, source, target, data: entry.data };
  if (typeof entry.label === 'string') {
    edge.label = entry.label;
  }
  // SAFETY: id, kind (known to the schema) and both endpoints (existing nodes) are validated above; `data` is the consumer's payload.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- validated wire row -> domain edge
  return edge as GraphEdgeOf<E>;
};

const readList = <T>(
  value: unknown,
  key: 'nodes' | 'edges',
  ctx: ReadContext,
  readOne: (entry: unknown, index: number, ctx: ReadContext) => T | undefined,
): T[] => {
  const out: T[] = [];
  if (!Array.isArray(value)) {
    fail(ctx.collector, key, 'not-an-array', `expected an array of ${key}`);
    return out;
  }
  for (const [index, entry] of value.entries()) {
    const item = readOne(entry, index, ctx);
    if (item !== undefined) {
      out.push(item);
    }
  }
  return out;
};

const readMeta = (value: unknown, collector: Collector): Readonly<Record<string, JsonValue>> | undefined => {
  if (!isPlainObject(value)) {
    fail(collector, 'meta', NOT_AN_OBJECT, 'meta is a JSON object');
    return undefined;
  }
  // SAFETY: the document came from JSON.parse (or is a caller-supplied JSON object), so every value under a plain object is JSON.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- JSON-origin object -> JsonValue record
  return value as Readonly<Record<string, JsonValue>>;
};

const parseUnsafe = <N extends NodeKindDefs, E extends EdgeKindDefs>(
  raw: unknown,
  schema: DocumentSchema<N, E>,
  options: ParseOptions,
): Result<GraphDocument<N, E>, readonly DocumentProblem[]> => {
  const collector: Collector = { problems: [] };
  let value: unknown = raw;

  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch (error) {
      return {
        ok: false,
        error: [
          {
            path: '',
            code: 'invalid-json',
            message: error instanceof Error ? error.message : 'could not be parsed as JSON',
          },
        ],
      };
    }
  }

  if (!isPlainObject(value)) {
    return {
      ok: false,
      error: [{ path: '', code: NOT_AN_OBJECT, message: 'a document is a JSON object' }],
    };
  }

  if (value.version !== documentVersion) {
    fail(
      collector,
      'version',
      'unsupported-version',
      `expected version ${documentVersion}, got ${JSON.stringify(value.version)}`,
    );
  }

  const ctx: ReadContext = {
    collector,
    drop: options.dropUnknownKinds === true,
    nodeKinds: new Set(Object.keys(schema.nodes)),
    edgeKinds: new Set(Object.keys(schema.edges)),
    nodeIds: new Set<string>(),
    edgeIds: new Set<string>(),
  };

  const nodes = readList(value.nodes, 'nodes', ctx, readNode<N>);
  const edges = readList(value.edges, 'edges', ctx, readEdge<E>);
  const viewport = value.viewport === undefined ? undefined : readViewport(value.viewport, collector);
  const meta = value.meta === undefined ? undefined : readMeta(value.meta, collector);

  if (collector.problems.length > 0) {
    return { ok: false, error: collector.problems };
  }

  const doc: Record<string, unknown> = { version: documentVersion, nodes, edges };
  if (viewport) {
    doc.viewport = viewport;
  }
  if (meta) {
    doc.meta = meta;
  }
  // SAFETY: version, nodes, edges, viewport and meta were each validated above and no problems were collected.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- an open record does not overlap GraphDocument enough for a single assertion
  return { ok: true, value: doc as unknown as GraphDocument<N, E> };
};

/**
 * Never throws. Every path out of this function is a `Result`, including the
 * one where something below it does throw.
 *
 * `raw` is either a JSON string or an already-parsed value.
 */
export const parseDocument = <N extends NodeKindDefs, E extends EdgeKindDefs>(
  raw: unknown,
  schema: DocumentSchema<N, E>,
  options: ParseOptions = {},
): Result<GraphDocument<N, E>, readonly DocumentProblem[]> => {
  try {
    return parseUnsafe<N, E>(raw, schema, options);
  } catch (error) {
    // A bug here must still not take the canvas down. It reports as a problem
    // like any other and the caller renders an EmptyState.
    return {
      ok: false,
      error: [
        {
          path: '',
          code: 'internal-error',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
};
