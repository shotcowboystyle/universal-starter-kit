/**
 * The DOM SHELL — everything a `'use dom'` entry needs except the directive.
 *
 * Exported at `@repo/node-graph/dom-inner`, source-resolved on
 * every condition, because the entry itself is APP-OWNED (design §9.3). A
 * schema's `render` is a component and a Tamagui config is a live object, so
 * neither can be JSON and neither can cross the bridge: both have to come from
 * a module the DOM BUNDLE imports, and a DOM bundle is rooted at the file
 * carrying `'use dom'`. The package cannot own that file any more than it can
 * own the schema registry, so it owns everything else and the app writes three
 * lines around it.
 *
 * This file exists to be BORING. Design 9.4's third layer: a blank WebView is
 * what a parse error looks like from the outside, and a parse error in a
 * top-level dependency happens before any error boundary exists. So the shell
 * imports nothing of ours at the top, stamps how far boot got on a global as
 * early as the module body allows, and only then reaches for the real tree
 * through a dynamic `import()` inside a try/catch. Under Metro that becomes a
 * `require`, so a module-eval throw is catchable and reportable instead of
 * fatal.
 *
 * Two consequences worth naming, because both look like mistakes:
 *
 *  - It is a `.ts` with `createElement`, not a `.tsx`. The automatic JSX
 *    runtime injects a top-level `import { jsx } from "react/jsx-runtime"`, so
 *    "no top-level import" is not literally achievable in a `.tsx`, and the
 *    honest version of the invariant is "no top-level import of anything that
 *    can throw".
 *  - The boot stamp is written INLINE rather than through `boot.ts`, which
 *    already has a function for it. Importing that function would be a
 *    top-level import of ours. `boot.ts` exports `bootGlobalKey` and
 *    `domEntry.spec.ts` asserts this file names the same slot, so the
 *    duplication cannot drift.
 *
 * The imperative handle lives HERE rather than in the inner tree, so
 * `ref.current.fitView()` after a failed boot is a no-op that reports, not a
 * `TypeError` on a canvas that never mounted. The inner tree registers the
 * real implementations into `commands` when it mounts.
 *
 * WHAT THE APP'S ENTRY ADDS, and why it cannot be here (measured on the
 * iPhone 16e simulator and on emulator-5592 at task 2.7/2.8): `getConfig()`
 * threw inside the DOM bundle because `createThemeConfig` is a FACTORY the app
 * calls and nothing in `public/node-graph`'s import graph calls it, so the
 * canvas mounted with no `TamaguiProvider` and the first Tamagui component
 * threw `Missing theme.` on both platforms. `config` is now a prop, and the
 * one place it can come from is a static import in the app's own entry.
 */

import type { TamaguiInternalConfig } from '@tamagui/web';
import { useDOMImperativeHandle } from 'expo/dom';
import type { DOMImperativeFactory, DOMProps } from 'expo/dom';
import { Component, createElement, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, ErrorInfo, ReactNode, Ref } from 'react';

import type { EdgeKindDefs, GraphSchema, NodeKindDefs } from '../model/index';
import type { GraphCommandSlot, GraphCommands, NodeGraphHandle } from '../react-flow/graphHandle';

import type { FontFaceWire, GraphEventWire } from './wire';

// The heartbeat's first beat. Before this line the only things that have run
// are `react` and `expo/dom`, both of which are present by construction inside
// a DOM bundle.
//
// `startedAt` is stamped here and only here: every later stage carries it
// forward, so `at - startedAt` is how long boot took. That elapsed number is
// what the native watchdog's budget is set from, and before MPO-211 there was
// none — design 9.4's 4000 ms was a guess, and on emulator-5590 rebooted
// fresh it was the wrong guess.
const bootAt = Date.now();
(globalThis as unknown as Record<string, unknown>).__mp_graph_boot = {
  stage: 'script',
  at: bootAt,
  startedAt: bootAt,
  history: ['script'],
};

/**
 * The canvas options that are not knobs. JSON because they cross the bridge;
 * every field optional because a host that sets none should still get the
 * package's measured defaults, which live in `NodeGraphDomInner`.
 */
