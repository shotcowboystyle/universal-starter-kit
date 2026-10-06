export const floatingPanelActionProps = { 'data-floating-panel-action': 'true' } as const;

export interface PanelActionEvent {
  target?: unknown;
  currentTarget?: unknown;
  nativeEvent?: { target?: unknown };
}

/** Marked actions inside a trigger keep their own press and keyboard behavior. */
export function isNestedPanelAction(event: PanelActionEvent): boolean {
  const target = (event.nativeEvent?.target ?? event.target) as Element | null;
  const wrapper = event.currentTarget as Element | null;
  const action = target?.closest?.('[data-floating-panel-action="true"]');
  return !!action && !!wrapper?.contains?.(action);
}
