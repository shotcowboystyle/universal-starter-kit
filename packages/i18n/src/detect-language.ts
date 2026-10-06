import { parseCookieValue } from './locale-persistence';

export interface DetectLanguageOptions {
  supportedLanguages: string[];
  defaultLanguage: string;
}

/** Parse Accept-Language header into language codes sorted by quality (descending). */
const parseAcceptLanguage = (header: string): string[] =>
  header
    .split(',')
    .map((part) => {
      const [lang, ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam === undefined ? 1 : Number(qParam.trim().slice(2));
      return { lang: lang.trim(), q };
    })
    .filter(({ lang }) => lang !== '' && lang !== '*')
    .toSorted((a, b) => b.q - a.q)
    .map(({ lang }) => lang);

/**
 * Detect the user's preferred language from a Request.
 * Priority: preferred_language cookie → Accept-Language header → default.
 */
export const detectLanguage = (request: Request, options: DetectLanguageOptions): string => {
  const { supportedLanguages, defaultLanguage } = options;
  const supported = new Set(supportedLanguages);

  // 1. Check preferred_language cookie
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookieLang = parseCookieValue(cookieHeader, 'preferred_language');
  if (cookieLang !== null && supported.has(cookieLang)) {
    return cookieLang;
  }

  // 2. Parse Accept-Language header with quality values
  const acceptLang = request.headers.get('accept-language');
  if (acceptLang !== null && acceptLang !== '') {
    const preferred = parseAcceptLanguage(acceptLang);
    for (const lang of preferred) {
      if (supported.has(lang)) {
        return lang;
      }
      // Try base code (e.g. "es" from "es-ES")
      const [base] = lang.split('-');
      if (base !== lang && supported.has(base)) {
        return base;
      }
    }
  }

  return defaultLanguage;
};
