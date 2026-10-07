/**
 * The imperative command surface, in a module NEITHER realm owns.
 *
 * Milestone 6's rule (design §9.1): a native consumer cannot put React children
 * inside the canvas, so every control is either a native SIBLING driving the
 * canvas through this handle, or it is rendered INSIDE the DOM bundle from
 * serializable options. That makes the handle the load-bearing surface on both
 * platforms, and it therefore may not live in `dom/`: `NodeGraphDomShell.ts`
 * imports `expo/dom` at its top, and `NodeGraphWeb` — which now publishes the
 * same handle through `graphRef` — must not carry that import into a web build
 * even as an erased type edge.
 *
 * Every method returns void and takes JSON. That is not a style choice:
 * `DOMImperativeFactory` is `{ [key: string]: (...args: JSONValue[]) => void }`,
 * so an answer can only come back as an EVENT. `exportViewport`, `perfStop` and
 * `relayout` each answer on the wire rather than by returning.
 */

/**
 * Design §9.1's six, plus milestone 6's five.
 *
 * The five are here rather than on a second handle because a consumer holds one
 * ref: a `perfStart` that lived somewhere else would be a second bridge, and
 * the whole reason the wire is one channel is that a second one is a change to
 * the bridge rather than to a type.
 */
export interface NodeGraphHandle {
  fitView(): void;
  /**
   * Tidy. It emits `{ t: "layoutResult" }` when the engine answers.
   *
   * It was a documented NO-OP until milestone 6 — the comment said auto-layout
   * was milestone 4 and the method was named early so the bridge surface would
   * not have to change later. Milestone 4 then built the layout engine and
   * never came back here, so `layoutRunner` read `none` on every device: not
   * because the runner failed to resolve, but because nothing on a phone could
   * ask it to run.
   */
  relayout(): void;
  zoomTo(zoom: number): void;
  centerOn(nodeId: string): void;
  setSelection(ids: string[]): void;
  exportViewport(): void;
  undo(): void;
  redo(): void;
  /** Starts the frame sampler in the realm the canvas paints in. */
  perfStart(label: string): void;
  /** Stops it and emits `{ t: "perfReport" }`. */
  perfStop(label: string): void;
  /** Stamps an instant inside the run, so `relayoutGate` has a window to read. */
  perfMark(label: string): void;
  /**
   * Puts the canvas at an exact viewport, with no animation.
   *
   * Five runs have to start from the same place or the median of five is the
   * median of five experiments. `duration` is deliberately absent: an animated
   * move is still moving when the sampler starts, and the first frames of every
   * run would then measure the seek rather than the gesture.
   */
  setViewport(x: number, y: number, zoom: number): void;
  /**
   * A synthesised two-finger pinch, dispatched on the PANE — which is the
   * element d3-zoom's touch listener is attached to, and which exists only in
   * the realm the canvas paints in.
   *
   * It is here because the `mobile` MCP has no pinch verb at all (design
   * §13.2), so on a device a pinch can only be produced from inside the
   * WebView. That is also the technique that made the native spike's node-drag
   * measurement unprovable, which is why a pinch row taken this way is reported
   * SEPARATELY and flagged synthetic. On web the same row is taken with
   * Chrome's own `Input.synthesizePinchGesture`, which is a browser-level
   * gesture and a different thing.
   */
  synthPinch(scale: number, steps: number): void;
}

/** What the bridge component registers once the canvas is reachable. */
export type GraphCommands = NodeGraphHandle;

export interface GraphCommandSlot {
  current: GraphCommands | null;
}

/**
 * The command NAMES, as data.
 *
 * The two conditional types below are the compile-time half — a method added to
 * `NodeGraphHandle` and not to this tuple, or a name here that is not a method,
 * is a build error. It exists for the same reason `graphEventKinds` does: the
 * shell has to forward every command by hand across `useDOMImperativeHandle`,
 * and a forgotten one is a button that silently does nothing on a phone.
 */
export const graphCommandNames = [
  'fitView',
  'relayout',
  'zoomTo',
  'centerOn',
  'setSelection',
  'exportViewport',
  'undo',
  'redo',
  'perfStart',
  'perfStop',
  'perfMark',
  'setViewport',
  'synthPinch',
] as const;

type DeclaredCommand = (typeof graphCommandNames)[number];
type AssertNever<T extends never> = T;
type _EveryMethodIsDeclared = AssertNever<Exclude<keyof NodeGraphHandle, DeclaredCommand>>;
type _EveryDeclaredIsAMethod = AssertNever<Exclude<DeclaredCommand, keyof NodeGraphHandle>>;
