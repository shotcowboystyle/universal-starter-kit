export interface FileReasonRegistry {
  specPath: string;
  present: boolean;
  escapes: { file: string; reason: string }[];
}

export const SLOT_MARGIN_HEADING: string;
export const SLOT_MARGIN_CLASS: string;
export const SIZE_RECIPE_ESCAPE_HEADING: string;
export const HEX_ESCAPE_HEADING: string;

export function readSpecTable(markdown: string, heading: string): string[][] | null;
export function readSlotMarginRegistry(specPath?: string): {
  specPath: string;
  present: boolean;
  members: string[];
};
export function readSizeRecipeEscapeRegistry(specPath?: string): FileReasonRegistry;
export function readHexEscapeRegistry(specPath?: string): FileReasonRegistry;
