/**
 * Task 4.3. The runner is PROBED, never assumed.
 *
 * Design §8 is explicit that whether a blob-URL Worker is permitted inside
 * WKWebView on a `file://` origin is genuinely unknown, so `resolveRunner()`
 * constructs one, posts `{ t: "ping" }`, and waits 500 ms for `pong`. These
 * cases drive that through the REAL code path: a fake `Worker` on the global,
 * a real `Blob`, a real `createObjectURL`. Stubbing the runner's own internals
 * would prove only that the stub works.
 *
 * The fallback is loud on purpose. A canvas that quietly resolved to `inline`
 * on a platform that HAS `Worker` produces perfectly plausible frame numbers
 * that mean nothing, which is the failure mode design §13.2 names.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reconcilePositions } from './layout';
import {
  createLayoutRunner,
  defaultProbeTimeoutMs,
  readLayoutRunnerFallback,
  resetLayoutRunner,
  resolveRunner,
} from './runner';
import type { LayoutRequest, LayoutResult, LayoutWorkerResponse } from './types';

type Listener = (event: { data?: unknown }) => void;

/** Every fake `Worker` this file constructs, newest last. */
let spawned: FakeWorker[] = [];

class FakeWorker {
  static answerPing = true;
  static answerLayout = true;
  static throwOnConstruct = false;

  readonly url: string;
  readonly posted: unknown[] = [];
  terminated = false;
  private readonly listeners = new Map<string, Listener[]>();

  constructor(url: string) {
    if (FakeWorker.throwOnConstruct) {
      throw new Error('SecurityError: blob worker refused');
    }
    this.url = url;
    spawned.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((l) => l !== listener),
    );
  }

  postMessage(message: unknown) {
    this.posted.push(message);
    const request = message as { t?: string; id?: number };
    if (request?.t === 'ping' && FakeWorker.answerPing) {
      this.emit({ t: 'pong' });
    }
    if (request?.t === 'layout' && FakeWorker.answerLayout) {
      this.emit({
        t: 'result',
        id: request.id!,
        result: {
          positions: { a: { x: 1, y: 2 } },
          moved: ['a'],
          engine: 'dagre',
          ms: 3,
        } satisfies LayoutResult,
      });
    }
  }

  terminate() {
    this.terminated = true;
  }

  emit(data: LayoutWorkerResponse) {
    for (const listener of this.listeners.get('message') ?? []) {
      listener({ data });
    }
  }

  fail() {
    for (const listener of this.listeners.get('error') ?? []) {
      listener({});
    }
  }
}

const request: LayoutRequest = {
  nodes: [
    { id: 'a', width: 190, height: 72, position: { x: 0, y: 0 } },
    { id: 'b', width: 190, height: 72, position: { x: 0, y: 0 } },
  ],
  edges: [{ id: 'a->b', source: 'a', target: 'b' }],
};

function withWorker() {
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:mpo-graph-layout'),
    revokeObjectURL: vi.fn(),
  });
}

function withoutWorker() {
  vi.stubGlobal('Worker');
}

beforeEach(() => {
  spawned = [];
  FakeWorker.answerPing = true;
  FakeWorker.answerLayout = true;
  FakeWorker.throwOnConstruct = false;
  resetLayoutRunner();
});

