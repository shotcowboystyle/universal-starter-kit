import type { ReactNode } from 'react';

export interface PanelPortalProps {
  anchor: unknown;
  children: ReactNode;
}

export function panelPortalHost(): null {
  return null;
}

/** Native panels are sheets and modals, never clipped by a scroll view. */
export function PanelPortal({ children }: PanelPortalProps) {
  return <>{children}</>;
}
