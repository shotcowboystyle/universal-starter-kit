/**
 * The boot heartbeat, design 9.4 layer 3.
 *
 * `import.meta` in a dependency is a PARSE error in a classic script, so the
 * script never executes, so no error boundary is reachable, so the WebView is a
 * blank rectangle with no console the user can see. Layers 1 and 2 stop that
 * one at build time. This layer answers the next question: when a WebView does
 * come up empty, HOW FAR did it get?
 *
 * The record lives on `globalThis` rather than in a module-scoped variable
 * because two different pieces of code write it. `node-graph-dom.ts` stamps
 * `script` INLINE — it cannot import this module, since the entry must carry no
 * top-level import of ours that could itself throw — and the tree it then
 * dynamic-imports stamps the rest through `stampBootStage`. A module variable
 * would give those two separate records, and the fallback would report the
 * emptier one.
 *
 * Everything here therefore treats the global as untrusted: a record another
 * library clobbered, or the bare `{ stage: "script" }` the entry wrote with no
 * history, both read back cleanly instead of throwing inside the error path.
 */

/** Design 9.4: `script -> module -> faces -> provider -> flow -> ready`. */
export const bootStages = ['script', 'module', 'faces', 'provider', 'flow', 'ready'] as const;

/**
 * How long the canvas waits for its own diagnostics to settle before stamping
 * `ready` anyway (MPO-211).
 *
 * `ready` carries design 9.5's record, and two of its fields are unknowable at
 * the instant the document parses: React Flow has not measured the pane, so
 * with culling on no node body has mounted, and `GraphFaces` has not heard back
 * from `document.fonts`. Emitting immediately reported `nodesMounted: 0` and
 * every face `pending` on a canvas that was about to paint correctly.
 *
 * 1800 is `GraphFaces`' own 1500 ms asset-URL timeout plus a margin, so a face
 * that falls back to base64 reports the fallback rather than being caught mid
 * probe. It lives HERE rather than beside the canvas because the native
 * watchdog has to be larger than it, and a watchdog that undercut this would
 * declare a healthy canvas dead while it was still filling in its own panel.
 */
export const graphReadySettleMs = 1800;

export type BootStage = (typeof bootStages)[number];

export interface BootRecord {
  readonly stage: BootStage;
  /** `Date.now()` at the stamp, so diagnostics can show where boot spent its time. */
  readonly at: number;
  /**
   * `Date.now()` when the record was CREATED — the first stamp of this attempt.
   *
   * `at - startedAt` is how long boot has taken, which is the number the native
   * watchdog's budget has to be set from. Without it the 4000 ms of design
   * 9.4 was a guess, and on emulator-5590 rebooted fresh it was the wrong one:
   * the watchdog fired, the fallback blamed a parse error, and Retry rendered
   * the canvas immediately (MPO-211).
   */
  readonly startedAt: number;
  readonly history: readonly BootStage[];
}

/**
 * The key `node-graph-dom.ts` writes inline. Exported so `dom-entry.test.ts` can
 * assert the entry's literal and this module's reader still name the same slot
 * — the one place the two halves of the heartbeat could silently drift.
 */
export const bootGlobalKey = '__mp_graph_boot';

// SAFETY: widening the literal tuple to readonly string[] only to look a BootStage up in it
export const bootStageIndex = (stage: BootStage): number => (bootStages as readonly string[]).indexOf(stage);

const isBootStage = (value: unknown): value is BootStage =>
  typeof value === 'string' &&
  // SAFETY: widening the literal tuple to readonly string[] only to call includes on a string
  (bootStages as readonly string[]).includes(value);

/**
 * The record as written, normalized. A raw `{ stage: "script" }` from the entry
 * gains the history it never had; anything unrecognizable reads as `null`.
 */
export const readBootRecord = (): BootRecord | null => {
  // oxlint-disable-next-line anti-slop/no-reflect-get -- an ad-hoc global slot written by the inline entry; parsed right below
  const raw: unknown = Reflect.get(globalThis, bootGlobalKey);
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- this IS the parse of the untyped global the inline entry writes
  if (raw === null || typeof raw !== 'object') {
    return null;
  }
  // SAFETY: every field is re-validated below (isBootStage / Array.isArray / typeof) before use
  const record = raw as Partial<BootRecord>;
  if (!isBootStage(record.stage)) {
    return null;
  }
  const history = Array.isArray(record.history) ? record.history.filter(isBootStage) : [];
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- validating the untyped global's field
  const at = typeof record.at === 'number' ? record.at : 0;
  return {
    stage: record.stage,
    at,
    // A raw `{ stage: "script" }` from the entry has no `startedAt`; reading it
    // back as `at` makes the elapsed time zero rather than a decade, which is
    // the honest answer for a record that never carried a start.
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- validating the untyped global's field
    startedAt: typeof record.startedAt === 'number' ? record.startedAt : at,
    history: history.length > 0 ? history : [record.stage],
  };
};

/**
 * Milliseconds since this attempt's first stamp, or `null` with no record.
 *
 * This is the measurement the native watchdog's budget is set from, and it is
 * reported in design 9.5's panel so the budget can be re-set from a device
 * rather than from a guess.
 */
export const readBootElapsedMs = (now: number = Date.now()): number | null => {
  const record = readBootRecord();
  if (!record || record.startedAt === 0) {
    return null;
  }
  return Math.max(0, now - record.startedAt);
};

export const readBootStage = (): BootStage | null => readBootRecord()?.stage ?? null;

/**
 * Record that boot reached `stage`, and return the stage the record now holds.
 *
 * Forward only. The watchdog's fallback names the last stage reached, so a
 * stamp that could move the record backwards would understate how far boot got
 * and point whoever reads it at the wrong layer. `script` is the one exception:
 * Retry remounts the WebView under a new key, and boot genuinely starts over.
 */
export const stampBootStage = (stage: BootStage): BootStage => {
  const previous = readBootRecord();
  if (stage === 'script' || !previous) {
    const now = Date.now();
    const fresh: BootRecord = { stage, at: now, startedAt: now, history: [stage] };
    Reflect.set(globalThis, bootGlobalKey, fresh);
    return stage;
  }
  if (bootStageIndex(stage) <= bootStageIndex(previous.stage)) {
    return previous.stage;
  }
  Reflect.set(globalThis, bootGlobalKey, {
    stage,
    at: Date.now(),
    // Carried forward, never re-stamped: the elapsed time is measured from the
    // start of the attempt, and a later stage resetting it would report every
    // boot as instant.
    startedAt: previous.startedAt,
    history: [...previous.history, stage],
  } satisfies BootRecord);
  return stage;
};

/** Test seam, and what Retry calls before remounting. */
export const resetBoot = (): void => {
  Reflect.deleteProperty(globalThis, bootGlobalKey);
};
