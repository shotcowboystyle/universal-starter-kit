/**
 * The one error worth reporting, kept where both halves of boot can reach it.
 *
 * Same shape and same reason as `dom/boot.ts`: `node-graph-dom.ts` must carry no
 * top-level import of ours that could itself throw (design §9.4 layer 3), so it
 * writes this slot INLINE from its own catch block. A module-scoped variable
 * would give the entry and the diagnostics panel two separate records, and the
 * panel would report the empty one.
 *
 * Everything here treats the global as untrusted. A record another library
 * clobbered, or a phase outside the wire's four, reads back as `null` rather
 * than throwing inside the error path — which is the one path where a second
 * throw costs you the diagnosis.
 *
 * Design: docs/design/node-graph-editor.md §9.5.
 */

import type { GraphErrorPhase } from '../dom/wire';

/**
 * The key `node-graph-dom.ts` writes inline.
 *
 * Exported so `use-graph-diagnostics.test.tsx` can assert the entry's literal and
 * this module's reader still name the same slot — the one place the two halves
 * could silently drift.
 */
export const graphErrorGlobalKey = '__mp_graph_error';

export interface GraphErrorRecord {
  readonly phase: GraphErrorPhase;
  readonly message: string;
  readonly stack?: string;
  /** `Date.now()` at the record, so a panel can say how long ago it happened. */
  readonly at: number;
}

const phases: readonly GraphErrorPhase[] = ['boot', 'module', 'render', 'runtime'];

/* oxlint-disable anti-slop/no-runtime-typeof -- this module IS the parse boundary for an untrusted global (another library can clobber the slot) */
const isPhase = (value: unknown): value is GraphErrorPhase =>
  typeof value === 'string' && phases.some((phase) => phase === value);

/** The record as written, normalized. Anything unrecognizable reads as `null`. */
export const readGraphError = (): GraphErrorRecord | null => {
  // oxlint-disable-next-line anti-slop/no-reflect-get -- the slot is an untyped global written inline by node-graph-dom.ts; it is parsed right below
  const raw: unknown = Reflect.get(globalThis, graphErrorGlobalKey);
  if (raw === null || typeof raw !== 'object') {
    return null;
  }
  // SAFETY: `raw` is a non-null object; every field is optional here and each one is
  // type-checked below before it is read into the returned record.
  const record = raw as Partial<GraphErrorRecord>;
  if (!isPhase(record.phase)) {
    return null;
  }
  if (typeof record.message !== 'string') {
    return null;
  }
  return {
    phase: record.phase,
    message: record.message,
    stack: typeof record.stack === 'string' ? record.stack : undefined,
    at: typeof record.at === 'number' ? record.at : 0,
  };
};

/**
 * Record an error, keeping the FIRST one.
 *
 * A module-eval throw usually produces a train of render errors behind it, and
 * last-write-wins would report the consequence while the cause scrolled off.
 * `resetGraphError` is what Retry calls before remounting, so a genuinely new
 * boot is not judged on the previous one's failure.
 */
export const recordGraphError = (error: {
  readonly phase: GraphErrorPhase;
  readonly message: string;
  readonly stack?: string;
}): GraphErrorRecord | null => {
  if (!isPhase(error.phase) || typeof error.message !== 'string') {
    return readGraphError();
  }
  const previous = readGraphError();
  if (previous) {
    return previous;
  }
  const record: GraphErrorRecord = {
    phase: error.phase,
    message: error.message,
    stack: error.stack,
    at: Date.now(),
  };
  Reflect.set(globalThis, graphErrorGlobalKey, record);
  return record;
};
/* oxlint-enable anti-slop/no-runtime-typeof */

/** Test seam, and what Retry calls before remounting. */
export const resetGraphError = (): void => {
  Reflect.deleteProperty(globalThis, graphErrorGlobalKey);
};
