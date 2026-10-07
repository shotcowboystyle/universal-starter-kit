/**
 * The layout runner, design §8. Probed, never assumed.
 *
 * `layout()` is a Promise on every path, so the API does not move when the
 * runner does. Which runner answers is a RUNTIME question with three honest
 * answers and one dishonest one:
 *
 *  - `worker-blob` — the good case on web and, if the platform allows it,
 *    inside a WebView. Built from the committed string in
 *    `worker.generated.ts` through `URL.createObjectURL`, so it needs no
 *    module support, no origin and no bundler cooperation.
 *  - `hermes-inline` — the good case on native, and a FIRST-CLASS runner, not
 *    a fallback. On native the RN runtime is a different engine on a different
 *    thread from the WebView's, so a 300 ms dagre run costs the canvas zero
 *    frames with no worker involved. Nothing is warned about here.
 *  - `inline` on a platform with no `Worker` and no Hermes — a plain web page
 *    in a very old browser, or a spec run. Honest, and rare.
 *  - `inline` on a platform that HAS `Worker` — the dishonest one, and the
 *    reason this module reports rather than shrugs. That case produces
 *    perfectly plausible frame numbers that mean nothing, so it warns once,
 *    records a reason `readLayoutRunnerFallback()` returns, and surfaces as
 *    `layoutRunner` in diagnostics. Design §13.2 makes a device perf run that
 *    resolved this way fail BY DEFINITION.
 *
 * `worker-url` is in the union because design §8 names it. This module never
 * returns it: a URL worker needs `new URL(..., import.meta.url)`, which is a
 * parse-time SyntaxError in the classic script a DOM component's WebView
 * runs. The member stays so a consumer switching on the kind is exhaustive
 * against the design's vocabulary rather than ours.
 */

import { layoutWithDagre } from './dagre';
import type { LayoutRequest, LayoutResult, LayoutRunnerKind, LayoutWorkerResponse } from './types';
import { layoutWorkerSource } from './worker.generated';

/** Design §8's number. A worker that has not answered in half a second is not going to. */
export const defaultProbeTimeoutMs = 500;

export interface LayoutRunner {
  readonly kind: LayoutRunnerKind;
  readonly run: (request: LayoutRequest) => Promise<LayoutResult>;
  readonly dispose: () => void;
}

export interface LayoutRunnerOptions {
  /** Overridable so a spec can drive the timeout without a five-second wait. */
  readonly probeTimeoutMs?: number;
}

export interface LayoutRunnerFallback {
  readonly reason: string;
  /** The kind we settled for. */
  readonly kind: LayoutRunnerKind;
}

/**
 * Minimal shape, so a spec can supply a fake and so no `lib.dom` `Worker`
 * type leaks into a package that also builds for native.
 */
interface WorkerLike {
  postMessage: (message: unknown) => void;
  addEventListener: (type: string, listener: (event: { data?: unknown }) => void) => void;
  removeEventListener?: (type: string, listener: (event: { data?: unknown }) => void) => void;
  terminate: () => void;
}

type WorkerCtor = new (url: string) => WorkerLike;

let fallback: LayoutRunnerFallback | null = null;
let cached: Promise<LayoutRunner> | undefined;
let warned = false;

/** Null when the resolved runner is the right one for the platform. */
export function readLayoutRunnerFallback(): LayoutRunnerFallback | null {
  return fallback;
}

/** Test seam, and the hook a host uses to re-probe after a realm change. */
export function resetLayoutRunner(): void {
  const pending = cached;
  cached = undefined;
  fallback = null;
  warned = false;
  if (pending) {
    void pending
      .then((runner) => {
        runner.dispose();
      })
      .catch(() => {});
  }
}

function reportFallback(kind: LayoutRunnerKind, reason: string): void {
  fallback = { kind, reason };
  if (warned || process.env.NODE_ENV === 'production') {
    return;
  }
  warned = true;
  // oxlint-disable-next-line no-console -- the sink design §8 asks for by name
  console.warn(
    `[@repo/node-graph] auto-layout fell back to \`${kind}\`: ${reason}. ` +
      'A relayout will run on the main thread and can drop frames. A device perf run ' +
      'that resolved this way is not a valid measurement (design §13.2).',
  );
}

function hermesPresent(): boolean {
  const marker = (globalThis as { HermesInternal?: unknown }).HermesInternal;
  return marker !== undefined && marker !== null;
}

function workerConstructor(): WorkerCtor | undefined {
  const ctor = (globalThis as { Worker?: unknown }).Worker;
  return typeof ctor === 'function' ? (ctor as WorkerCtor) : undefined;
}

