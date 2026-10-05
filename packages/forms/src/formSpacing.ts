/**
 * Fallback form rhythm tokens. Prefer `knobProps.gap` /
 * `knobProps.gapLg` (space/density) at the layout primitives — these
 * constants are the medium-space snapshot, not a size mapping.
 */
export const formFieldGap = '$4' as const;
export const formSectionGap = '$8' as const;

/** Default readable form width (~480–600px). */
export const formReadableMaxWidth = 560;
