import { createContext, useContext } from 'react';

/**
 * Written law: CheckboxGroup is E-FLAT, so item Checkboxes must not wrap
 * the glyph in getElevationWrapperProps chrome. Local only — does not
 * change defaultKnobs, elevationMap, or the shared helper.
 */
export const CheckboxGroupFlatContext = createContext(false);

export function useCheckboxGroupSkipsElevation(): boolean {
  return useContext(CheckboxGroupFlatContext);
}