function inlineRunner(kind: 'inline' | 'hermes-inline'): LayoutRunner {
  return {
    kind,
    // Still a Promise. `layout()`'s contract does not bend for the runner, and
    // a caller that awaits on web must not have to branch on native.
    run: async (request) => ({ ...layoutWithDagre(request), runner: kind }),
    dispose: () => {},
  };
}

/** `hermes-inline` where Hermes is real, plain `inline` otherwise. */
function nativeOrPlainInline(): LayoutRunner {
  return inlineRunner(hermesPresent() ? 'hermes-inline' : 'inline');
}

function spawnBlobWorker(Ctor: WorkerCtor): { worker: WorkerLike; revoke: () => void } {
  const blob = new Blob([layoutWorkerSource], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    return {
      worker: new Ctor(url),
      // Revoked once the worker is up: the worker keeps its own reference to
      // the script it already fetched, and an un-revoked object URL is a leak
      // that lives as long as the document.
      revoke: () => {
        URL.revokeObjectURL(url);
      },
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/** `{ t: "ping" }` out, `pong` in, or the timeout wins. Never throws. */
async function probe(worker: WorkerLike, timeoutMs: number): Promise<string | null> {
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (reason: string | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      worker.removeEventListener?.('message', onMessage);
      worker.removeEventListener?.('error', onError);
      resolve(reason);
    };
    const onMessage = (event: { data?: unknown }) => {
      if ((event.data as LayoutWorkerResponse | undefined)?.t === 'pong') {
        finish(null);
      }
    };
    const onError = () => {
      finish('the worker raised an error event before answering');
    };
    const timer = setTimeout(() => {
      finish(`no \`pong\` within ${timeoutMs} ms of the ping`);
    }, timeoutMs);
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    try {
      worker.postMessage({ t: 'ping' });
    } catch (error) {
      finish(error instanceof Error ? error.message : String(error));
    }
  });
}

function workerRunner(worker: WorkerLike, revoke: () => void): LayoutRunner {
  let nextId = 1;
  const pending = new Map<number, { resolve: (result: LayoutResult) => void; reject: (error: Error) => void }>();

  worker.addEventListener('message', (event) => {
    const response = event.data as LayoutWorkerResponse | undefined;
    if (!response || response.t === 'pong') {
      return;
    }
    const entry = pending.get(response.id);
    if (!entry) {
      return;
    }
    pending.delete(response.id);
    // The kind is stamped HERE. The engine ran in a realm that does not know
    // which runner it is, and design §13.2 wants it on every result.
    if (response.t === 'result') {
      entry.resolve({ ...response.result, runner: 'worker-blob' });
    } else {
      entry.reject(new Error(response.message));
    }
  });

  // A worker that dies mid-flight must not leave every awaiting caller hanging
  // forever; a rejected promise is something a canvas can report.
  worker.addEventListener('error', () => {
    const dead = [...pending.values()];
    pending.clear();
    for (const entry of dead) {
      entry.reject(new Error('the layout worker raised an error event'));
    }
  });

  return {
    kind: 'worker-blob',
    run: async (request) =>
      await new Promise<LayoutResult>((resolve, reject) => {
        // Ids, not arrival order: two relayouts can be in flight at once and
        // the second may well answer first.
        const id = nextId++;
        pending.set(id, { resolve, reject });
        worker.postMessage({ t: 'layout', id, request });
      }),
    dispose: () => {
      pending.clear();
      revoke();
      worker.terminate();
    },
  };
}

export async function createLayoutRunner(options: LayoutRunnerOptions = {}): Promise<LayoutRunner> {
  const Ctor = workerConstructor();
  if (!Ctor) {
    // No `Worker` at all. On native that is the DESIGNED path, not a failure,
    // so nothing is reported — see the module header.
    return nativeOrPlainInline();
  }

  let spawned: { worker: WorkerLike; revoke: () => void };
  try {
    spawned = spawnBlobWorker(Ctor);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const runner = nativeOrPlainInline();
    reportFallback(runner.kind, `the blob worker could not be constructed (${reason})`);
    return runner;
  }

  const refusal = await probe(spawned.worker, options.probeTimeoutMs ?? defaultProbeTimeoutMs);
  if (refusal === null) {
    return workerRunner(spawned.worker, spawned.revoke);
  }

  spawned.revoke();
  spawned.worker.terminate();
  const runner = nativeOrPlainInline();
  reportFallback(runner.kind, refusal);
  return runner;
}

/**
 * The process-wide runner. Probing costs a worker spawn and a round trip, and
 * doing it per relayout would put that on the interaction it is meant to make
 * cheap.
 */
export async function getLayoutRunner(options?: LayoutRunnerOptions): Promise<LayoutRunner> {
  cached ??= createLayoutRunner(options);
  return await cached;
}

export async function resolveRunner(options?: LayoutRunnerOptions): Promise<LayoutRunnerKind> {
  return (await getLayoutRunner(options)).kind;
}
