/**
 * A relayout ALWAYS answers, and what a freshly recreated WebView carries.
 *
 * The m6 device pass could not separate two explanations for Android's Tidy
 * never answering: "relayout is broken on Android" and "relayout is broken on a
 * Retry-recreated canvas". Both emulators had come up through the watchdog +
 * Retry path and iOS never did, so the run had no control condition.
 *
 * Reading the layout path answers half of it and the answer is NO. Nothing on
 * the DOM side survives a WebView recreation, because the whole JS REALM is
 * destroyed with it:
 *
 *  - `layout/runner.ts`'s `cached` runner promise is module scope, so a new
 *    realm re-evaluates the module and re-probes from scratch. `resetLayoutRunner`
 *    exists as the escape hatch and no host needs it for this.
 *  - the Worker's blob URL is minted by `URL.createObjectURL` in the realm that
 *    spawns it and dies with that realm's `URL` registry.
 *  - the schema registry is module scope in the DOM bundle, re-populated by the
 *    entry's own module eval on every boot.
 *
 * The native side is where the bug was, and it was the imperative ref rather
 * than anything about layout: see `native/graph-handle-remount.test.tsx`.
 *
 * What IS wrong here, and is fixed by this file's subject, is that a relayout
 * which REJECTS answered with nothing. `layout()` rejects when the blob Worker
 * cannot be constructed or dies mid-flight — both realm-local, so both are
 * exactly what a recreated WebView can hit — and the bridge only had a `.then`.
 * The rejection went to `unhandledrejection`, was reported as a non-fatal
 * `runtime` error (correctly), and no `layoutResult` crossed. A toolbar stuck
 * on "laying out…" is then indistinguishable from a Tidy that never arrived,
 * which is the exact ambiguity the device run got stuck in.
 */

import { renderWithProviders } from '@repo/test-utils';
import { cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { GraphEventWire } from '../dom/wire';

import type { GraphCommandSlot } from './graph-handle';
import { GraphActionsProvider } from './GraphActions';
import type { GraphActions } from './GraphActions';
import { GraphCommandBridge } from './GraphCommandBridge';
import { ReactFlowProvider } from './xy';

const harness = (relayout: GraphActions['relayout']) => {
  const events: GraphEventWire[] = [];
  const commands: GraphCommandSlot = { current: null };
  const actions: GraphActions = {
    relayout,
    undo: () => {},
    redo: () => {},
    canUndo: false,
    canRedo: false,
    layoutRunner: 'worker-blob',
    lastLayoutMs: null,
    layoutPending: false,
    nodeCount: 200,
  };
  renderWithProviders(
    <ReactFlowProvider>
      <GraphActionsProvider value={actions}>
        <GraphCommandBridge
          commands={commands}
          culling
          emit={(event) => events.push(event)}
          host="react-flow-dom"
          rootRef={{ current: null }}
        />
      </GraphActionsProvider>
    </ReactFlowProvider>,
  );
  return { commands, events, layouts: () => events.filter((event) => event.t === 'layoutResult') };
};

describe('relayout over the wire', () => {
  afterEach(cleanup);

  it('answers with the runner and the engine ms when the engine ran', async () => {
    const view = harness(async () => ({ runner: 'worker-blob' as const, ms: 31.8, positions: {} }) as never);
    view.commands.current?.relayout();
    await waitFor(() => {
      expect(view.layouts()).toHaveLength(1);
    });
    const [result] = view.layouts();
    expect(result).toMatchObject({ runner: 'worker-blob', ms: 31.8, nodeCount: 200 });
    expect(result?.t === 'layoutResult' && result.error).toBeUndefined();
  });

  /**
   * The one this file exists for. A rejection has to CROSS, or the readout and
   * a dead bridge look the same on a phone with no console.
   */
  it('answers when the engine REJECTS, instead of leaving the toolbar to wait', async () => {
    const view = harness(async () => {
      throw new Error('the layout worker raised an error event');
    });
    view.commands.current?.relayout();
    await waitFor(() => {
      expect(view.layouts()).toHaveLength(1);
    });
    const [result] = view.layouts();
    expect(result).toMatchObject({
      runner: 'none',
      ms: 0,
      nodeCount: 200,
      error: 'the layout worker raised an error event',
    });
  });

  /**
   * `none` and 0, never an invented runner or a plausible millisecond count. A
   * failed tidy that reads `worker-blob · 0.0 ms` is a failed tidy nobody
   * notices.
   */
  it('does not dress a rejection up as a fast layout', async () => {
    const view = harness(async () => {
      throw new Error('boom');
    });
    view.commands.current?.relayout();
    await waitFor(() => {
      expect(view.layouts()).toHaveLength(1);
    });
    const [result] = view.layouts();
    expect(result?.t === 'layoutResult' && result.runner).toBe('none');
    expect(result?.t === 'layoutResult' && result.ms).toBe(0);
  });

  /** An empty graph is `null`, and `none` is honest there: no engine ran. */
  it('reports `none` with no error for a graph there was nothing to lay out', async () => {
    const view = harness(async () => null);
    view.commands.current?.relayout();
    await waitFor(() => {
      expect(view.layouts()).toHaveLength(1);
    });
    const [result] = view.layouts();
    expect(result).toMatchObject({ runner: 'none', ms: 0 });
    expect(result?.t === 'layoutResult' && result.error).toBeUndefined();
  });
});
