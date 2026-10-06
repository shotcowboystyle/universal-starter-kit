export const DRAWING_HEADING: string;
export const DRAWING_CLASS: string;
export const CHROME_ALLOW_CLASS: string;
export const DRAWING_PRAGMA: RegExp;

export function defaultSpecPath(cwd?: string): string;
export function readDrawingRegistry(specPath?: string): {
  specPath: string;
  present: boolean;
  files: string[];
  chromeAllow: string[];
};
export function isDrawingFile(filename: string | undefined, files: string[]): boolean;