export interface NodeGraphDomOptions {
  readonly readOnly?: boolean;
  /** Touch surface: widens the port pitch and makes fields display-only. */
  readonly coarsePointer?: boolean;
  readonly onlyRenderVisibleElements?: boolean;
  readonly fitView?: boolean;
  readonly overviewZoom?: number;
  /** Drop nodes and edges the schema does not know instead of refusing the document. */
  readonly dropUnknownKinds?: boolean;
  /**
   * Arms design §7.3's long press INSIDE the WebView (milestone 6).
   *
   * A boolean and not a hook, because it has to cross the bridge. The gesture
   * needs `.react-flow__pane`, which exists only in the DOM realm — the story
   * that wired the interceptor to a HOST-tree ref could not mount on native at
   * all (`View config getter callback for component 'div'`), and would not have
   * reached the right element if it had.
   *
   * Arm / select / cancel come back as `{ t: "lasso" }` on the wire, with a
   * haptic HINT on `arm`: a WebView cannot buzz and whether a buzz is right is
   * the shell's call.
   */
  readonly longPressLasso?: boolean;
  /**
   * `pan` or `select`, design §7.3 — the toolbar's mode, crossing the bridge.
   *
   * It is a prop on `NodeGraphWeb` and was never in this options object, so on
   * native the toolbar flipped its own label and the canvas never heard. MPO-212
   * recorded the mode flip as proven on device from the READOUT; what a 190 pt
   * drag then failed to do in select mode was therefore unexplained. It is
   * explained: `panOnDrag` inside the WebView stayed `true`.
   */
  readonly interactionMode?: 'pan' | 'select';
}

export interface NodeGraphDomProps {
  /**
   * The serialized document. A STRING on purpose: one `JSON.parse` inside
   * beats structured prop walking across the marshaller, and an identity check
   * becomes a string compare.
   */
  readonly documentJson: string;
  /** Monotonic, stamped by the host. See the echo gate in `wire.ts`. */
  readonly rev: number;
  readonly envelopeJson: string;
  /** The schema is looked up by id: a `render` is a component and cannot be JSON. */
  readonly schemaId: string;
  readonly optionsJson: string;
  readonly extraFaces?: readonly FontFaceWire[];
  /** ONE channel. Adding an event never changes the bridge surface. */
  readonly onEvent: (eventJson: string) => Promise<void>;
  readonly dom?: DOMProps;
  readonly ref?: Ref<NodeGraphDomHandle>;
}

/**
 * Design §9.1's handle, DEFINED in `react-flow/graphHandle.ts` and re-exported
 * here under its bridge name.
 *
 * It moved in milestone 6 because `NodeGraphWeb` now publishes the SAME handle
 * through `graphRef` — one command surface on both platforms, so a story writes
 * one toolbar — and a web build must not take an edge, even an erased one, to a
 * module whose first import is `expo/dom`. The names here are unchanged, so
 * `@repo/node-graph/dom-inner` still exports exactly what it did.
 */
export type { GraphCommandSlot, GraphCommands, NodeGraphHandle } from '../react-flow/graphHandle';
export type NodeGraphDomHandle = NodeGraphHandle;
/** What the inner tree registers once React Flow is mounted and reachable. */
export type GraphDomCommands = GraphCommands;
export type GraphDomCommandSlot = GraphCommandSlot;

/**
 * What the APP's `'use dom'` entry supplies on top of the bridge props: the two
 * things that are live objects rather than JSON, so the two things that can
 * only arrive from a module the DOM bundle itself imports.
 */
