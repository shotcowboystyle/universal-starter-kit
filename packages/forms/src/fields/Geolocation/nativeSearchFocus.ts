/** Modal return focus must not reopen a dismissed native search. */
export function createNativeSearchFocus() {
  let dismissed = false;
  return {
    dismiss() {
      dismissed = true;
    },
    activate() {
      dismissed = false;
    },
    blur(sheetHeader: boolean, resultsOpen: boolean) {
      // A later visit by hardware keyboard is deliberate. Modal handoff is not.
      if (!sheetHeader && !resultsOpen) {
        dismissed = false;
      }
    },
    canOpen(sheetHeader: boolean) {
      return !sheetHeader && !dismissed;
    },
  };
}
