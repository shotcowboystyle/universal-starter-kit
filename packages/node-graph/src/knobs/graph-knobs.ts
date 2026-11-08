/**
 * The ONE place a graph node reads knobs.
 *
 * Nodes read knobs the way every other catalog component does — the real
 * `useResolvedKnobs` with its Preset / Surface / Intent stack — and the
 * GraphNode-specific laws in design section 11 (the width ladder, the
 * CONTAINER-CAP radius, the port-spacing floor) land on top of the resolver's
 * fragments in task 1.8. This module exists from task 1.6 so there is exactly
 * one call site to add them to, rather than a hook per node kind.
 *
 * Consumers spread whole `knobProps.*` fragments (AGENTS.md "Knobs system") and
 * never cherry-pick a resolved token.
 */

import { useResolvedKnobs } from '@repo/theme';
import type { ResolvedKnobs } from '@repo/theme';

export interface UseGraphNodeKnobsOptions {
  /** A registered intent name — "accent" | "error" | "warning" | "success". */
  readonly intent?: string;
  readonly selected?: boolean;
  readonly dragging?: boolean;
}

export interface GraphNodeKnobs extends ResolvedKnobs {
  readonly selected: boolean;
  readonly dragging: boolean;
}

export const useGraphNodeKnobs = (options?: UseGraphNodeKnobsOptions): GraphNodeKnobs => {
  const resolved = useResolvedKnobs({ component: 'GraphNode', intent: options?.intent });
  return {
    ...resolved,
    selected: options?.selected ?? false,
    dragging: options?.dragging ?? false,
  };
};
