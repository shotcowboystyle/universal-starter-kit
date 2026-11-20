/**
 * Which ports a connection drag is allowed to land on (design §7.4, §4.4).
 *
 * `connectionRadius` is the 44 px hit diameter (task 3.4 H5), so React Flow's
 * magnetism will snap a drag onto whatever handle is nearest — including one
 * the schema refuses. That is correct behavior from React Flow and the wrong
 * thing to SHOW: a puck naming a target the drop then rejects teaches a user
 * that the affordance lies. So the candidates get filtered through the same
 * rule engine the drop will use.
 *
 * Pure. No React, no DOM, no `@xyflow` — it runs in vitest under Node, and the
 * same function answers for the puck, for a keyboard flow, and for a headless
 * consumer that wants to know what its document permits.
 *
 * `validateConnection` and never `validateDrop`. This is the pointer-tick path
 * and `refuseCycle` is O(V+E); the TYPE refuses it here rather than a comment
 * asking nicely (design §4.4).
 */

import { validateConnection } from '../model/connect';
import type { ConnectionRule, EdgeKindDefs, GraphDocument, GraphSchema, NodeKindDefs, PortRef } from '../model/index';
import { resolvePorts } from '../model/schema';

export interface LegalTargetQuery<N extends NodeKindDefs, E extends EdgeKindDefs> {
  readonly document: GraphDocument<N, E>;
  readonly schema: GraphSchema<N, E>;
  /** Where the drag started. An input here yields nothing, by `refuseDirection`. */
  readonly source: PortRef;
  /** Defaults to the schema's own rules, which is what the drop will use. */
  readonly rules?: readonly ConnectionRule<N, E>[];
}

/**
 * Every port `validateConnection` accepts for this source, in DOCUMENT order.
 *
 * Order is part of the contract: a candidate list that reshuffles between
 * pointer ticks would make a highlight flicker between two equally legal ports
 * on the same node.
 *
 * A port on the source node is not special-cased. Whether a self-loop is legal
 * is the schema's call, made by including or omitting `refuseSelfLoop`, and
 * this function has no opinion of its own — which is what lets a schema that
 * wants loops have them without a flag here.
 */
export const legalTargets = <N extends NodeKindDefs, E extends EdgeKindDefs>(
  query: LegalTargetQuery<N, E>,
): readonly PortRef[] => {
  const { document, schema, source, rules } = query;
  const out: PortRef[] = [];
  for (const node of document.nodes) {
    for (const spec of resolvePorts(schema, node)) {
      const target: PortRef = { node: node.id, port: spec.id };
      if (validateConnection({ document, schema, source, target }, rules).ok) {
        out.push(target);
      }
    }
  }
  return out;
};

/**
 * The same answer for ONE candidate, without walking the document.
 *
 * What the puck actually calls. React Flow has already told us which handle it
 * snapped to, so asking about every port to check one is work paid on every
 * pointer tick of every drag.
 */
export const isLegalTarget = <N extends NodeKindDefs, E extends EdgeKindDefs>(
  query: LegalTargetQuery<N, E> & { readonly target: PortRef },
): boolean => {
  const { document, schema, source, target, rules } = query;
  return validateConnection({ document, schema, source, target }, rules).ok;
};

/**
 * React Flow's magnetic candidates, minus the ones the rules refuse.
 *
 * Order is the caller's, not the document's: React Flow hands these back
 * sorted by distance, and re-sorting them into document order would throw away
 * the "nearest" the magnetism just computed.
 */
export const filterLegalCandidates = <N extends NodeKindDefs, E extends EdgeKindDefs>(
  candidates: readonly PortRef[],
  query: LegalTargetQuery<N, E>,
): readonly PortRef[] => candidates.filter((target) => isLegalTarget({ ...query, target }));
