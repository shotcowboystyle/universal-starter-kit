import { parseCookieValue } from './localePersistence';

export interface DetectLanguageOptions {
  supportedLanguages: string[];
  defaultLanguage: string;
}

/**
 * Detect the user's preferred language from a Request.
 * Priority: preferred_language cookie → Accept-Language header → default.
 */
export function detectLanguage(request: Request, options: DetectLanguageOptions): string {
  const { supportedLanguages, defaultLanguage } = options;

  // 1. Check preferred_language cookie
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookieLang = parseCookieValue(cookieHeader, 'preferred_language');
  if (cookieLang && supportedLanguages.includes(cookieLang)) {
    return cookieLang;
  }

  // 2. Parse Accept-Language header with quality values
  const acceptLang = request.headers.get('accept-language');
  if (acceptLang) {
    const preferred = parseAcceptLanguage(acceptLang);
    for (const lang of preferred) {
      if (supportedLanguages.includes(lang)) {
        return lang;
      }
      // Try base code (e.g. "es" from "es-ES")
      const base = lang.split('-')[0];
      if (base !== lang && supportedLanguages.includes(base)) {
        return base;
      }
    }
  }

  return defaultLanguage;
}

/** Parse Accept-Language header into language codes sorted by quality (descending). */
function parseAcceptLanguage(header: string): string[] {
  return header
    .split(',')
    .map((part) => {
      const [lang, ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      return { lang: lang.trim(), q };
    })
    .filter(({ lang }) => lang && lang !== '*')
    .sort((a, b) => b.q - a.q)
    .map(({ lang }) => lang);
}
