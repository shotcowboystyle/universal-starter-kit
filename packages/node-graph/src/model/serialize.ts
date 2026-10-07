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
 * The two disagree, and the disagreement is measured in `serialize.spec.ts`.
 * 190.005 is stored as 190.00499999999999545; `toFixed` reads that and gives
 * 190, while the multiply rounds a second time and gives 190.01. `toFixed`
 * follows the number actually held, so the output depends only on the value and
 * not on the arithmetic that produced it. Canonical output needs exactly that.
 */
function round2(value: number): number {
  const rounded = Number(value.toFixed(2));
  // -0 serializes as `-0` and compares equal to 0, so two structurally equal
  // documents could differ by a sign that means nothing. Normalise it away.
  return Object.is(rounded, -0) ? 0 : rounded;
}

function roundXY(value: XY): XY {
  return { x: round2(value.x), y: round2(value.y) };
}

/** Consumer payloads have no declared key order, so canonical order is sorted. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    out[key] = canonical(source[key]);
  }
  return out;
}

/**
 * Emits the document's own keys in a declared order and everything below them
 * canonically. `JSON.stringify` walks insertion order, so the order below IS
 * the format.
 */
export function serializeDocument<N extends NodeKindDefs, E extends EdgeKindDefs>(doc: GraphDocument<N, E>): string {
  const out: Record<string, unknown> = { version: doc.version };
  out.nodes = doc.nodes.map((node) => {
    const shaped: Record<string, unknown> = {
      id: node.id,
      kind: node.kind,
      position: roundXY(node.position),
      data: canonical(node.data),
    };
    if (node.size) {
      shaped.size = { width: round2(node.size.width), height: round2(node.size.height) };
    }
    if (node.parent !== undefined) {
      shaped.parent = node.parent;
    }
    if (node.locked !== undefined) {
      shaped.locked = node.locked;
    }
    return shaped;
  });
  out.edges = doc.edges.map((edge) => {
    const shaped: Record<string, unknown> = {
      id: edge.id,
      kind: edge.kind,
      source: { node: edge.source.node, port: edge.source.port },
      target: { node: edge.target.node, port: edge.target.port },
      data: canonical(edge.data),
    };
    if (edge.label !== undefined) {
      shaped.label = edge.label;
    }
    return shaped;
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
}

interface Collector {
  readonly problems: DocumentProblem[];
}

function fail(collector: Collector, path: string, code: string, message: string): void {
  collector.problems.push({ path, code, message });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readXY(value: unknown, path: string, collector: Collector): XY | undefined {
  if (!isPlainObject(value)) {
    fail(collector, path, 'not-an-object', 'expected an object with numeric x and y');
    return undefined;
  }
  let ok = true;
  for (const axis of ['x', 'y'] as const) {
    if (typeof value[axis] !== 'number' || !Number.isFinite(value[axis])) {
      fail(collector, `${path}.${axis}`, 'not-a-finite-number', `expected a finite number`);
      ok = false;
    }
  }
  return ok ? { x: round2(value.x as number), y: round2(value.y as number) } : undefined;
}

function readSize(value: unknown, path: string, collector: Collector): Size | undefined {
  if (!isPlainObject(value)) {
    fail(collector, path, 'not-an-object', 'expected an object with numeric width and height');
    return undefined;
  }
  let ok = true;
  for (const axis of ['width', 'height'] as const) {
    if (typeof value[axis] !== 'number' || !Number.isFinite(value[axis])) {
      fail(collector, `${path}.${axis}`, 'not-a-finite-number', `expected a finite number`);
      ok = false;
    }
  }
  return ok ? { width: round2(value.width as number), height: round2(value.height as number) } : undefined;
}

function readViewport(value: unknown, collector: Collector): Viewport | undefined {
  const xy = readXY(value, 'viewport', collector);
  const zoom = isPlainObject(value) ? value.zoom : undefined;
  if (typeof zoom !== 'number' || !Number.isFinite(zoom)) {
    fail(collector, 'viewport.zoom', 'not-a-finite-number', 'expected a finite number');
    return undefined;
  }
  return xy ? { ...xy, zoom: round2(zoom) } : undefined;
}

function readString(
  source: Record<string, unknown>,
  key: string,
  path: string,
  collector: Collector,
): string | undefined {
  const value = source[key];
  if (typeof value !== 'string' || value.length === 0) {
    fail(collector, `${path}.${key}`, 'not-a-non-empty-string', 'expected a non-empty string');
    return undefined;
  }
  return value;
}

function readPortRef(value: unknown, path: string, collector: Collector): { node: string; port: string } | undefined {
  if (!isPlainObject(value)) {
    fail(collector, path, 'not-an-object', 'expected { node, port }');
    return undefined;
  }
  const node = readString(value, 'node', path, collector);
  const port = readString(value, 'port', path, collector);
  return node !== undefined && port !== undefined ? { node, port } : undefined;
}

/**
 * Never throws. Every path out of this function is a `Result`, including the
 * one where something below it does throw.
 */
export function parseDocument<N extends NodeKindDefs, E extends EdgeKindDefs>(
  raw: string | unknown,
  schema: DocumentSchema<N, E>,
  options: ParseOptions = {},
): Result<GraphDocument<N, E>, readonly DocumentProblem[]> {
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
}

function parseUnsafe<N extends NodeKindDefs, E extends EdgeKindDefs>(
  raw: string | unknown,
  schema: DocumentSchema<N, E>,
  options: ParseOptions,
): Result<GraphDocument<N, E>, readonly DocumentProblem[]> {
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
      error: [{ path: '', code: 'not-an-object', message: 'a document is a JSON object' }],
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

  const nodeKinds = new Set(Object.keys(schema.nodes));
  const edgeKinds = new Set(Object.keys(schema.edges));
  const drop = options.dropUnknownKinds === true;

  const nodes: GraphNodeOf<N>[] = [];
  const nodeIds = new Set<string>();
  if (Array.isArray(value.nodes)) {
    value.nodes.forEach((entry, index) => {
      const path = `nodes[${index}]`;
      if (!isPlainObject(entry)) {
        fail(collector, path, 'not-an-object', 'expected a node object');
        return;
      }
      const id = readString(entry, 'id', path, collector);
      const kind = readString(entry, 'kind', path, collector);
      const position = readXY(entry.position, `${path}.position`, collector);
      if (kind !== undefined && !nodeKinds.has(kind)) {
        if (drop) {
          return;
        }
        fail(collector, `${path}.kind`, 'unknown-node-kind', `the schema has no node kind ${JSON.stringify(kind)}`);
        return;
      }
      if (!('data' in entry)) {
        fail(collector, `${path}.data`, 'missing-field', "a node carries its kind's data");
      }
      if (id !== undefined && nodeIds.has(id)) {
        fail(collector, `${path}.id`, 'duplicate-id', `node id ${JSON.stringify(id)} is used twice`);
      }
      const size = 'size' in entry ? readSize(entry.size, `${path}.size`, collector) : undefined;
      if (id === undefined || kind === undefined || position === undefined) {
        return;
      }
      nodeIds.add(id);
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
      nodes.push(node as GraphNodeOf<N>);
    });
  } else {
    fail(collector, 'nodes', 'not-an-array', 'expected an array of nodes');
  }

  const edges: GraphEdgeOf<E>[] = [];
  const edgeIds = new Set<string>();
  if (Array.isArray(value.edges)) {
    value.edges.forEach((entry, index) => {
      const path = `edges[${index}]`;
      if (!isPlainObject(entry)) {
        fail(collector, path, 'not-an-object', 'expected an edge object');
        return;
      }
      const id = readString(entry, 'id', path, collector);
      const kind = readString(entry, 'kind', path, collector);
      const source = readPortRef(entry.source, `${path}.source`, collector);
      const target = readPortRef(entry.target, `${path}.target`, collector);
      if (kind !== undefined && !edgeKinds.has(kind)) {
        if (drop) {
          return;
        }
        fail(collector, `${path}.kind`, 'unknown-edge-kind', `the schema has no edge kind ${JSON.stringify(kind)}`);
        return;
      }
      if (!('data' in entry)) {
        fail(collector, `${path}.data`, 'missing-field', "an edge carries its kind's data");
      }
      if (id !== undefined && edgeIds.has(id)) {
        fail(collector, `${path}.id`, 'duplicate-id', `edge id ${JSON.stringify(id)} is used twice`);
      }
      for (const [end, ref] of [
        ['source', source],
        ['target', target],
      ] as const) {
        if (ref && !nodeIds.has(ref.node)) {
          // Under dropUnknownKinds the node may have been dropped on purpose,
          // so the edge goes with it instead of reporting.
          if (drop) {
            return;
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
        return;
      }
      edgeIds.add(id);
      const edge: Record<string, unknown> = { id, kind, source, target, data: entry.data };
      if (typeof entry.label === 'string') {
        edge.label = entry.label;
      }
      edges.push(edge as GraphEdgeOf<E>);
    });
  } else {
    fail(collector, 'edges', 'not-an-array', 'expected an array of edges');
  }

  const viewport = value.viewport === undefined ? undefined : readViewport(value.viewport, collector);

  let meta: Readonly<Record<string, JsonValue>> | undefined;
  if (value.meta !== undefined) {
    if (isPlainObject(value.meta)) {
      meta = value.meta as Readonly<Record<string, JsonValue>>;
    } else {
      fail(collector, 'meta', 'not-an-object', 'meta is a JSON object');
    }
  }

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
  return { ok: true, value: doc as unknown as GraphDocument<N, E> };
}
