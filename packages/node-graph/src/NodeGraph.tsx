/**
 * `NodeGraph` — the one name a consumer imports.
 *
 * On web it IS `NodeGraphWeb`. On native it becomes the `expo/dom` host in
 * milestone 2, which renders this same web canvas inside a WebView; the split
 * happens at `src/index.native.ts`, never at a `.web.*` twin (MPO-192: one web
 * build, and a `.web.ts` twin is invisible to it).
 *
 * The re-export is a real component rather than `export { NodeGraphWeb as
 * NodeGraph }` so the name in a React devtools tree, an error boundary and a
 * profiler flame is the name the consumer wrote.
 */

import type { EdgeKindDefs, NodeKindDefs } from './model/index';
import { NodeGraphWeb } from './react-flow/NodeGraphWeb';
import type { NodeGraphWebProps } from './react-flow/NodeGraphWeb';

export type NodeGraphProps<
  N extends NodeKindDefs = NodeKindDefs,
  E extends EdgeKindDefs = EdgeKindDefs,
> = NodeGraphWebProps<N, E>;

export const NodeGraph = <N extends NodeKindDefs, E extends EdgeKindDefs>(props: NodeGraphProps<N, E>) => (
  <NodeGraphWeb {...props} />
);
