/**
 * Mark-the-minority required/optional labeling.
 *
 * Compute once from the schema (or field list); FieldLayout reads the mode
 * from context / props and never marks both required and optional.
 */

import { createContext, useContext } from 'react';

/** Concrete marking mode applied to labels. */
export type RequiredMarkMode = 'asterisk' | 'required' | 'optional' | 'none';

/** Strategy including schema-driven `"auto"`. */
export type RequiredMarkStrategy = RequiredMarkMode | 'auto';

/**
 * Map theme house knob `requiredMarking` → FieldLayout mark mode.
 * `minority` starts as asterisk (mark-required helper) until a form
 * supplies schema-driven auto via {@link computeRequiredMarkMode}.
 */
export function mapHouseRequiredMarking(house: string | undefined | null): RequiredMarkMode {
  if (house === 'optional') {
    return 'optional';
  }
  if (house === 'asterisk' || house === 'minority') {
    return 'asterisk';
  }
  return 'asterisk';
}

export interface RequiredMarkingContextValue {
  mode: RequiredMarkMode;
}

export const RequiredMarkingContext = createContext<RequiredMarkingContextValue | null>(null);

export function useRequiredMarking(): RequiredMarkingContextValue | null {
  return useContext(RequiredMarkingContext);
}

/**
 * Resolve the marking mode from field `required` flags.
 *
 * - `"auto"`: mark whichever of required/optional is the minority; on a tie,
 *   mark required. If every field shares the same requiredness, return
 *   `"none"` (nothing to contrast).
 * - Explicit strategies pass through unchanged.
 */
export function computeRequiredMarkMode(
  requiredFlags: readonly boolean[],
  strategy: RequiredMarkStrategy = 'auto',
): RequiredMarkMode {
  if (strategy !== 'auto') {
    return strategy;
  }
  if (requiredFlags.length === 0) {
    return 'none';
  }

  let requiredCount = 0;
  for (const flag of requiredFlags) {
    if (flag) {
      requiredCount += 1;
    }
  }
  const optionalCount = requiredFlags.length - requiredCount;

  if (requiredCount === 0 || optionalCount === 0) {
    return 'none';
  }
  return requiredCount <= optionalCount ? 'required' : 'optional';
}

/**
 * Suffix appended to a field label for the given mode.
 * Empty string when the field should not be marked.
 */
export function formatRequiredMarkSuffix(required: boolean | undefined, mode: RequiredMarkMode): string {
  switch (mode) {
    case 'asterisk':
      return required ? ' *' : '';
    case 'required':
      return required ? ' (required)' : '';
    case 'optional':
      return required ? '' : ' (optional)';
    case 'none':
      return '';
    default:
      return '';
  }
}
