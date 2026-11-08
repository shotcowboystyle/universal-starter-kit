/**
 * The worker side of auto-layout, and the ROOT of the bundle
 * `scripts/build-layout-worker.mjs` emits into `worker.generated.ts`.
 *
 * Two jobs, deliberately in one file:
 *
 *  - `runLayoutMessage` is the dispatch, and it is PURE. The inline and
 *    Hermes-inline runners call it directly on their own thread, so all three
 *    runners answer the same protocol with the same code rather than two
 *    implementations that drift.
 *  - The side effect at the bottom wires that dispatch to `self` — but ONLY
 *    inside a real `WorkerGlobalScope`.
 *
 * That guard is the load-bearing line. `runner.ts` imports `runLayoutMessage`
 * from here for its inline path, so this module is evaluated on the MAIN
 * thread too, where `self` is `window` and `self.postMessage` is a real
 * function. A `typeof self.postMessage === "function"` guard would therefore
 * have passed on the main thread and installed a `message` listener on the
 * window that answers every `postMessage` any library on the page makes.
 * `instanceof WorkerGlobalScope` is false there and true in a worker, which is
 * the distinction that actually matters.
 *
 * No `import.meta`, and none reachable: `verify-no-import-meta.mjs` walks this
 * file, and `worker.generated.test.ts` re-asserts it against the BUNDLED
 * string, which is the artefact a WebView actually parses.
 */

import { layoutWithDagre } from './dagre';
import type { LayoutWorkerRequest, LayoutWorkerResponse } from './types';

/**
 * A message in, a message out, or `undefined` for something this worker does
 * not answer. Never throws: a throw inside a Worker surfaces as an `error`
 * event with no line number in a WebView, so a failure is reported as data.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the raw `MessageEvent#data` at the worker boundary; it is narrowed below
export const runLayoutMessage = (data: unknown): LayoutWorkerResponse | undefined => {
  // SAFETY: only the `t` tag is read before dispatch, and an unknown tag
  // returns undefined; non-objects are rejected on the next line.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- untyped message data at the worker boundary
  const message = data as LayoutWorkerRequest | null | undefined;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- rejects primitive message payloads at the worker boundary
  if (!message || typeof message !== 'object') {
    return undefined;
  }
  if (message.t === 'ping') {
    return { t: 'pong' };
  }
  if (message.t !== 'layout') {
    return undefined;
  }
  try {
    return { t: 'result', id: message.id, result: layoutWithDagre(message.request) };
  } catch (error) {
    return {
      t: 'error',
      id: message.id,
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

declare const WorkerGlobalScope: (abstract new () => object) | undefined;
declare const self: {
  readonly addEventListener: (type: 'message', listener: (event: { readonly data: unknown }) => void) => void;
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- mirrors WorkerGlobalScope#postMessage
  readonly postMessage: (message: unknown) => void;
};

const inWorkerScope = (): boolean =>
  // `typeof`, not `!== undefined`: outside a worker these globals are
  // undeclared, and reading an undeclared identifier throws a ReferenceError.
  // oxlint-disable-next-line unicorn/no-typeof-undefined -- see above
  typeof WorkerGlobalScope !== 'undefined' &&
  // oxlint-disable-next-line unicorn/no-typeof-undefined -- see above
  typeof self !== 'undefined' &&
  // SAFETY: the typeof check above proves WorkerGlobalScope is defined here.
  self instanceof (WorkerGlobalScope as abstract new () => object);

if (inWorkerScope()) {
  self.addEventListener('message', (event) => {
    const response = runLayoutMessage(event.data);
    if (response) {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- WorkerGlobalScope#postMessage has no targetOrigin parameter
      self.postMessage(response);
    }
  });
}