afterEach(() => {
  resetLayoutRunner();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe(resolveRunner, () => {
  it('returns `worker-blob` when Worker exists and the ping answers', async () => {
    withWorker();
    await expect(resolveRunner()).resolves.toBe('worker-blob');
    expect(spawned).toHaveLength(1);
    expect(spawned[0].posted[0]).toEqual({ t: 'ping' });
  });

  it('builds the worker from a blob URL, not a file URL', async () => {
    withWorker();
    await resolveRunner();
    expect(spawned[0].url).toBe('blob:mpo-graph-layout');
  });

  it('falls back to `inline` when the ping times out, and says so loudly', async () => {
    vi.useFakeTimers();
    withWorker();
    FakeWorker.answerPing = false;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pending = resolveRunner();
    await vi.advanceTimersByTimeAsync(defaultProbeTimeoutMs + 1);
    await expect(pending).resolves.toBe('inline');
    expect(readLayoutRunnerFallback()?.reason).toMatch(/ping/i);
    expect(warn).toHaveBeenCalledWith();
    warn.mockRestore();
  });

  it('terminates the worker it gave up on rather than leaking it', async () => {
    vi.useFakeTimers();
    withWorker();
    FakeWorker.answerPing = false;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pending = resolveRunner();
    await vi.advanceTimersByTimeAsync(defaultProbeTimeoutMs + 1);
    await pending;
    expect(spawned[0].terminated).toBe(true);
  });

  it('does not wait the full timeout when the ping answers', async () => {
    vi.useFakeTimers();
    withWorker();
    // No timer advance at all: a resolved probe must not be gated on the clock.
    await expect(resolveRunner()).resolves.toBe('worker-blob');
  });

  it('falls back to `inline` when constructing the worker throws', async () => {
    withWorker();
    FakeWorker.throwOnConstruct = true;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(resolveRunner()).resolves.toBe('inline');
    expect(readLayoutRunnerFallback()?.reason).toMatch(/refused|SecurityError/i);
  });

  it('falls back to `inline` when the worker reports an error event', async () => {
    vi.useFakeTimers();
    withWorker();
    FakeWorker.answerPing = false;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pending = resolveRunner();
    await vi.advanceTimersByTimeAsync(0);
    spawned[0].fail();
    await expect(pending).resolves.toBe('inline');
  });

  it('returns `hermes-inline` when Worker is undefined and Hermes is present', async () => {
    withoutWorker();
    vi.stubGlobal('HermesInternal', { getRuntimeProperties: () => ({}) });
    await expect(resolveRunner()).resolves.toBe('hermes-inline');
  });

  it('`hermes-inline` is not a fallback, so nothing is reported against it', async () => {
    withoutWorker();
    vi.stubGlobal('HermesInternal', {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await resolveRunner();
    expect(readLayoutRunnerFallback()).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns `inline` when Worker is undefined and Hermes is not there either', async () => {
    withoutWorker();
    vi.stubGlobal('HermesInternal');
    await expect(resolveRunner()).resolves.toBe('inline');
  });

  it('probes once and caches: a second call spawns no second worker', async () => {
    withWorker();
    await resolveRunner();
    await resolveRunner();
    expect(spawned).toHaveLength(1);
  });
});

describe('the runner runs layouts', () => {
  it("worker-blob: `run` returns a Promise and resolves with the worker's result", async () => {
    withWorker();
    const runner = await createLayoutRunner();
    const promise = runner.run(request);
    expect(promise).toBeInstanceOf(Promise);
    await expect(promise).resolves.toMatchObject({ engine: 'dagre', moved: ['a'] });
  });

  it('worker-blob: concurrent runs are matched by id, not by arrival order', async () => {
    withWorker();
    FakeWorker.answerLayout = false;
    const runner = await createLayoutRunner();
    const first = runner.run(request);
    const second = runner.run(request);
    const worker = spawned[0];
    const ids = (worker.posted.slice(1) as { id: number }[]).map((m) => m.id);
    expect(new Set(ids).size).toBe(2);
    // Answer the SECOND one first.
    worker.emit({
      t: 'result',
      id: ids[1],
      result: { positions: { z: { x: 9, y: 9 } }, moved: ['z'], engine: 'dagre', ms: 1 },
    });
    await expect(second).resolves.toMatchObject({ moved: ['z'] });
    worker.emit({
      t: 'result',
      id: ids[0],
      result: { positions: { y: { x: 1, y: 1 } }, moved: ['y'], engine: 'dagre', ms: 1 },
    });
    await expect(first).resolves.toMatchObject({ moved: ['y'] });
  });

  it('worker-blob: an `error` reply rejects that run and no other', async () => {
    withWorker();
    FakeWorker.answerLayout = false;
    const runner = await createLayoutRunner();
    const failing = runner.run(request);
    const { id } = spawned[0].posted[1] as { id: number };
    spawned[0].emit({ t: 'error', id, message: 'boom' });
    await expect(failing).rejects.toThrow(/boom/);
  });

  it('inline: `run` still returns a Promise and a real dagre layout', async () => {
    withoutWorker();
    const runner = await createLayoutRunner();
    expect(runner.kind).toBe('inline');
    const promise = runner.run(request);
    expect(promise).toBeInstanceOf(Promise);
    const result = await promise;
    expect(Object.keys(result.positions).sort()).toEqual(['a', 'b']);
    expect(result.positions.b.y).toBeGreaterThan(result.positions.a.y);
  });

  it('hermes-inline: same Promise, same engine — the API does not move when the runner does', async () => {
    withoutWorker();
    vi.stubGlobal('HermesInternal', {});
    const runner = await createLayoutRunner();
    expect(runner.kind).toBe('hermes-inline');
    await expect(runner.run(request)).resolves.toMatchObject({ engine: 'dagre' });
  });

  it('stamps the runner on every result, whichever realm ran it', async () => {
    withWorker();
    const worker = await createLayoutRunner();
    await expect(worker.run(request)).resolves.toMatchObject({ runner: 'worker-blob' });
    resetLayoutRunner();
    withoutWorker();
    vi.stubGlobal('HermesInternal', {});
    const hermes = await createLayoutRunner();
    await expect(hermes.run(request)).resolves.toMatchObject({ runner: 'hermes-inline' });
  });

  it('disposing terminates the worker', async () => {
    withWorker();
    const runner = await createLayoutRunner();
    runner.dispose();
    expect(spawned[0].terminated).toBe(true);
  });
});

describe('buildLayoutRequest — which box the engine is given', () => {
  it('prefers a MEASURED box over the seed, and a document size over both', async () => {
    const { buildLayoutRequest } = await import('./layout');
    const { demoDocument, demoSchema } = await import('../react-flow/fixtures');
    const document = demoDocument();
    const sized = {
      ...document,
      nodes: document.nodes.map((node, index) => (index === 0 ? { ...node, size: { width: 500, height: 400 } } : node)),
    } as typeof document;

    const built = buildLayoutRequest(sized, demoSchema(), {
      measured: { a: { width: 1, height: 1 }, b: { width: 210, height: 160 } },
    });
    const box = (id: string) => built.nodes.find((node) => node.id === id);

    // `a` carries a document size, which beats the measured box.
    expect(box('a')).toMatchObject({ width: 500, height: 400 });
    // `b` has only a measured box; it beats the 190 × 72 seed.
    expect(box('b')).toMatchObject({ width: 210, height: 160 });
    // `c` has neither, so the seed stands. Its kind declares width 240.
    expect(box('c')?.width).toBe(240);
  });

  it('falls back to the seed for a node React Flow has not measured yet', async () => {
    const { buildLayoutRequest } = await import('./layout');
    const { demoDocument, demoSchema } = await import('../react-flow/fixtures');
    const built = buildLayoutRequest(demoDocument(), demoSchema(), { measured: {} });
    for (const node of built.nodes) {
      expect(node.width, node.id).toBeGreaterThan(0);
      expect(node.height, node.id).toBeGreaterThan(0);
    }
  });
});

describe('reconcilePositions — the generation guard', () => {
  const result: LayoutResult = {
    positions: { a: { x: 1, y: 1 }, b: { x: 2, y: 2 }, c: { x: 3, y: 3 } },
    moved: ['a', 'b', 'c'],
    engine: 'dagre',
    ms: 4,
  };

  it('applies the whole result when nothing was touched', () => {
    expect(reconcilePositions(result, new Set())).toEqual(result.positions);
  });

  it('drops only the nodes touched since the request went out', () => {
    // Design §8: dropping the WHOLE result makes a relayout feel like it
    // silently failed, so a stale result still lands on everything else.
    const positions = reconcilePositions(result, new Set(['b']));
    expect(Object.keys(positions).sort()).toEqual(['a', 'c']);
    expect(positions.a).toEqual({ x: 1, y: 1 });
  });

  it('returns an empty map when every node was touched, rather than an unsound partial', () => {
    expect(reconcilePositions(result, new Set(['a', 'b', 'c']))).toEqual({});
  });

  it('ignores a touched id the result never mentioned', () => {
    expect(reconcilePositions(result, new Set(['ghost']))).toEqual(result.positions);
  });
});
