/* oxlint-disable typescript/no-explicit-any -- the built-in rules are schema
   agnostic by design (§4.4 writes them `ConnectionRule<any, any>`). A generic
   parameter here would make them invariant in N and E, so `defaultRules` could
   not be dropped into any consumer's schema — which is the one thing they are
   for. The brand still bites: `DropOnlyRule<any, any>` is refused by
   `validateConnection` because it lacks `tickSafe`, not because of variance. */

/**
 * Connection rules, design §4.4. Cheap and expensive kept apart, as a TYPE.
 *
 * React Flow calls `isValidConnection` on every pointer tick of a connection
 * drag, so anything on that path is paid per mouse move. Every rule here is
 * O(1) or O(edges of one port) and carries the `tickSafe` marker.
 * `refuseCycle` is O(V+E) and does NOT carry it, so `validateConnection` will
 * not take it — the compiler refuses, rather than a comment asking nicely.
 * `connect.test.ts` pins that with a `@ts-expect-error` that fails if the two
 * types ever collapse.
 */

import type { EdgeKindDefs, GraphDocument, NodeKindDefs, PortRef } from './document';
import type { GraphSchema, PortSpec } from './schema';
import { portArity, resolvePorts } from './schema';

export type ConnectionVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: string; readonly message: string };

export interface ConnectionContext<N extends NodeKindDefs, E extends EdgeKindDefs> {
  readonly document: GraphDocument<N, E>;
  readonly schema: GraphSchema<N, E>;
  /** The candidate. Not yet in `document.edges`. */
  readonly source: PortRef;
  readonly target: PortRef;
}

export type ConnectionCheck<N extends NodeKindDefs, E extends EdgeKindDefs> = (
  ctx: ConnectionContext<N, E>,
) => ConnectionVerdict;

/**
 * A rule cheap enough for the pointer-tick path.
 *
 * The marker is real at runtime, not a phantom, so a rule array can be checked
 * as well as typed — and so `defineConnectionRule` is the only way to claim it
 * without reaching for a cast, which makes the claim a deliberate act.
 */
export type ConnectionRule<N extends NodeKindDefs, E extends EdgeKindDefs> = ConnectionCheck<N, E> & {
  readonly tickSafe: true;
};

/**
 * A rule that runs once, on drop. Every `ConnectionRule` is also one of these;
 * the reverse is what the type refuses.
 */
export type DropOnlyRule<N extends NodeKindDefs, E extends EdgeKindDefs> = ConnectionCheck<N, E>;

export const defineConnectionRule = <N extends NodeKindDefs, E extends EdgeKindDefs>(
  check: ConnectionCheck<N, E>,
): ConnectionRule<N, E> => Object.assign(check, { tickSafe: true } as const);

const pass: ConnectionVerdict = { ok: true };

const refuse = (code: string, message: string): ConnectionVerdict => ({ ok: false, code, message });

interface Resolved {
  readonly port: PortSpec;
}

type Lookup = Resolved | { readonly problem: ConnectionVerdict };

const lookup = <N extends NodeKindDefs, E extends EdgeKindDefs>(
  ctx: ConnectionContext<N, E>,
  ref: PortRef,
  end: 'source' | 'target',
): Lookup => {
  const node = ctx.document.nodes.find((candidate) => candidate.id === ref.node);
  if (!node) {
    return {
      problem: refuse(
        'unknown-node',
        `the ${end} names node ${JSON.stringify(ref.node)}, which is not in this document`,
      ),
    };
  }
  const port = resolvePorts(ctx.schema, node).find((candidate) => candidate.id === ref.port);
  if (!port) {
    return {
      problem: refuse('unknown-port', `node ${JSON.stringify(ref.node)} has no port ${JSON.stringify(ref.port)}`),
    };
  }
  return { port };
};

const isResolved = (value: Lookup): value is Resolved => 'port' in value;

/**
 * Out to in, and nothing else.
 *
 * This rule is FIRST in `defaultRules`, which is also why it owns the two
 * lookup failures. Every other rule treats an unresolvable end as none of its
 * business and passes, so each rule refuses exactly its own case and the
 * "refuses its own, passes the other four" matrix in the spec stays honest.
 */
export const refuseDirection: ConnectionRule<any, any> = defineConnectionRule((ctx) => {
  const source = lookup(ctx, ctx.source, 'source');
  if (!isResolved(source)) {
    return source.problem;
  }
  const target = lookup(ctx, ctx.target, 'target');
  if (!isResolved(target)) {
    return target.problem;
  }
  if (source.port.direction !== 'out') {
    return refuse('wrong-direction', `${ctx.source.port} is an input; a connection starts at an output`);
  }
  if (target.port.direction !== 'in') {
    return refuse('wrong-direction', `${ctx.target.port} is an output; a connection ends at an input`);
  }
  return pass;
});

export const refuseSelfLoop: ConnectionRule<any, any> = defineConnectionRule((ctx) =>
  ctx.source.node === ctx.target.node
    ? refuse('self-loop', `node ${JSON.stringify(ctx.source.node)} cannot connect to itself`)
    : pass,
);

