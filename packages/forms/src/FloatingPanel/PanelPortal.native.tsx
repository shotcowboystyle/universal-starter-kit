import type { ReactNode } from 'react';

export interface PanelPortalProps {
  anchor: unknown;
  children: ReactNode;
}

// oxlint-disable-next-line react-doctor/only-export-components -- mirrors the web module's host helper API; not a component
export const panelPortalHost = (): null => null;

/** Native panels are sheets and modals, never clipped by a scroll view. */
// oxlint-disable-next-line react/jsx-no-useless-fragment -- a bare ReactNode return is typed as possibly a Promise, which function components must not return
export const PanelPortal = ({ children }: PanelPortalProps) => <>{children}</>;
