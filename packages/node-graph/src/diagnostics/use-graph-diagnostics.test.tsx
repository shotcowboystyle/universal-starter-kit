/**
 * Diagnostics, and the failure they exist for (design §9.5, MPO-211 task 2.6).
 *
 * A WebView that comes up empty has no console the user can open. Layers 1-4 of
 * design §9.4 stop the blank rectangle; this is what makes the surviving
 * failure legible — which stage boot reached, which renderer, which layout
 * runner, whether the face painted, and what threw.
 *
 * The line that carries the most weight: **a thrown module import surfaces as
 * `lastError.phase === "module"` rather than a blank render.** That is the
 * failure design §9.4 layer 3 is built around, and the one an agent reading a
 * screenshot has to be able to name.
 */

import fs from 'node:fs';
import path from 'node:path';

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { resetBoot, stampBootStage } from '../dom/boot';
import { xyflowVersion } from '../react-flow/xy';

import { graphErrorGlobalKey, readGraphError, recordGraphError, resetGraphError } from './last-error';
import { useGraphDiagnostics } from './use-graph-diagnostics';

const baseInput = {
  renderer: 'react-flow-dom',
  nodesMounted: 12,
  nodesInDocument: 12,
  culling: true,
  renderMode: 'detail',
  scheme: 'light',
} as const;

