/**
 * Canonical lazy mermaid renderer (LC-16: one implementation).
 *
 * Consumed by this package's read-only `MermaidBlock` and by the
 * `@repo/rich-text` editor's live code-block preview. The
 * mermaid engine (~500 KB raw) is NEVER in an eager chunk: it is
 * dynamically imported on the first diagram render and cached.
 *
 * The result contract is Axiom 6 friendly — invalid diagram source returns
 * `{ ok: false, error }` with mermaid's parse message so callers can show
 * the error instead of a blank box.
 */

import type { MermaidConfig } from 'mermaid';
import type Mermaid from 'mermaid';

export interface MermaidRenderOptions {
  /** Color scheme for mermaid's built-in theming (default "light") */
  scheme?: 'light' | 'dark';
  /** Font family passed to mermaid's theme config */
  fontFamily?: string;
}

export type MermaidRenderResult = { ok: true; svg: string } | { ok: false; error: string };

type MermaidModule = typeof Mermaid;

let mermaidPromise: Promise<MermaidModule> | null = null;
let idCounter = 0;
let lastInitKey: string | null = null;

const importMermaid = async (): Promise<MermaidModule> => {
  const mod = await import('mermaid');
  return mod.default;
};

const loadMermaid = async (): Promise<MermaidModule> => {
  mermaidPromise ??= importMermaid();
  return await mermaidPromise;
};

/**
 * Renders mermaid source to an isolated SVG string. Re-initializes the
 * engine only when the scheme/font changes (mermaid config is global).
 */
export const renderMermaidDiagram = async (
  code: string,
  options: MermaidRenderOptions = {},
): Promise<MermaidRenderResult> => {
  if (typeof document === 'undefined') {
    return { ok: false, error: 'Mermaid diagrams require a DOM environment' };
  }
  idCounter += 1;
  const id = `mpo-mermaid-${idCounter}`;
  try {
    const mermaid = await loadMermaid();
    const initKey = `${options.scheme ?? 'light'}|${options.fontFamily ?? ''}`;
    if (initKey !== lastInitKey) {
      const config: MermaidConfig = {
        startOnLoad: false,
        securityLevel: 'strict',
        theme: options.scheme === 'dark' ? 'dark' : 'default',
      };
      if (options.fontFamily !== undefined && options.fontFamily !== '') {
        config.fontFamily = options.fontFamily;
      }
      mermaid.initialize(config);
      lastInitKey = initKey;
    }
    // parse() first: it throws a clean syntax error without leaving the
    // error bomb SVG that render() can inject into the document
    await mermaid.parse(code);
    const { svg } = await mermaid.render(id, code);
    return { ok: true, svg };
  } catch (error) {
    // render() can orphan its temp element on failure — clean it up
    document.querySelector(`#d${id}`)?.remove();
    document.querySelector(`#${id}`)?.remove();
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
};

/** Test seam: reset engine cache/init state */
export const resetMermaidForTesting = (): void => {
  mermaidPromise = null;
  lastInitKey = null;
};
