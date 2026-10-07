/**
 * The undo journal, design §4.5. `createHistory({ limit: 100, coalesceMs: 400 })`.
 *
 * The history holds COMMANDS; the caller holds the document. That is what lets
 * a React controller keep the document in its own state and still get one undo
 * per gesture, and it is why every method takes the current document rather
 * than reading one it owns.
 *
 * A drag emits a `moveNodes` per frame, so coalescing is not a nicety: without
 * it a two-second drag buries the stack under 120 entries. `setPositions` never
 * coalesces, with anything, because auto-layout must stay separately undoable
 * from the drag either side of it.
 */

import { applyCommand, invertCommand } from './commands';
import type { GraphCommand } from './commands';
import type { EdgeKindDefs, GraphDocument, NodeKindDefs } from './document';

export interface HistoryEntry<N extends NodeKindDefs, E extends EdgeKindDefs> {
  readonly redo: GraphCommand<N, E>;
  readonly undo: GraphCommand<N, E>;
  /** When this entry was last written. Slides on every coalesce. */
  readonly at: number;
}

export interface HistoryOptions {
  readonly limit?: number;
  readonly coalesceMs?: number;
  /** Injected so a spec can drive time without a global fake clock. */
  readonly now?: () => number;
}

export interface GraphHistory<N extends NodeKindDefs, E extends EdgeKindDefs> {
  /** Apply the command, record it, return the new document. */
  readonly commit: (doc: GraphDocument<N, E>, command: GraphCommand<N, E>) => GraphDocument<N, E>;
  /** Notify command transports with the journal entry that produced the document. */
  readonly undo: (
    doc: GraphDocument<N, E>,
    onApplied?: (next: GraphDocument<N, E>, command: GraphCommand<N, E>) => void,
  ) => GraphDocument<N, E>;
  readonly redo: (
    doc: GraphDocument<N, E>,
    onApplied?: (next: GraphDocument<N, E>, command: GraphCommand<N, E>) => void,
  ) => GraphDocument<N, E>;
  readonly canUndo: () => boolean;
  readonly canRedo: () => boolean;
  readonly depth: () => number;
  readonly entries: () => readonly HistoryEntry<N, E>[];
  readonly clear: () => void;
}

function movedIds(deltas: Readonly<Record<string, unknown>>): string[] {
  return Object.keys(deltas).sort();
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

function addDeltas(
  a: Readonly<Record<string, { x: number; y: number }>>,
  b: Readonly<Record<string, { x: number; y: number }>>,
): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  for (const [id, delta] of Object.entries(a)) {
    out[id] = { ...delta };
  }
  for (const [id, delta] of Object.entries(b)) {
    const prior = out[id];
    out[id] = prior ? { x: prior.x + delta.x, y: prior.y + delta.y } : { ...delta };
  }
  return out;
}

export function createHistory<N extends NodeKindDefs, E extends EdgeKindDefs>(
  options: HistoryOptions = {},
): GraphHistory<N, E> {
  const limit = options.limit ?? 100;
  const coalesceMs = options.coalesceMs ?? 400;
  const now = options.now ?? (() => Date.now());

  let past: HistoryEntry<N, E>[] = [];
  let future: HistoryEntry<N, E>[] = [];

  /**
   * ONE gate. Returns the merged entry, or undefined to start a new one.
   *
   * Deliberately not a boolean predicate with the merge done elsewhere: two
   * places encoding the same rule means either can be wrong while the other
   * quietly covers for it, which is exactly what a mutation run found when this
   * was split in two.
   */
  function coalesce(command: GraphCommand<N, E>, undo: GraphCommand<N, E>, at: number): HistoryEntry<N, E> | undefined {
    const top = past.at(-1);
    if (!top) {
      return undefined;
    }
    // A redo stack means the user has undone past `top`. Folding a new command
    // into an entry that is not currently applied would make the document and
    // the journal disagree, so a pending redo always starts a fresh entry.
    if (future.length > 0) {
      return undefined;
    }
    // The window slides: it measures the gap since the LAST movement, not since
    // the gesture began, so a slow drag is still one undo.
    if (at - top.at > coalesceMs) {
      return undefined;
    }
    // Only moveNodes, ever. setPositions is what auto-layout emits and it must
    // stay separately undoable from the drag on either side of it.
    if (command.t !== 'moveNodes' || top.redo.t !== 'moveNodes' || top.undo.t !== 'moveNodes') {
      return undefined;
    }
    if (undo.t !== 'moveNodes') {
      return undefined;
    }
    if (!sameIds(movedIds(command.deltas), movedIds(top.redo.deltas))) {
      return undefined;
    }
    return {
      // Deltas compose by addition. That is the whole reason `moveNodes`
      // carries deltas rather than absolutes.
      redo: { t: 'moveNodes', deltas: addDeltas(top.redo.deltas, command.deltas) },
      undo: { t: 'moveNodes', deltas: addDeltas(top.undo.deltas, undo.deltas) },
      at,
    };
  }

  return {
    commit(doc, command) {
      const at = now();
      const undo = invertCommand(doc, command);
      const next = applyCommand(doc, command);
      const merged = coalesce(command, undo, at);
      if (merged) {
        past[past.length - 1] = merged;
        return next;
      }
      past.push({ redo: command, undo, at });
      future = [];
      if (past.length > limit) {
        past = past.slice(past.length - limit);
      }
      return next;
    },

    undo(doc, onApplied) {
      const entry = past.pop();
      if (!entry) {
        return doc;
      }
      future.push(entry);
      const next = applyCommand(doc, entry.undo);
      onApplied?.(next, entry.undo);
      return next;
    },

    redo(doc, onApplied) {
      const entry = future.pop();
      if (!entry) {
        return doc;
      }
      past.push(entry);
      const next = applyCommand(doc, entry.redo);
      onApplied?.(next, entry.redo);
      return next;
    },

    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    depth: () => past.length,
    entries: () => past,
    clear() {
      past = [];
      future = [];
    },
  };
}
