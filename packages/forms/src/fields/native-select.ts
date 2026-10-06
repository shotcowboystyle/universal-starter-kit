/**
 * Opt-in OS select. Most fields stay catalog; Select on iOS is a polished
 * ActionSheet users expect. Android keeps the catalog sheet (no equivalent
 * system control worth swapping in). Multi-select always stays catalog.
 */
export function shouldUseIosNativeSelect(input: {
  native?: boolean;
  multiple?: boolean;
  isWeb: boolean;
  os: string;
}): boolean {
  return Boolean(input.native) && !input.multiple && !input.isWeb && input.os === 'ios';
}
