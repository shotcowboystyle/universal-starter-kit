/**
 * File: /src/code/highlighter/index.ts
 * Project: @repo/ui
 *
 * Shiki-based syntax highlighting utilities.
 * Uses dynamic import so shiki is only loaded when needed (optional peer dep).
 */

import { createContext, useContext, useEffect, useState } from 'react';

import { houseSyntaxTheme } from './houseSyntaxTheme';

export * from './houseSyntaxTheme';

/** A single highlighted token with inline color */
export interface HighlightToken {
  content: string;
  /** A theme token such as `$syntaxBlue` under the house theme, or a named theme's hex */
  color?: string;
  fontStyle?: number; // 0=normal, 1=italic, 2=bold, 3=bold+italic
}

/** A line of highlighted tokens */
export type HighlightLine = HighlightToken[];

/** Options for the highlight context provider */
export interface ShikiContextValue {
  theme?: string;
}

export const ShikiContext = createContext<ShikiContextValue>({});

/**
 * Hook that tokenizes code using shiki.
 * Returns null while loading, then an array of lines (each line is an array of tokens).
 * Falls back to plain text if shiki is not installed.
 */
export function useShikiTokens(code: string, language: string, theme?: string): HighlightLine[] | null {
  const ctx = useContext(ShikiContext);
  const resolvedTheme = theme || ctx.theme || houseSyntaxTheme.name;
  const [tokens, setTokens] = useState<HighlightLine[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    highlightCode(code, language, resolvedTheme)
      .then((result) => {
        if (!cancelled) {
          setTokens(result);
        }
      })
      .catch(() => {
        // If shiki fails (not installed, unsupported language, etc.),
        // fall back to plain text tokens
        if (!cancelled) {
          setTokens(code.split('\n').map((line) => [{ content: line }]));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code, language, resolvedTheme]);

  return tokens;
}

/** Plain text fallback when shiki is unavailable */
function plainTextTokens(code: string): HighlightLine[] {
  return code.split('\n').map((line) => [{ content: line }]);
}

// One shared highlighter for the whole app (this replaced a second
// highlighter stack the markdown package used to ship).
// Uses shiki's pure-JavaScript regex engine so highlighting works on web,
// Expo Go, and native without WASM; languages/themes load on demand instead
// of an eager preload.
let highlighterPromise: Promise<any> | null = null;

function getHighlighter(): Promise<any> {
  if (!highlighterPromise) {
    highlighterPromise = Promise.all([import('shiki'), import('shiki/engine/javascript')]).then(([shiki, jsEngine]) =>
      shiki.createHighlighter({
        themes: [],
        langs: [],
        engine: jsEngine.createJavaScriptRegexEngine(),
      }),
    );
  }
  return highlighterPromise;
}

/**
 * Highlight code using shiki and return structured tokens.
 * Dynamically imports shiki so it's only loaded when actually used.
 * Falls back to plain text if shiki is not installed or fails.
 */
export async function highlightCode(
  code: string,
  language: string,
  theme = houseSyntaxTheme.name,
): Promise<HighlightLine[]> {
  try {
    const highlighter = await Promise.race([
      getHighlighter(),
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          reject(new Error('shiki import timeout'));
        }, 5000),
      ),
    ]);
    await Promise.all([
      highlighter.loadTheme((theme === houseSyntaxTheme.name ? houseSyntaxTheme : theme) as any),
      // Unknown languages fall back to plain text below; theme failures
      // reject into the catch (matching the old shorthand behavior).
      highlighter.loadLanguage(language as any).catch(() => {}),
    ]);
    const lang = highlighter.getLoadedLanguages().includes(language) ? language : 'text';
    const result = highlighter.codeToTokens(code, {
      lang: lang as any,
      theme: theme as any,
    });
    return result.tokens.map((line: any[]) =>
      line.map((token) => ({
        content: token.content,
        color: token.color,
        fontStyle: token.fontStyle,
      })),
    );
  } catch {
    // Fallback: return plain text if shiki is unavailable or times out
    return plainTextTokens(code);
  }
}
