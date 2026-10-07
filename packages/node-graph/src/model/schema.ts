/**
 * The schema, design §4.3.
 *
 * The union of node and edge kinds is generic over consumer-supplied kind maps.
 * No declaration merging, no global mutable registry of TYPES — `edge.kind ===
 * "error"` narrows `edge.data` because `E` says so, not because a `.d.ts`
 * somewhere was merged into.
 *
 * `react` appears here as a TYPE-ONLY import. It is erased, so the model still
 * carries no React at runtime, which is what `dom/importGraph.spec.ts` checks
 * and what lets a server or the CI bench import `@repo/node-graph/model`.
 */

import type { ComponentType } from 'react';

import type { ConnectionRule, DropOnlyRule } from './connect';
import type { DocumentSchema, EdgeKindDefs, GraphNodeOf, NodeId, NodeKindDefs, PortId } from './document';

export interface PortSpec {
  readonly id: PortId;
  readonly side: 'left' | 'right' | 'top' | 'bottom';
  readonly direction: 'in' | 'out';
  readonly index?: number;
  readonly label?: string;
  /** Consumer-defined payload type name; connection rules read it. */
  readonly dataType?: string;
  /** Default: "many" on out, "one" on in. */
  readonly arity?: 'one' | 'many';
}

/** Default arity, spelled once so the rules and the docs cannot drift apart. */
export function portArity(port: PortSpec): 'one' | 'many' {
  return port.arity ?? (port.direction === 'out' ? 'many' : 'one');
}

export interface GraphNodeRenderProps<TData> {
  readonly id: NodeId;
  readonly data: TData;
  readonly selected: boolean;
  readonly dragging: boolean;
  /**
   * "overview" below `overviewZoom`. On the prop type from v1 on purpose: it is
   * what stops the merged single-path edge layer being a breaking change for
   * every custom node in v1.1 (design §5).
   */
  readonly renderMode: 'detail' | 'overview';
  /** true on a touch surface: fields are display-only, taps route to the sheet. */
  readonly readOnlyFields: boolean;
  readonly ports: readonly PortSpec[];
  /**
   * The kind's own `NodeKindSpec.measure`.
   *
   * On the render props because the canvas seeds React Flow from it before
   * first paint (design §5) and the BODY has to paint the same number. Without
   * it a kind declaring a non-default width was seeded at one width and painted
   * at the per-size default — measured in the MPO-191 knob fuzz, where a 240px
   * kind painted 172 / 190 / 216.
   */
  readonly measure: { readonly width: number; readonly minHeight: number };
  readonly setData: (patch: Partial<TData>) => void;
}

/**
 * A field the native inspector edits. The widget set is milestone 2's to settle
 * — this is the minimum `NodeKindSpec.fields` needs to exist.
 */
export interface GraphNodeField {
  readonly key: string;
  readonly label?: string;
  readonly type: 'text' | 'number' | 'boolean' | 'select';
  readonly options?: readonly { readonly value: string; readonly label: string }[];
}

export interface NodeKindSpec<TData> {
  readonly kind: string;
  readonly render: ComponentType<GraphNodeRenderProps<TData>>;
  /** May be a function of data, so a switch node grows outputs without a new kind. */
  readonly ports: readonly PortSpec[] | ((data: TData) => readonly PortSpec[]);
  readonly defaultData: TData;
  /** Width is fixed per kind; height is knob-driven and re-measured. */
  readonly measure: { readonly width: number; readonly minHeight: number };
  readonly intent?: string;
  /** Fields the native inspector edits. Absent means no inspector. */
  readonly fields?: readonly GraphNodeField[];
}

export interface EdgeKindSpec<TData> {
  readonly kind: string;
  readonly defaultData: TData;
  /**
   * Which painted appearance this kind draws as — one of the four in
   * `src/edges/edgeKinds.ts`. A NAME, not a style: the model stays free of
   * rendering, and one registered React Flow edge type switches on it.
   * Absent falls back to the kind's own name.
   */
  readonly appearance?: string;
}

export interface GraphSchema<N extends NodeKindDefs, E extends EdgeKindDefs> extends DocumentSchema<N, E> {
  readonly id: string;
  readonly nodes: { readonly [K in keyof N & string]: NodeKindSpec<N[K]> };
  readonly edges: { readonly [K in keyof E & string]: EdgeKindSpec<E[K]> };
  /** The pointer-tick rules. `refuseCycle` cannot go here; that is a type. */
  readonly rules: readonly ConnectionRule<N, E>[];
  /** Rules that run once, on drop. */
  readonly dropRules: readonly DropOnlyRule<N, E>[];
}

export interface GraphSchemaSpec<N extends NodeKindDefs, E extends EdgeKindDefs> {
  readonly id: string;
  readonly nodes: { readonly [K in keyof N & string]: NodeKindSpec<N[K]> };
  readonly edges: { readonly [K in keyof E & string]: EdgeKindSpec<E[K]> };
  readonly rules?: readonly ConnectionRule<N, E>[];
  readonly dropRules?: readonly DropOnlyRule<N, E>[];
}

export function createGraphSchema<N extends NodeKindDefs, E extends EdgeKindDefs>(
  spec: GraphSchemaSpec<N, E>,
): GraphSchema<N, E> {
  return {
    id: spec.id,
    nodes: spec.nodes,
    edges: spec.edges,
    rules: spec.rules ?? [],
    dropRules: spec.dropRules ?? [],
  };
}

const registry = new Map<string, GraphSchema<never, never>>();

/**
 * `schema.id` is what crosses the bridge. A `render` is a `ComponentType` and
 * cannot be JSON, so schemas register by id in a module BOTH the native screen
 * and the DOM entry import. That constraint is what keeps nodes Tamagui: the
 * body is written once, in the consumer's package, and renders inside the
 * WebView against the real config, theme and hook.
 */
export function registerGraphSchema<N extends NodeKindDefs, E extends EdgeKindDefs>(schema: GraphSchema<N, E>): void {
  registry.set(schema.id, schema as unknown as GraphSchema<never, never>);
}

export function getGraphSchema(id: string): GraphSchema<never, never> | undefined {
  return registry.get(id);
}

/** Test seam. Registering the same id twice is legal; leaking between specs is not. */
export function clearGraphSchemas(): void {
  registry.clear();
}

export function nodeKindSpec<N extends NodeKindDefs, E extends EdgeKindDefs>(
  schema: GraphSchema<N, E>,
  kind: string,
): NodeKindSpec<unknown> | undefined {
  return (schema.nodes as Record<string, NodeKindSpec<unknown> | undefined>)[kind];
}

/** Resolves a node's ports, calling the `ports` function when the kind uses one. */
export function resolvePorts<N extends NodeKindDefs, E extends EdgeKindDefs>(
  schema: GraphSchema<N, E>,
  node: GraphNodeOf<N>,
): readonly PortSpec[] {
  const spec = nodeKindSpec(schema, node.kind);
  if (!spec) {
    return [];
  }
  return typeof spec.ports === 'function' ? spec.ports(node.data) : spec.ports;
}
