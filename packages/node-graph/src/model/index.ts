/**
 * Model barrel — no React, no DOM, no `@xyflow`.
 *
 * Its own export condition (`@repo/node-graph/model`), so a
 * server, a CLI or the CI bench imports the model alone.
 */

export type {
  DocumentProblem,
  DocumentSchema,
  EdgeId,
  EdgeKindDefs,
  GraphDocument,
  GraphDocumentVersion,
  GraphEdgeOf,
  GraphNodeOf,
  JsonPrimitive,
  JsonValue,
  NodeId,
  NodeKindDefs,
  PortId,
  PortRef,
  Rect,
  Result,
  Size,
  Viewport,
  XY,
} from './document';
export type { GraphCommand } from './commands';
export { applyCommand, invertCommand } from './commands';
export type { ConnectionCheck, ConnectionContext, ConnectionRule, ConnectionVerdict, DropOnlyRule } from './connect';
export {
  defaultDropRules,
  defaultRules,
  defineConnectionRule,
  refuseCycle,
  refuseDataTypeMismatch,
  refuseDirection,
  refuseDuplicate,
  refusePortArity,
  refuseSelfLoop,
  validateConnection,
  validateDrop,
} from './connect';
export type { GraphHistory, HistoryEntry, HistoryOptions } from './history';
export { createHistory } from './history';
export type {
  EdgeKindSpec,
  GraphNodeField,
  GraphNodeRenderProps,
  GraphSchema,
  GraphSchemaSpec,
  NodeKindSpec,
  PortSpec,
} from './schema';
export {
  clearGraphSchemas,
  createGraphSchema,
  getGraphSchema,
  nodeKindSpec,
  portArity,
  registerGraphSchema,
  resolvePorts,
} from './schema';
export type { MarqueeMode, NodeRect } from './select';
export { nodeRects, rectContains, rectsOverlap, selectInMarquee, unionBounds } from './select';
export type { ParseOptions } from './serialize';
export { parseDocument, serializeDocument } from './serialize';
