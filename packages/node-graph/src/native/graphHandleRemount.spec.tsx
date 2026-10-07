/**
 * The handle has to survive a REMOUNT, and until now it did not.
 *
 * This is the mechanism behind two of the m6 device pass's findings and it is
 * one bug, readable in `expo/dom` rather than guessable from a screenshot.
 * `expo/dom`'s `RawWebView` installs its imperative proxy **in the render
 * body**, guarded by `ref.current == null`, and nothing ever nulls it again —
 * React does not manage a ref a component assigns to itself. So on a keyed
 * remount the OLD proxy is still sitting in the shared ref when the NEW
 * instance renders, the guard is false, and the new WebView never publishes a
 * proxy. The consumer keeps a handle wired to a torn-down WebView, whose
 * `injectJavaScript` goes nowhere.
 *
 * Every command through `graphRef` is then silently dead while the canvas
 * itself paints and pans perfectly, which is exactly what was measured:
 *
 *  - **Android `Tidy` never answers.** On BOTH emulators the canvas had come up
 *    through the watchdog + Retry path, and Retry is `attempt + 1` — a keyed
 *    remount. iOS never went through Retry and its Tidy answered. That is the
 *    whole of the difference the device run could not separate.
 *  - **Culling OFF returns no `perfReport`.** The toggle was a `key` on
 *    `<NodeGraph>`, so the only way to reach culling-off was through a remount.
 *    `perfStart` and `perfStop` both went to the dead proxy, and the readout sat
 *    on `sampling…` because that state is the story's own.
 *
 * The fix is not to null the shared ref — the ordering makes that worse, since
 * the new instance RENDERS before the old one's cleanup runs, so a null on
 * unmount would wipe a proxy that had just been installed. The fix is to stop
 * sharing: `NodeGraphNative` gives the DOM entry a ref object it owns, one per
 * attempt, and publishes the consumer's `graphRef` through a stable forwarder.
 * That is the same shape `NodeGraphWeb` already uses for `commandSlot`.
 */

import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { createElement, useRef } from 'react';
import type { Ref } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import type { NodeGraphDomProps } from '../dom/NodeGraphDomShell';
import type { NodeGraphHandle } from '../react-flow/graphHandle';

import { NodeGraphNative } from './NodeGraph.native';

afterEach(cleanup);

const envelope = {
  schemaVersion: 1,
  knobs: {},
  intent: null,
  surface: { size: 'md', density: 'comfortable' },
  scheme: 'light',
  themeName: 'light',
  prefersReducedMotion: true,
  vars: {},
  fonts: [],
  pixelRatio: 1,
  revision: 1,
} as never;

/** Which WebView instance a command landed in, in arrival order. */
const landed: { instance: number; command: string }[] = [];

/**
 * `expo/dom`'s `RawWebView`, reduced to the one behaviour that matters.
 *
 * Copied from `expo@55`'s `src/dom/webview-wrapper.tsx`, which does exactly
 * this: `if (ref != null && typeof ref === 'object' && ref.current == null) {
 * ref.current = new Proxy(...) }`, in the render body, closing over that
 * instance's own `webviewRef`. A stale proxy is not an error — it forwards into
 * a WebView that is gone.
 */
let instances = 0;
function FakeDomEntry(props: NodeGraphDomProps & { readonly ref?: Ref<NodeGraphHandle> }) {
  const instance = useRef(0);
  if (instance.current === 0) {
    instances += 1;
    instance.current = instances;
  }
  const mine = instance.current;
  const { ref } = props;
  if (ref != null && typeof ref === 'object' && ref.current == null) {
    (ref as { current: NodeGraphHandle | null }).current = new Proxy({} as NodeGraphHandle, {
      get(_target, property) {
        return () => landed.push({ instance: mine, command: String(property) });
      },
    });
  }
  return createElement('div', {
    'data-instance': mine,
    'data-testid': `webview-${mine}`,
  });
}