describe('use-graph-diagnostics module', () => {
  afterEach(() => {
    resetBoot();
    resetGraphError();
  });

  describe(useGraphDiagnostics, () => {
    it('reports the last boot stage, not the first', () => {
      stampBootStage('script');
      stampBootStage('module');
      stampBootStage('faces');
      const { result } = renderHook(() => useGraphDiagnostics(baseInput));
      expect(result.current.stage).toBe('faces');
    });

    it('RE-READS the stage on a later render, not once at mount', () => {
      // Found on the Storybook, not here, and then brought back as a spec. The
      // hook derives from two globals nothing in its input mentions, so a memo
      // keyed on the input alone captures them at mount and never looks again —
      // and the boot stages are stamped by an EFFECT, which runs after that
      // first render. The panel then reports `stage: none` on a boot that
      // reached `faces`, which is the one number it exists to get right.
      const { result, rerender } = renderHook(() => useGraphDiagnostics(baseInput));
      expect(result.current.stage).toBeNull();
      stampBootStage('script');
      stampBootStage('module');
      rerender();
      expect(result.current.stage).toBe('module');
    });

    it('RE-READS lastError on a later render, for the same reason', () => {
      const { result, rerender } = renderHook(() => useGraphDiagnostics(baseInput));
      expect(result.current.lastError).toBeNull();
      recordGraphError({ phase: 'module', message: 'thrown after mount' });
      rerender();
      expect(result.current.lastError?.phase).toBe('module');
    });

    it('keeps a stable identity when nothing moved, so a consumer memo still holds', () => {
      const { result, rerender } = renderHook(() => useGraphDiagnostics(baseInput));
      const first = result.current;
      rerender();
      expect(result.current).toBe(first);
    });

    it('reports a null stage when boot never stamped one, rather than inventing script', () => {
      const { result } = renderHook(() => useGraphDiagnostics(baseInput));
      expect(result.current.stage).toBeNull();
    });

    it('reports the real @xyflow version, and it is not the empty string task 2.4 emitted', () => {
      const { result } = renderHook(() => useGraphDiagnostics(baseInput));
      expect(result.current.xyflowVersion).toBe(xyflowVersion);
      expect(result.current.xyflowVersion).not.toBe('');
      expect(result.current.xyflowVersion).toMatch(/^\d+\.\d+\.\d+/u);
    });

    it('reports layoutRunner as none until milestone 4 resolves one, never a guess', () => {
      const { result } = renderHook(() => useGraphDiagnostics(baseInput));
      expect(result.current.layoutRunner).toBe('none');
      const resolved = renderHook(() => useGraphDiagnostics({ ...baseInput, layoutRunner: 'worker-blob' }));
      expect(resolved.result.current.layoutRunner).toBe('worker-blob');
    });

    it('passes renderMode, culling, scheme and the mounted count straight through', () => {
      const { result } = renderHook(() =>
        useGraphDiagnostics({
          ...baseInput,
          renderMode: 'overview',
          culling: false,
          scheme: 'dark',
          nodesMounted: 200,
          nodesInDocument: 200,
        }),
      );
      expect(result.current.renderMode).toBe('overview');
      expect(result.current.culling).toBe(false);
      expect(result.current.scheme).toBe('dark');
      expect(result.current.nodesMounted).toBe(200);
    });

    it('reports the face probes it was handed', () => {
      const faces = [
        {
          stack: 'Inter, sans-serif',
          widthStack: 100,
          widthFirstCorrupted: 120,
          matched: true,
          conclusive: true,
        },
      ];
      const { result } = renderHook(() => useGraphDiagnostics({ ...baseInput, faces }));
      expect(result.current.faces).toStrictEqual(faces);
    });

    it('reports no faces as an empty list, not as a missing key', () => {
      const { result } = renderHook(() => useGraphDiagnostics(baseInput));
      expect(result.current.faces).toStrictEqual([]);
    });
  });

  describe('the module-import failure — what design §9.4 layer 3 exists for', () => {
    it('surfaces a thrown module import as lastError.phase === "module"', () => {
      recordGraphError({ phase: 'module', message: "Cannot use 'import.meta' outside a module" });
      const { result } = renderHook(() => useGraphDiagnostics(baseInput));
      expect(result.current.lastError).not.toBeNull();
      expect(result.current.lastError?.phase).toBe('module');
      expect(result.current.lastError?.message).toContain('import.meta');
    });

    it('keeps the FIRST error rather than the last, because a cascade buries the cause', () => {
      // A module-eval throw usually produces render errors behind it. The one
      // worth reporting is the one that started it.
      recordGraphError({ phase: 'module', message: 'the real cause' });
      recordGraphError({ phase: 'render', message: 'a consequence' });
      expect(readGraphError()?.phase).toBe('module');
      expect(readGraphError()?.message).toBe('the real cause');
    });

    it('reads a record another library clobbered as null instead of throwing', () => {
      Reflect.set(globalThis, graphErrorGlobalKey, 'not an object');
      expect(readGraphError()).toBeNull();
      const { result } = renderHook(() => useGraphDiagnostics(baseInput));
      expect(result.current.lastError).toBeNull();
    });

    it("refuses a phase outside the wire's four", () => {
      recordGraphError({ phase: 'wat' as never, message: 'x' });
      expect(readGraphError()).toBeNull();
    });
  });

  describe('the shell writes the slot this module reads', () => {
    // `node-graph-dom-shell.ts` cannot import this module — it must carry no
    // top-level import of ours that could itself throw (design §9.4 layer 3) — so
    // it writes the global INLINE. That literal and this module's key are the one
    // place the two halves could silently drift, exactly as `bootGlobalKey` is
    // for boot.
    //
    // It moved out of `node-graph-dom.ts` when the `'use dom'` entry became
    // app-owned (design §9.3): the entry is now three lines an app copies, and
    // every mechanism this asserts lives one file down.
    const entry = fs.readFileSync(path.resolve(import.meta.dirname, '../dom/node-graph-dom-shell.ts'), 'utf-8');

    it('names the same global key', () => {
      expect(entry).toContain(graphErrorGlobalKey);
    });

    it('records the module phase from its own catch block', () => {
      expect(entry).toMatch(/phase:\s*["']module["']/u);
    });

    it('still renders an alert rather than returning null on a module error', () => {
      expect(entry).toContain('data-graph-boot-error');
      expect(entry).toMatch(/role:\s*["']alert["']/u);
    });
  });
});
