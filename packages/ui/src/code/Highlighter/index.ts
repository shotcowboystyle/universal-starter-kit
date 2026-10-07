/**
 * File: /src/code/highlighter/index.ts
 * Project: @repo/ui
 *
 * Shiki-based syntax highlighting utilities.
 * Uses dynamic import so shiki is only loaded when needed (optional peer dep).
 */

import { createContext, useContext, useEffect, useState } from 'react';
import type { ThemeInput, ThemedToken } from 'shiki';

import { houseSyntaxTheme } from './house-syntax-theme';

export { houseSyntaxTheme } from './house-syntax-theme';
export type { HouseSyntaxTheme, HouseSyntaxThemeSetting } from './house-syntax-theme';

/** A single highlighted token with inline color */
export interface HighlightToken {
  content: string;
  /** A theme token such as `$syntaxBlue` under the house theme, or a named theme's hex */
  color?: string;
  /** 0=normal, 1=italic, 2=bold, 3=bold+italic */
  fontStyle?: number;
}

/** A line of highlighted tokens */
export type HighlightLine = HighlightToken[];

/** Options for the highlight context provider */
export interface ShikiContextValue {
  theme?: string;
}

export const ShikiContext = createContext<ShikiContextValue>({});

// One shared highlighter for the whole app (this replaced a second
// highlighter stack the markdown package used to ship).
// Uses shiki's pure-JavaScript regex engine so highlighting works on web,
// Expo Go, and native without WASM; languages/themes load on demand instead
// of an eager preload.
// The slice of shiki's highlighter used here, typed over plain strings:
// language/theme ids are runtime input, validated by shiki itself.
interface Highlighter {
  loadTheme(theme: ThemeInput | string): Promise<void>;
  loadLanguage(language: string): Promise<void>;
  getLoadedLanguages(): string[];
  codeToTokens(code: string, options: { lang: string; theme: string }): { tokens: ThemedToken[][] };
}

let highlighterPromise: Promise<Highlighter> | undefined;

const createShikiHighlighter = async (): Promise<Highlighter> => {
  const [shiki, jsEngine] = await Promise.all([import('shiki'), import('shiki/engine/javascript')]);
  return await shiki.createHighlighter({
    themes: [],
    langs: [],
    engine: jsEngine.createJavaScriptRegexEngine(),
  });
};

const getHighlighter = async (): Promise<Highlighter> => {
  highlighterPromise ??= createShikiHighlighter();
  return await highlighterPromise;
};

// Unknown languages fall back to plain text in `highlightCode`; theme failures
// reject into its catch (matching the old shorthand behavior).
const loadLanguageOrIgnore = async (highlighter: Highlighter, language: string): Promise<void> => {
  try {
    await highlighter.loadLanguage(language);
  } catch {
    // Safe to continue: an unloadable language is rendered as plain text.
  }
};

const rejectAfter = async (ms: number): Promise<never> =>
  // oxlint-disable-next-line promise/avoid-new -- timeout needs a promise that settles from a timer callback
  await new Promise<never>((_resolve, reject) => {
    setTimeout(() => {
      reject(new Error('shiki import timeout'));
    }, ms);
  });

const nonEmpty = (value?: string): string | undefined => (value === '' ? undefined : value);

/** Plain text fallback when shiki is unavailable */
const plainTextTokens = (code: string): HighlightLine[] => code.split('\n').map((line) => [{ content: line }]);

/**
 * Highlight code using shiki and return structured tokens.
 * Dynamically imports shiki so it's only loaded when actually used.
 * Falls back to plain text if shiki is not installed or fails.
 */
export const highlightCode = async (
  code: string,
  language: string,
  theme = houseSyntaxTheme.name,
): Promise<HighlightLine[]> => {
  try {
    const highlighter = await Promise.race([getHighlighter(), rejectAfter(5000)]);
    await Promise.all([
      highlighter.loadTheme(theme === houseSyntaxTheme.name ? houseSyntaxTheme : theme),
      loadLanguageOrIgnore(highlighter, language),
    ]);
    const lang = highlighter.getLoadedLanguages().includes(language) ? language : 'text';
    const result = highlighter.codeToTokens(code, {
      lang,
      theme,
    });
    return result.tokens.map((line) =>
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
};

/**
 * Hook that tokenizes code using shiki.
 * Returns null while loading, then an array of lines (each line is an array of tokens).
 * Falls back to plain text if shiki is not installed.
 */
export const useShikiTokens = (code: string, language: string, theme?: string): HighlightLine[] | null => {
  const ctx = useContext(ShikiContext);
  const resolvedTheme = nonEmpty(theme) ?? nonEmpty(ctx.theme) ?? houseSyntaxTheme.name;
  const [tokens, setTokens] = useState<HighlightLine[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const result = await highlightCode(code, language, resolvedTheme);
        if (!cancelled) {
          setTokens(result);
        }
      } catch {
        // If shiki fails (not installed, unsupported language, etc.),
        // fall back to plain text tokens
        if (!cancelled) {
          setTokens(plainTextTokens(code));
        }
      }
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [code, language, resolvedTheme]);

  return tokens;
};
