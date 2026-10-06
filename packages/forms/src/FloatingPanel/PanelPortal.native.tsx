import type { ReactNode } from 'react';

export interface PanelPortalProps {
  anchor: unknown;
  children: ReactNode;
}

export const panelPortalHost = (): null => {
  return null;
};

/** Native panels are sheets and modals, never clipped by a scroll view. */
export const PanelPortal = ({ children }: PanelPortalProps) => {
  return <>{children}</>;
};