function element(graphRef: Ref<NodeGraphHandle>, readyTimeoutMs: number, key?: string) {
  return createElement(NodeGraphNative, {
    key,
    documentJson: JSON.stringify({ version: 1, nodes: [], edges: [] }),
    domEntry: FakeDomEntry as never,
    envelope,
    graphRef,
    readyTimeoutMs,
    rev: 0,
    schemaId: 'node-graph-demo',
  });
}

/**
 * Through the real providers: `GraphFallback` is Tamagui, and a Tamagui
 * component with no `TamaguiProvider` above it throws `Missing theme.` — which
 * is the same throw milestone 2 spent a device cycle on.
 */
function mount(graphRef: Ref<NodeGraphHandle>, readyTimeoutMs: number) {
  return renderWithProviders(element(graphRef, readyTimeoutMs));
}

describe('the handle across a WebView remount', () => {
  /**
   * The Retry path, which is what both Android emulators came up through. A
   * `relayout` after Retry has to reach the WebView that is on screen, not the
   * one the watchdog gave up on.
   */
  it('reaches the NEW WebView after Retry, not the one that was torn down', async () => {
    landed.length = 0;
    instances = 0;
    const graphRef = { current: null as NodeGraphHandle | null };
    const view = mount(graphRef, 10);

    expect(graphRef.current).not.toBeNull();
    graphRef.current?.relayout();
    expect(landed.at(-1)).toEqual({ instance: 1, command: 'relayout' });

    // The watchdog fires — a 10 ms budget and a fake entry that never reports
    // `paint` or `ready` — and the fallback draws its Retry.
    await screen.findByText('Retry');
    // Widen the budget BEFORE the retry so the second attempt is not killed by
    // the same watchdog while this test is looking at it. `readyTimeoutMs` is
    // read every render, so the fallback stays up and Retry is still there.
    view.rerender(element(graphRef, 60_000));
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => {
      expect(screen.queryByTestId('webview-2')).not.toBeNull();
    });

    graphRef.current?.relayout();
    expect(landed.at(-1), 'a Tidy after Retry landed in the WebView that had already been torn down').toEqual({
      instance: 2,
      command: 'relayout',
    });
  });

  /**
   * The culling-toggle path: the consumer remounts `<NodeGraph>` under a new
   * key for its own reasons. `perfStart` and `perfStop` have to reach the
   * canvas that is on screen, or the run reports nothing at all and the readout
   * cannot tell that from a canvas that produced no frames.
   */
  it('reaches the NEW WebView after the consumer remounts under a new key', async () => {
    landed.length = 0;
    instances = 0;
    const graphRef = { current: null as NodeGraphHandle | null };
    const view = mount(graphRef, 60_000);
    await waitFor(() => {
      expect(graphRef.current).not.toBeNull();
    });
    graphRef.current?.perfStart('run');
    expect(landed.at(-1)).toEqual({ instance: 1, command: 'perfStart' });

    view.rerender(element(graphRef, 60_000, 'second'));

    await waitFor(() => {
      expect(screen.queryByTestId('webview-2')).not.toBeNull();
    });
    graphRef.current?.perfStop('run');
    expect(landed.at(-1), 'the Stop went to the WebView the toggle had already replaced').toEqual({
      instance: 2,
      command: 'perfStop',
    });
  });

  /**
   * The consumer's ref never reaches `RawWebView`, which is what makes the two
   * assertions above true rather than lucky. A ref object the entry writes into
   * is a ref object only the entry may own.
   */
  it("never hands the consumer's own ref object to the DOM entry", async () => {
    landed.length = 0;
    instances = 0;
    const graphRef = { current: null as NodeGraphHandle | null };
    mount(graphRef, 60_000);
    await waitFor(() => {
      expect(graphRef.current).not.toBeNull();
    });
    // A proxy from `FakeDomEntry` answers every property with a recorder. The
    // forwarder does not: reading a name it does not implement gives undefined.
    expect((graphRef.current as unknown as Record<string, unknown>).notACommand).toBeUndefined();
    expect(landed).toEqual([]);
  });
});