/** "one" means one edge on that port, in that direction. */
export const refusePortArity: ConnectionRule<any, any> = defineConnectionRule((ctx) => {
  const source = lookup(ctx, ctx.source, 'source');
  const target = lookup(ctx, ctx.target, 'target');
  if (isResolved(source) && portArity(source.port) === 'one') {
    const taken = ctx.document.edges.some(
      (edge) => edge.source.node === ctx.source.node && edge.source.port === ctx.source.port,
    );
    if (taken) {
      return refuse('port-arity', `port ${JSON.stringify(ctx.source.port)} takes one connection and already has it`);
    }
  }
  if (isResolved(target) && portArity(target.port) === 'one') {
    const taken = ctx.document.edges.some(
      (edge) => edge.target.node === ctx.target.node && edge.target.port === ctx.target.port,
    );
    if (taken) {
      return refuse('port-arity', `port ${JSON.stringify(ctx.target.port)} takes one connection and already has it`);
    }
  }
  return pass;
});

export const refuseDuplicate: ConnectionRule<any, any> = defineConnectionRule((ctx) =>
  ctx.document.edges.some(
    (edge) =>
      edge.source.node === ctx.source.node &&
      edge.source.port === ctx.source.port &&
      edge.target.node === ctx.target.node &&
      edge.target.port === ctx.target.port,
  )
    ? refuse('duplicate-edge', 'these two ports are already connected')
    : pass,
);

/**
 * An untyped port connects to anything, so `dataType` stays opt-in: a schema
 * that never sets it never trips this rule.
 */
export const refuseDataTypeMismatch = (
  compatible: (from: string, to: string) => boolean = (from, to) => from === to,
): ConnectionRule<any, any> =>
  defineConnectionRule((ctx) => {
    const source = lookup(ctx, ctx.source, 'source');
    const target = lookup(ctx, ctx.target, 'target');
    if (!isResolved(source) || !isResolved(target)) {
      return pass;
    }
    const from = source.port.dataType;
    const to = target.port.dataType;
    if (from === undefined || to === undefined) {
      return pass;
    }
    return compatible(from, to) ? pass : refuse('data-type-mismatch', `a ${from} output does not fit a ${to} input`);
  });

/**
 * O(V+E) DFS from the candidate's target back to its source. NOT a
 * `ConnectionRule` — see the type above. Its cost at 200 nodes / 400 edges is
 * unmeasured, and it is a bench line before it is ever recommended.
 */
export const refuseCycle = (): DropOnlyRule<any, any> => (ctx) => {
  if (ctx.source.node === ctx.target.node) {
    return refuse('cycle', 'a node cannot feed itself');
  }
  const out = new Map<string, string[]>();
  for (const edge of ctx.document.edges) {
    const list = out.get(edge.source.node);
    if (list) {
      list.push(edge.target.node);
    } else {
      out.set(edge.source.node, [edge.target.node]);
    }
  }
  // Walk forward from where the candidate LANDS. Reaching where it starts
  // means the candidate closes a loop.
  const seen = new Set<string>();
  const stack = [ctx.target.node];
  for (let current = stack.pop(); current !== undefined; current = stack.pop()) {
    if (current === ctx.source.node) {
      return refuse('cycle', `connecting these would make ${JSON.stringify(ctx.source.node)} reachable from itself`);
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    const next = out.get(current);
    if (next) {
      stack.push(...next);
    }
  }
  return pass;
};

/**
 * Order matters: first refusal wins, and `refuseDirection` is first so an
 * impossible pair reports the reason a user can act on rather than whichever
 * rule happened to be checked first.
 */
export const defaultRules: readonly ConnectionRule<any, any>[] = [
  refuseDirection,
  refuseSelfLoop,
  refusePortArity,
  refuseDuplicate,
  refuseDataTypeMismatch(),
];

export const defaultDropRules: readonly DropOnlyRule<any, any>[] = [refuseCycle()];

/**
 * The pointer-tick path. Takes `ConnectionRule`s only; a `DropOnlyRule` is a
 * compile error, which is the whole point of the split.
 */
export const validateConnection = <N extends NodeKindDefs, E extends EdgeKindDefs>(
  ctx: ConnectionContext<N, E>,
  rules: readonly ConnectionRule<N, E>[] = ctx.schema.rules,
): ConnectionVerdict => {
  for (const rule of rules) {
    const verdict = rule(ctx);
    if (!verdict.ok) {
      return verdict;
    }
  }
  return pass;
};

/** The drop path. Takes both, tick-safe rules first. */
export const validateDrop = <N extends NodeKindDefs, E extends EdgeKindDefs>(
  ctx: ConnectionContext<N, E>,
  rules: readonly ConnectionRule<N, E>[] = ctx.schema.rules,
  dropRules: readonly DropOnlyRule<N, E>[] = ctx.schema.dropRules,
): ConnectionVerdict => {
  const cheap = validateConnection(ctx, rules);
  if (!cheap.ok) {
    return cheap;
  }
  for (const rule of dropRules) {
    const verdict = rule(ctx);
    if (!verdict.ok) {
      return verdict;
    }
  }
  return pass;
};
