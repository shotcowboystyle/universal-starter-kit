/**
 * THE ONLY `@xyflow` import site in this package.
 *
 * `no-restricted-imports` in the repo's `oxlintrc.json` refuses `@xyflow/*`
 * everywhere else under `public/node-graph/src`, so a React Flow major bump has
 * exactly one reconciliation site instead of thirty. `xy.test.ts` asserts every
 * name below still resolves and that the installed version is inside the range
 * `package.json` declares, so an upgrade fails CI rather than a user.
 *
 * The list is deliberately narrow. It is what the editor uses, not a mirror of
 * upstream — a name nobody imports is a name nobody reconciles. Add one here
 * (and to the spec's list) when a task actually needs it.
 *
 * Upgrade runbook: README.md.
 *
 * ONE name comes from `@xyflow/system` rather than `@xyflow/react`:
 * `getHandlePosition`. React Flow does not re-export it (its own index re-lists
 * `getBezierPath` and friends and stops there), and it is the function that
 * turns a handle's measured BOX into the point an edge is drawn to — which is
 * the whole reason the 44pt hit region is a pseudo-element and not element
 * growth (design 7.1 H2). Asserting that law against our own reimplementation
 * would prove nothing, so the spec calls the real one. `package.json` pins
 * `@xyflow/system` to the exact version `@xyflow/react` pins, and `xy.test.ts`
 * fails if the two ever split.
 */

export { getHandlePosition } from '@xyflow/system';
export type { Handle as HandleBounds, InternalNodeBase } from '@xyflow/system';

export {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore,
  useStoreApi,
  useUpdateNodeInternals,
  /**
   * The guide layer has to live INSIDE `.react-flow__viewport` so the pan and
   * zoom transform applies to it for free (design §7.2 S10). This portal is the
   * only supported way in; rendering a sibling and re-deriving the transform is
   * how a guide ends up one frame behind the node it points at.
   */
  ViewportPortal,
} from '@xyflow/react';

export type {
  ColorMode,
  Connection,
  Edge,
  EdgeChange,
  EdgeMarkerType,
  EdgeProps,
  EdgeTypes,
  HandleType,
  IsValidConnection,
  Node,
  NodeChange,
  NodeProps,
  NodeTypes,
  OnConnect,
  ReactFlowInstance,
  Viewport,
  XYPosition,
} from '@xyflow/react';

/**
 * The installed React Flow version, as a plain string.
 *
 * Diagnostics has to report it (design §9.5) and only THIS file may reach
 * `@xyflow`, so it is declared here rather than read at the use site. A literal
 * rather than an import of `@xyflow/react/package.json`: that path is not in
 * the package's exports map on every condition, and a bundler that cannot
 * resolve it would take the whole canvas down to report a version string.
 *
 * `xy.test.ts` asserts this equals the installed version, so it cannot drift
 * from reality — an upgrade that forgets it fails CI rather than a user.
 */
export const xyflowVersion = '12.11.5';

/**
 * The class React Flow puts on its pane element.
 *
 * A class name is part of @xyflow's DOM contract exactly as its exported
 * symbols are, so it belongs at the same boundary they do. The long press has
 * to FIND the pane to listen on it (`use-lasso-select.ts`) — that is a DOM
 * lookup, not a paint rule, and a paint rule is what `checkGraphVarsCoverage`
 * exists to keep out of `src`. Hardcoding the string at the call site would
 * have been the wrong kind of coupling either way: when an upgrade renames the
 * class, a `querySelector` returns null and the long press dies in silence, so
 * the rename should have exactly one place to land.
 */
export const reactFlowPaneSelector = '.react-flow__pane';

/**
 * The class React Flow puts on a node element. Same boundary rule as
 * `reactFlowPaneSelector`, and for the same reason: it is a DOM lookup, not a
 * paint rule, and a rename should have exactly one place to land.
 *
 * The lookup this exists for is `NodeGraph/AutoLayout`'s position stamp, which
 * reads each node's CSS `transform` — React Flow places a node with a
 * transform and never with a layout offset, so `offsetLeft` / `offsetTop` are
 * 0 at every arrangement and a stamp built on them is a constant.
 */
export const reactFlowNodeSelector = '.react-flow__node';

/**
 * The class React Flow puts on the pan/zoom viewport — the ONE element whose
 * transform carries the whole canvas.
 *
 * Same boundary rule as the pane and node selectors. The frame sampler's
 * `didMove` probe (design §13.2) reads this transform to tell a real pan from
 * an idle page, and a rename that silently returned `null` there would turn
 * every perf run into a discarded one with no explanation.
 */
export const reactFlowViewportSelector = '.react-flow__viewport';