export interface NodeGraphDomRealmProps<N extends NodeKindDefs = NodeKindDefs, E extends EdgeKindDefs = EdgeKindDefs> {
  /**
   * The app's `createTamagui` result. Without it `getConfig()` throws inside
   * the WebView and the first Tamagui component dies with `Missing theme.` —
   * which is exactly what milestone 2 died of before this prop existed.
   */
  readonly config?: TamaguiInternalConfig;
  /**
   * The schema BY VALUE, for the common app that has ONE.
   *
   * Kept beside `schemas` rather than folded into it: one schema is the common
   * case, and making every consumer write a single-element array to say so
   * would be ceremony charged to the majority.
   */
  readonly schema?: GraphSchema<N, E>;
  /**
   * Every schema this entry can render, looked up BY ID (milestone 6 device
   * pass).
   *
   * A `render` is a `ComponentType`: it cannot be JSON, so it cannot cross the
   * bridge, and the only string that does is `schemaId`. An entry that could
   * supply exactly one schema was therefore an app that could show exactly one
   * kind of canvas on device — measured on the iPhone 16e, where
   * `NodeGraph/Perf200` → `Control` reported
   * `render: no graph schema registered as "node-graph-demo-control"` and
   * painted nothing, which left design §13.2's mandated plain-div control
   * condition unmeasurable on every device.
   *
   * The inner tree builds an id-keyed registry out of this list and looks the
   * inbound `schemaId` up in it. A schema whose id does not match is NEVER
   * substituted: a silent substitution renders the wrong nodes instead of
   * reporting anything, which is worse than a fallback that says what is
   * missing. An app that would rather not thread a prop calls
   * `registerGraphSchema` in a module its entry imports; the inner tree prefers
   * that registry, so the two mechanisms compose rather than compete.
   */
  readonly schemas?: readonly GraphSchema<N, E>[];
}

export interface NodeGraphDomShellProps<N extends NodeKindDefs = NodeKindDefs, E extends EdgeKindDefs = EdgeKindDefs>
  extends NodeGraphDomProps, NodeGraphDomRealmProps<N, E> {}

export interface NodeGraphDomInnerProps extends NodeGraphDomProps {
  readonly commands: GraphDomCommandSlot;
  readonly config?: TamaguiInternalConfig;
  /** Erased at this boundary exactly as `registerGraphSchema` erases it. */
  readonly schema?: GraphSchema<never, never>;
  /** The same erasure, for the id-keyed list. */
  readonly schemas?: readonly GraphSchema<never, never>[];
}

interface InnerModule {
  readonly NodeGraphDomInner: ComponentType<NodeGraphDomInnerProps>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface BoundaryProps {
  readonly report: (event: GraphEventWire) => void;
  readonly children?: ReactNode;
}

/**
 * Design 9.4 layer 5's error boundary, and it is the only layer that can say
 * WHAT went wrong.
 *
 * Measured on the iPhone 16e simulator: a render throw inside the canvas
 * reached `window.onerror`, which reported the message `"Script error."` and
 * nothing else. That is not a bug in the handler — a browser sanitises
 * `onerror` to exactly that string when the throw came from a script loaded
 * from a different origin than the document, and an Expo DOM component's
 * `<script src>` is precisely that. So the host saw `phase: "runtime"`, kept
 * the canvas (correctly, a runtime error is not fatal), the watchdog fired
 * four seconds later, and the failure had no description anywhere.
 *
 * React hands the boundary the real Error object, so this one does. It lives
 * in the ENTRY rather than the inner tree because the throw it exists to catch
 * is the inner tree's own render, and a boundary inside the thing that throws
 * catches nothing. A class component and `createElement`, importing only
 * `react`, so the entry's "no top-level import of anything that can throw"
 * invariant still holds.
 */
class GraphRenderBoundary extends Component<BoundaryProps, { message: string | null }> {
  state: { message: string | null } = { message: null };

  static getDerivedStateFromError(error: unknown): { message: string | null } {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    this.props.report({
      t: 'error',
      phase: 'render',
      message: messageOf(error),
      stack: error instanceof Error ? error.stack : (info.componentStack ?? undefined),
    });
  }

