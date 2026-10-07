import { createOptimisticAction as tanstackCreateOptimisticAction } from '@tanstack/db';

export { tanstackCreateOptimisticAction as createOptimisticAction };

/**
 * Re-export of TanStack DB's `createOptimisticAction`.
 *
 * Creates an optimistic action that applies local state changes immediately
 * before the server mutation executes. When the mutation completes, the
 * optimistic state is replaced by the server-confirmed data. On failure,
 * the optimistic change is rolled back.
 *
 * @example
 * ```typescript
 * import { createOptimisticAction } from "@repo/frappe";
 *
 * const addPokemon = createOptimisticAction<Partial<Pokemon>>({
 *   onMutate: (data) => {
 *     pokemonCollection.insert({
 *       name: data.name ?? crypto.randomUUID(),
 *       doctype: "Pokemon",
 *       ...data,
 *     });
 *   },
 *   mutationFn: async (data) => {
 *     await fetch("/api/resource/Pokemon", {
 *       method: "POST",
 *       body: JSON.stringify(data),
 *     });
 *     // Wait for sync to pick up the new doc before returning
 *     // so the optimistic state can be safely dropped
 *   },
 * });
 *
 * // Usage
 * const tx = addPokemon({ name: "pikachu", pokemon_name: "Pikachu", poke_id: 25 });
 * await tx.isPersisted.promise;
 * ```
 */

// ---------------------------------------------------------------------------
// Optimistic RPC lifecycle — the ONE pattern for mutations that ride
// whitelisted desk RPCs instead of the document CRUD path.
// ---------------------------------------------------------------------------
//
// Document CRUD (collection insert/update/delete) is already optimistic via
// the MutationEngine: local cache apply → journal Pending → server ack →
// temp-id → real-name remap, snapshot rollback on failure. Desk RPC
// mutations (add_comment, assign_to, tags, likes, shares…) bypass that
// engine, and every callsite used to hand-roll "await, then refetch" — the
// user saw nothing until the server round-trip completed.
//
// `runOptimisticRpc` gives those callsites the same lifecycle the engine
// gives documents, without per-callsite hacks:
//
//   1. APPLY     — synchronous local apply BEFORE the request leaves;
//                  returns the undo used for rollback. The applied state
//                  should carry a pending marker so surfaces can render it
//                  visible-but-distinct (Axiom 6 HONEST STATE).
//   2. SEND      — the RPC itself.
//   3. RECONCILE — on ack, converge the optimistic identity (the issued
//                  `tmp_*` id) to the server identity so the optimistic
//                  record and the server record become ONE record, never
//                  duplicates.
//   4. ROLLBACK  — on failure, the apply-phase undo runs, then `onError`
//                  surfaces a visible error (house `notify()`), and the
//                  error rethrows for the caller.

/** Prefix shared with the MutationEngine's synthesized create identities. */
export const OPTIMISTIC_TEMP_PREFIX = 'tmp_';

/** Issues a client-only identity for an optimistic record (`tmp_<uuid>`). */
export function newOptimisticTempId(): string {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${OPTIMISTIC_TEMP_PREFIX}${id}`;
}

/** True when a document name is a client-issued optimistic identity. */
export function isOptimisticTempId(name: unknown): name is string {
  return typeof name === 'string' && name.startsWith(OPTIMISTIC_TEMP_PREFIX);
}

export interface OptimisticRpcContext {
  /** Client-only identity for the optimistic record (`tmp_<uuid>`). */
  tempId: string;
}

export interface OptimisticRpcOptions<TAck> {
  /**
   * Apply the mutation locally, synchronously, before the request is sent.
   * Returns the undo that restores the exact pre-apply state (rollback).
   * The applied record should use `ctx.tempId` as its identity and carry a
   * pending marker for the UI.
   */
  apply: (ctx: OptimisticRpcContext) => (() => void) | undefined | void;
  /** The server RPC. */
  send: (ctx: OptimisticRpcContext) => Promise<TAck>;
  /**
   * Converge on ack: replace the `ctx.tempId` record with the server's
   * authoritative record (dedupe by server identity — a racing refetch may
   * already have delivered it).
   */
  reconcile?: (ack: TAck, ctx: OptimisticRpcContext) => void;
  /**
   * Visible-error surface for the rollback path (house `notify()` or an
   * inline error slot). Runs after the apply-phase undo.
   */
  onError?: (error: unknown, ctx: OptimisticRpcContext) => void;
}

/**
 * Runs one mutation through the optimistic lifecycle:
 * apply (local, immediate) → send → reconcile on ack, or undo + onError on
 * failure (the error rethrows).
 */
export async function runOptimisticRpc<TAck>(options: OptimisticRpcOptions<TAck>): Promise<TAck> {
  const ctx: OptimisticRpcContext = { tempId: newOptimisticTempId() };
  const undo = options.apply(ctx) ?? undefined;
  try {
    const ack = await options.send(ctx);
    options.reconcile?.(ack, ctx);
    return ack;
  } catch (error) {
    try {
      undo?.();
    } finally {
      options.onError?.(error, ctx);
    }
    throw error;
  }
}
