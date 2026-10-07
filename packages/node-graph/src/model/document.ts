/**
 * The document. Types only — no React, no DOM, no `@xyflow`, no runtime.
 *
 * Design §4.1 and §4.2. This is what a server, a CLI, a Frappe hook or the CI
 * bench imports when it wants the shape of a graph and nothing else.
 */

/**
 * Ids are deliberately unbranded. They cross a JSON bridge, become React keys
 * and CSS selectors, and a cast at every wire boundary would be noise.
 * `PortRef` already removes the bug branding would have caught.
 */
export type NodeId = string;
export type EdgeId = string;
export type PortId = string;

export interface XY {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Rect extends XY, Size {}

export interface Viewport extends XY {
  readonly zoom: number;
}

/** The struct is what prevents id confusion, so ids stay plain strings. */
export interface PortRef {
  readonly node: NodeId;
  readonly port: PortId;
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/**
 * A literal, on purpose. Bumping it to `2` is a compile error at every
 * construction site in the repo, which is the review moment a schema change
 * deserves. There is no migration chain in v1 because there is nothing to
 * migrate from, and a speculative one is the kind of generality that rots.
 */
export type GraphDocumentVersion = 1;

export type NodeKindDefs = Record<string, unknown>;
export type EdgeKindDefs = Record<string, unknown>;

export type GraphNodeOf<N extends NodeKindDefs> = {
  [K in keyof N & string]: {
    readonly id: NodeId;
    readonly kind: K;
    readonly position: XY;
    readonly data: N[K];
    /** Seeded from `NodeKindSpec.measure` + resolved knobs BEFORE first paint. */
    readonly size?: Size;
    readonly parent?: NodeId;
    readonly locked?: boolean;
  };
}[keyof N & string];

export type GraphEdgeOf<E extends EdgeKindDefs> = {
  [K in keyof E & string]: {
    readonly id: EdgeId;
    readonly kind: K;
    readonly source: PortRef;
    readonly target: PortRef;
    readonly data: E[K];
    readonly label?: string;
  };
}[keyof E & string];

export interface GraphDocument<N extends NodeKindDefs, E extends EdgeKindDefs> {
  readonly version: GraphDocumentVersion;
  readonly nodes: readonly GraphNodeOf<N>[];
  readonly edges: readonly GraphEdgeOf<E>[];
  readonly viewport?: Viewport;
  readonly meta?: Readonly<Record<string, JsonValue>>;
}

/**
 * The slice of a schema `parseDocument` actually reads: which kinds exist.
 *
 * Design §4.6 writes `parseDocument(raw, schema: GraphSchema<N, E>)`, and that
 * call shape is unchanged — task 1.3's `GraphSchema` extends this. The split
 * exists because parsing needs kind NAMES and nothing else: no `render`, no
 * `measure`, no rules. So `serialize.ts` does not have to import a module full
 * of React component types to check that `"wormhole"` is not a node kind, and
 * the model's serialization half stays importable on its own.
 *
 * `__types` is phantom. It is never read at runtime; it exists so `N` and `E`
 * flow from the schema into the parsed document's type.
 */
export interface DocumentSchema<N extends NodeKindDefs = NodeKindDefs, E extends EdgeKindDefs = EdgeKindDefs> {
  readonly nodes: Readonly<Record<string, unknown>>;
  readonly edges: Readonly<Record<string, unknown>>;
  readonly __types?: { readonly nodes: N; readonly edges: E };
}

/** One thing wrong with a document, and where. */
export interface DocumentProblem {
  /** A JSON-ish path into the input, e.g. `nodes[1].position.x`. */
  readonly path: string;
  /** Stable, machine-readable. Messages are for humans and may be reworded. */
  readonly code: string;
  readonly message: string;
}

export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };
