import { createContext, useContext } from 'react';

export interface DialogRegionContextValue {
  /** True inside a dialog surface — dialog action rules apply. */
  inDialogRegion: boolean;
}

/**
 * `DialogContent` and `AlertDialogContent` provide this automatically. Wrap custom dialog-like
 * surfaces (sheet-as-dialog, hand-rolled dialog chrome) so their action rows
 * inherit dialog rules such as the max-2-actions cap.
 */
export const DialogRegionContext = createContext<DialogRegionContextValue>({
  inDialogRegion: false,
});

export const useDialogRegionContext = (): DialogRegionContextValue => useContext(DialogRegionContext);

export const useIsInDialogRegion = (): boolean => useDialogRegionContext().inDialogRegion;
