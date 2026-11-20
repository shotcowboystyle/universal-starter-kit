/**
 * The canvas's own actions, published to whatever a consumer renders inside it.
 *
 * `NodeGraphWeb` mounts the controller; a toolbar, a Tidy button or an Undo
 * button is a `children` of the canvas, which is BELOW that. Without a channel
 * the only way to reach `relayout()` would be for every consumer to call
 * `useGraphController` themselves and mount `ReactFlow` by hand, which is
 * exactly the composition the package exists to do once.
 *
 * A context rather than a ref prop: `canUndo`, `layoutPending` and
 * `layoutRunner` all change, and a button that reads them has to re-render
 * when they do. A ref would hand out stale booleans.
 *
 * Deliberately NOT merged into `GraphHostProvider`. That context is read by
 * every node body on every render at 200 nodes; putting `layoutPending` in it
 * would re-render the whole graph each time a tidy starts and finishes.
 */

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { LayoutRunnerKind } from '../diagnostics/types';
import type { LayoutResult } from '../layout/types';

import type { GraphRelayoutOptions } from './use-graph-controller';

export interface GraphActions {
  /** Tidy. ONE undoable command, design §8. */
  readonly relayout: (options?: GraphRelayoutOptions) => Promise<LayoutResult | null>;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** `none` until the first relayout has resolved a runner. */
  readonly layoutRunner: LayoutRunnerKind;
  readonly lastLayoutMs: number | null;
  readonly layoutPending: boolean;
  readonly nodeCount: number;
}

const GraphActionsContext = createContext<GraphActions | null>(null);

export const GraphActionsProvider = ({
  value,
  children,
}: {
  readonly value: GraphActions;
  readonly children: ReactNode;
}) => <GraphActionsContext.Provider value={value}>{children}</GraphActionsContext.Provider>;

/**
 * Throws outside the canvas, on purpose. A silent `null` here would surface as
 * a Tidy button that does nothing, which is the hardest kind of bug to see in
 * a story.
 */
export const useGraphActions = (): GraphActions => {
  const value = useContext(GraphActionsContext);
  if (!value) {
    throw new Error('useGraphActions must be called inside <NodeGraph> — pass the toolbar as its children.');
  }
  return value;
};