  render() {
    if (this.state.message !== null) {
      return createElement(
        'div',
        { 'data-graph-boot-error': 'render', role: 'alert' },
        `node-graph failed to render: ${this.state.message}`,
      );
    }
    return this.props.children;
  }
}

export function NodeGraphDomShell<N extends NodeKindDefs = NodeKindDefs, E extends EdgeKindDefs = EdgeKindDefs>(
  props: NodeGraphDomShellProps<N, E>,
) {
  const { config, onEvent, schema, schemas } = props;
  const commands = useRef<GraphCommands | null>(null);
  const [Inner, setInner] = useState<ComponentType<NodeGraphDomInnerProps> | null>(null);
  const [moduleError, setModuleError] = useState<string | null>(null);

  // `encodeGraphEvent` lives in `wire.ts` and this file may not import it, so
  // the one `JSON.stringify` the entry needs is written out. It is the same
  // union, type-checked against it.
  const report = useMemo(
    () => (event: GraphEventWire) => {
      void onEvent(JSON.stringify(event));
    },
    [onEvent],
  );

  /**
   * Every command, forwarded through a TYPED intermediate.
   *
   * It was six hand-written arrows and milestone 6 makes it eleven. Hand-writing
   * eleven is how one gets forgotten, and a forgotten one is a button that
   * silently does nothing on a phone with no console to find it in. Annotating
   * the literal `NodeGraphHandle` is what makes that a BUILD error: the object
   * is checked against the interface before the cast, so a method added to
   * `graphHandle.ts` and not forwarded here fails `typecheck`.
   *
   * The cast is still needed and still here once: the handle is JSON-shaped by
   * contract (`DOMImperativeFactory`'s index signature) and the typed view of it
   * is `NodeGraphHandle`, and the two cannot both be expressed at once.
   *
   * Written out rather than looped over `graphCommandNames`, because looping
   * would need a RUNTIME import of that tuple and this file may carry none of
   * ours (design §9.4 layer 3, and `domEntry.spec.ts` holds the import list to
   * `react` and `expo/dom`). The tuple's job is the spec's, not this file's.
   */
  useDOMImperativeHandle(
    props.ref as Ref<DOMImperativeFactory>,
    () => {
      const typed: NodeGraphHandle = {
        fitView: () => commands.current?.fitView(),
        relayout: () => commands.current?.relayout(),
        zoomTo: (zoom) => commands.current?.zoomTo(Number(zoom)),
        centerOn: (nodeId) => commands.current?.centerOn(String(nodeId)),
        setSelection: (ids) => commands.current?.setSelection(ids ?? []),
        exportViewport: () => commands.current?.exportViewport(),
        undo: () => commands.current?.undo(),
        redo: () => commands.current?.redo(),
        perfStart: (label) => commands.current?.perfStart(String(label)),
        perfStop: (label) => commands.current?.perfStop(String(label)),
        perfMark: (label) => commands.current?.perfMark(String(label)),
        setViewport: (x, y, zoom) => commands.current?.setViewport(Number(x), Number(y), Number(zoom)),
        synthPinch: (scale, steps) => commands.current?.synthPinch(Number(scale), Number(steps)),
      };
      return typed as unknown as DOMImperativeFactory;
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = (await import('./NodeGraphDomInner')) as InnerModule;
        if (cancelled) {
          return;
        }
        // The functional form, because React would otherwise call a component
        // passed to `setState` as an updater.
        setInner(() => loaded.NodeGraphDomInner);
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = messageOf(error);
        setModuleError(message);
        // Written INLINE, not through `recordGraphError`, for the same reason
        // the boot stage is: this file may carry no top-level import of ours
        // that could itself throw (design 9.4 layer 3), and a dynamic import
        // inside the handler for a failed dynamic import is not a place to put
        // faith. `diagnostics/lastError.ts` exports the key, and
        // `useGraphDiagnostics.spec.tsx` asserts this literal still matches it.
        //
        // First-write-wins, matching the reader: a module-eval throw drags a
        // train of render errors behind it, and the cause is the one worth
        // reporting.
        const slot = globalThis as unknown as Record<string, unknown>;
        slot.__mp_graph_error ??= {
          phase: 'module',
          message,
          stack: error instanceof Error ? error.stack : undefined,
          at: Date.now(),
        };
        report({
          t: 'error',
          phase: 'module',
          message,
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [report]);

  if (moduleError) {
    // Not a blank rectangle even on web, where there is no native watchdog to
    // catch this. On native, layer 4 has already drawn `GraphFallback`.
    return createElement(
      'div',
      { 'data-graph-boot-error': 'module', role: 'alert' },
      `node-graph failed to load: ${moduleError}`,
    );
  }
  if (!Inner) {
    return null;
  }
  return createElement(
    GraphRenderBoundary,
    { report },
    createElement(Inner, {
      ...props,
      commands,
      config,
      // The same erasure `registerGraphSchema` performs, in the one place the
      // typed app boundary meets the id-keyed registry.
      schema: schema as unknown as GraphSchema<never, never> | undefined,
      schemas: schemas as unknown as readonly GraphSchema<never, never>[] | undefined,
    }),
  );
}
