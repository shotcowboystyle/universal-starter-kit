import type { ReactNode } from 'react';

export interface PanelPortalProps {
  anchor: unknown;
  children: ReactNode;
}

export const panelPortalHost = (): null => null;

/** Native panels are sheets and modals, never clipped by a scroll view. */
export const PanelPortal = ({ children }: PanelPortalProps) => <>{children}</>;
