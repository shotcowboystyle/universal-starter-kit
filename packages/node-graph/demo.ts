/**
 * Metro file fallback for `@repo/node-graph/demo`, the same shape
 * `model.ts` gives `./model` (MPO-185).
 *
 * The demo schema is a real export rather than a story fixture because it is
 * the WORKED EXAMPLE of design §9.3: an app's `'use dom'` entry must import a
 * module that registers or supplies a schema, and `apps/storybook-expo` has no
 * graph of its own to draw. It is also what the two task-1.11 specs and the
 * `NodeGraph/NodeGraph` story mount, so an app, a spec and a story all render
 * one tree.
 */
export { demoGraphSchema } from './src/react-flow/demo-node-body';
export { demoDocument, demoDocumentLarge, demoGraphSchemaId } from './src/react-flow/fixtures';
export type { DemoNodeData } from './src/react-flow/fixtures';
