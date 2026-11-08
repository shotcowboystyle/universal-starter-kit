/**
 * Metro file fallback for `@repo/node-graph/dom-inner`, the same
 * shape `model.ts` gives `./model` (MPO-185).
 *
 * Metro does not reconsider `source` or `default` when the condition it picked
 * is missing: it warns and retries a plain file lookup at `<pkg>/dom-inner.*`,
 * which is this file. It matters more here than anywhere else in the package,
 * because the thing on the other side is what an app's `'use dom'` entry
 * imports, and a failed resolution there is a blank WebView.
 */
export { NodeGraphDomShell } from './src/dom/node-graph-dom-shell';
export type {
  GraphDomCommandSlot,
  GraphDomCommands,
  NodeGraphDomHandle,
  NodeGraphDomInnerProps,
  NodeGraphDomOptions,
  NodeGraphDomProps,
  NodeGraphDomRealmProps,
  NodeGraphDomShellProps,
} from './src/dom/node-graph-dom-shell';
