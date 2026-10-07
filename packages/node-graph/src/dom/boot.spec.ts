/**
 * The boot heartbeat's ELAPSED time — the number design 9.4's watchdog should
 * have been set from and never was.
 *
 * `stage` alone answers "how far did it get". It cannot answer "was 4000 ms
 * enough", which is the question emulator-5590 asked by failing the watchdog on
 * a canvas that rendered on the first Retry (MPO-211). `startedAt` is stamped
 * once per attempt and carried forward by every later stage, so `now -
 * startedAt` is the whole boot rather than the gap since the last stamp.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  bootGlobalKey,
  graphReadySettleMs,
  readBootElapsedMs,
  readBootRecord,
  resetBoot,
  stampBootStage,
} from './boot';

function slot(): Record<string, unknown> {
  return globalThis as unknown as Record<string, unknown>;
}

beforeEach(() => {
  resetBoot();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  resetBoot();
});

describe("the boot record's start", () => {
  it('is stamped once and carried forward, so elapsed is the whole boot', () => {
    vi.setSystemTime(new Date(1_000_000));
    stampBootStage('script');
    vi.setSystemTime(new Date(1_000_400));
    stampBootStage('module');
    vi.setSystemTime(new Date(1_002_500));
    stampBootStage('ready');

    const record = readBootRecord();
    expect(record?.startedAt).toBe(1_000_000);
    // `at` moved with the last stamp; `startedAt` did not. Re-stamping the
    // start on every stage would report every boot as instant.
    expect(record?.at).toBe(1_002_500);
    expect(readBootElapsedMs(1_002_500)).toBe(2500);
  });

  it('restarts with `script`, because Retry is a new WebView', () => {
    vi.setSystemTime(new Date(1_000_000));
    stampBootStage('script');
    vi.setSystemTime(new Date(1_005_000));
    stampBootStage('script');
    expect(readBootRecord()?.startedAt).toBe(1_005_000);
    expect(readBootElapsedMs(1_005_100)).toBe(100);
  });

  it('reads back a record the entry wrote inline, which carries no startedAt', () => {
    // `NodeGraphDomShell.ts` may not import this module, so an older bundle's
    // inline stamp can be `{ stage, at, history }`. Reading that back as an
    // elapsed time of zero is honest; reading it as `now - 0` would report a
    // boot that took fifty-six years.
    slot()[bootGlobalKey] = { stage: 'script', at: 1_000_000, history: ['script'] };
    expect(readBootRecord()?.startedAt).toBe(1_000_000);
    expect(readBootElapsedMs(1_000_250)).toBe(250);
  });

  it('has no elapsed time where there is no record', () => {
    expect(readBootElapsedMs()).toBeNull();
  });

  it('never reports a negative elapsed time when a clock steps backwards', () => {
    vi.setSystemTime(new Date(1_000_000));
    stampBootStage('script');
    expect(readBootElapsedMs(999_000)).toBe(0);
  });
});

describe('the settle grace', () => {
  it("leaves room over GraphFaces' own asset-URL timeout", () => {
    // `GraphFaces` waits 1500 ms for an asset URL before falling back to the
    // bytes. A grace at or under that would snapshot the delivery mid-probe and
    // report `pending` for a face that was about to resolve.
    expect(graphReadySettleMs).toBeGreaterThan(1500);
  });
});
