/**
 * A guarded `structuredClone`, because dagre needs one and two of this
 * package's three layout realms do not have it.
 *
 * FOUND BY RUNNING THE ARTEFACT, not by reading a changelog.
 * `worker.generated.spec.ts` evaluates the bundled worker in a synthetic
 * worker scope and drives a real layout through it; the first run came back
 * `{"t":"error","message":"structuredClone is not defined"}`. dagre 3.1.1 calls
 * it twice — once in `graphlib`'s JSON writer, and once on the POSITIONING hot
 * path (`positionX`'s balance step), which every `layout()` call reaches.
 *
 * Where it is missing:
 *
 *  - **Hermes.** React Native 0.83.2 ships an implementation at
 *    `src/private/webapis/structuredClone/structuredClone.js` and installs it
 *    as a global from nowhere — nothing in `Libraries/Core` imports it. So the
 *    `hermes-inline` runner, which design §8 makes a first-class runner and
 *    not a fallback, would throw on the first tidy on device. That is the
 *    failure this file exists to prevent, and it is exactly the kind that a
 *    green web suite hides.
 *  - **Older WebViews.** `structuredClone` is Safari 15.4 / iOS 15.4 and
 *    Chrome 98. A WKWebView below that parses the worker fine and dies on the
 *    first layout, which is the worst shape of failure this package has.
 *
 * WHAT IT CLONES. Only what dagre asks of it: plain objects, arrays, `Map`,
 * `Set`, `Date`, `RegExp` and primitives, with cycles preserved. Not transfer
 * lists, not `ArrayBuffer`, not `Blob`, not `Error`. A value outside that set
 * throws, the way the real algorithm throws `DataCloneError` — inventing a
 * silent shallow copy for a case dagre never produces would be a worse lie
 * than a loud refusal.
 *
 * It installs on `globalThis` ONLY when the global is absent, so a real engine
 * implementation always wins and nothing here shadows the platform.
 */

type CloneCache = Map<unknown, unknown>;

function cloneInto(value: unknown, seen: CloneCache): unknown {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function') {
      throw new TypeError('structuredClone: a function could not be cloned.');
    }
    return value;
  }
  const cached = seen.get(value);
  if (cached !== undefined) {
    return cached;
  }

  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags);
  }

  if (Array.isArray(value)) {
    const out: unknown[] = Array.from({ length: value.length });
    seen.set(value, out);
    for (let index = 0; index < value.length; index += 1) {
      out[index] = cloneInto(value[index], seen);
    }
    return out;
  }

  if (value instanceof Map) {
    const out = new Map<unknown, unknown>();
    seen.set(value, out);
    for (const [key, item] of value) {
      out.set(cloneInto(key, seen), cloneInto(item, seen));
    }
    return out;
  }

  if (value instanceof Set) {
    const out = new Set<unknown>();
    seen.set(value, out);
    for (const item of value) {
      out.add(cloneInto(item, seen));
    }
    return out;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`structuredClone: ${prototype?.constructor?.name ?? 'object'} could not be cloned.`);
  }

  const out: Record<string, unknown> = {};
  seen.set(value, out);
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = cloneInto(item, seen);
  }
  return out;
}

/** The shim itself, exported so a spec can drive it without touching a global. */
export function cloneStructured<T>(value: T): T {
  return cloneInto(value, new Map()) as T;
}

interface CloneCapableGlobal {
  structuredClone?: <T>(value: T) => T;
}

/**
 * Idempotent and cheap: one `typeof` on the happy path, which is every browser
 * and every worker made this decade. Called at the top of `layoutWithDagre`
 * rather than as a module side effect so nothing depends on import ORDER —
 * a formatter that reorders two imports must not be able to break a runtime.
 */
export function ensureStructuredClone(): void {
  const scope = globalThis as CloneCapableGlobal;
  if (typeof scope.structuredClone === 'function') {
    return;
  }
  scope.structuredClone = cloneStructured;
}
