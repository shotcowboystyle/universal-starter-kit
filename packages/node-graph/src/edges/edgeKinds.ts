/**
 * The four built-in edge kinds, design §4.4.
 *
 * These are MODEL objects — `EdgeKindSpec`s a consumer drops into
 * `createGraphSchema`. Their appearance lives in `edgeStyle.ts` and is reached
 * by NAME, so the model half stays free of rendering and one registered React
 * Flow edge type can switch on the kind internally.
 */

import type { EdgeKindSpec } from '../model/index';

export type BuiltinEdgeKind = 'flow' | 'data' | 'error' | 'conditional';

/**
 * Declaration order is the order the table in design §4.4 reads, and the order
 * the `Main` story lays them out.
 */
export const builtinEdgeKindNames: readonly BuiltinEdgeKind[] = ['flow', 'data', 'error', 'conditional'];

/**
 * A type alias, not an interface. An interface has no implicit index signature,
 * so `interface BuiltinEdgeData` does not satisfy `EdgeKindDefs` and
 * `createGraphSchema` refuses it. That is a TypeScript rule about declaration
 * merging rather than a modelling choice, and it bites every consumer the same
 * way — so the kind maps in this package are written the shape a consumer must
 * write too.
 */
export type BuiltinEdgeData = {
  /** Control moving. */
  readonly flow: Record<string, never>;
  /** A value moving. */
  readonly data: { readonly dataType?: string };
  /** The failure branch. */
  readonly error: { readonly reason?: string };
  /** A branch not always taken. */
  readonly conditional: { readonly when?: string };
};

export const builtinEdgeKinds: {
  readonly [K in BuiltinEdgeKind]: EdgeKindSpec<BuiltinEdgeData[K]>;
} = {
  flow: { kind: 'flow', defaultData: {}, appearance: 'flow' },
  data: { kind: 'data', defaultData: {}, appearance: 'data' },
  error: { kind: 'error', defaultData: {}, appearance: 'error' },
  conditional: { kind: 'conditional', defaultData: {}, appearance: 'conditional' },
};
