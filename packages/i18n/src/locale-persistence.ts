import { getCookie, setCookie } from '@repo/platform';

// Cookie name matches Frappe's convention for language preference
const cookieName = 'preferred_language';

/** Read the `preferred_language` cookie value (client-side). */
export function getPersistedLanguage(): string | null {
  return getCookie(cookieName);
}

/** Set the `preferred_language` cookie (client-side, 1-year expiry). */
export function persistLanguage(lang: string): void {
  setCookie(cookieName, lang, { days: 365, sameSite: 'Lax' });
}

/** Parse a single cookie value from a cookie header string. */
export function parseCookieValue(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.split(';').find((c) => c.trim().startsWith(`${name}=`));
  if (!match) {
    return null;
  }
  const val = match.split('=')[1]?.trim();
  return val ? decodeURIComponent(val) : null;
}
