export const COLOR_LITERAL: RegExp;
export const PALETTE_FILE: RegExp;
export const CHROME_PROPS: readonly string[];
export const LAYOUT_PROPS: readonly string[];
export const GEOMETRY_PROPS: readonly string[];
export const MARGIN_PROPS: readonly string[];
export function isPaletteModule(filename: string | undefined): boolean;
export function matchColorLiteral(value: unknown): string | undefined;
export function findHexEscapes(src: string): { line: number; reason: string }[];
export const plugin: {
  meta?: { name?: string };
  rules?: Record<string, unknown>;
};
declare const defaultExport: typeof plugin;
export default defaultExport;
