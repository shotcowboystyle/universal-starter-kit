export const floatingPanelActionProps = { 'data-floating-panel-action': 'true' } as const;

export interface PanelActionEvent {
  target?: unknown;
  currentTarget?: unknown;
  nativeEvent?: { target?: unknown };
}

/** Marked actions inside a trigger keep their own press and keyboard behavior. */
export const isNestedPanelAction = (event: PanelActionEvent): boolean => {
  // SAFETY: web events carry DOM nodes here; native events lack closest/contains and the optional calls below return undefined.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- target is unknown by contract; DOM-ness is probed via optional calls
  const target = (event.nativeEvent?.target ?? event.target) as Element | null;
  // SAFETY: same as target, currentTarget is the DOM wrapper on web and a non-DOM value elsewhere.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- same contract as target
  const wrapper = event.currentTarget as Element | null;
  const action = target?.closest?.('[data-floating-panel-action="true"]');
  return action != null && wrapper?.contains?.(action) === true;
};
