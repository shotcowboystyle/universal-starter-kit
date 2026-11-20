export const COLOR_LITERAL: RegExp;
export const PALETTE_FILE: RegExp;
export const CHROME_PROPS: readonly string[];
export const LAYOUT_PROPS: readonly string[];
export const GEOMETRY_PROPS: readonly string[];
export const MARGIN_PROPS: readonly string[];
export function isPaletteModule(filename: string | undefined): boolean;
export function matchColorLiteral(value: string | undefined): string | undefined;
export function findHexEscapes(src: string): { line: number; reason: string }[];
export interface RuleNode {
  type?: string;
}
export interface RuleOptions {
  slotMargins?: string[];
  drawings?: string[];
  chromeAllow?: string[];
}
export interface RuleReport {
  node: RuleNode;
  messageId: string;
  data?: Record<string, string>;
}
export interface RuleContext {
  filename?: string;
  getFilename?: () => string;
  sourceCode?: { text?: string };
  getSourceCode?: () => { text?: string };
  options?: (RuleOptions | undefined)[];
  report: (report: RuleReport) => void;
}
export type RuleVisitors = Record<string, ((node: RuleNode) => void) | undefined>;
export interface RuleModule {
  meta: object;
  create: (context: RuleContext) => RuleVisitors;
}
export const plugin: {
  meta?: { name?: string };
  rules?: Record<string, RuleModule>;
};
declare const defaultExport: typeof plugin;
export default defaultExport;
