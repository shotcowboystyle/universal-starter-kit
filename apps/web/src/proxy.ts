import type { Locale } from '@repo/i18n';
import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { routing } from '@/i18n/routing';

const isLocale = (value: string | undefined): value is Locale =>
  value !== undefined && value !== '' && routing.locales.some((locale) => locale === value);

const intlMiddleware = createMiddleware(routing);

const proxy = async (request: NextRequest) => {
  const { pathname } = request.nextUrl;

  // Skip auth check for public routes
  const isPublicRoute = pathname.includes('/login') || pathname.startsWith('/api') || pathname.startsWith('/_next');

  if (!isPublicRoute) {
    const jwtCookie = request.cookies.get('jwt')?.value;
    const isAuthCookie = request.cookies.get('isAuthenticated')?.value;
    const hasToken =
      (jwtCookie !== undefined && jwtCookie !== '') || (isAuthCookie !== undefined && isAuthCookie !== '');

    if (!hasToken) {
      // Extract locale from pathname or use default
      const [, pathLocale] = pathname.split('/');
      const locale = isLocale(pathLocale) ? pathLocale : routing.defaultLocale;

      const loginUrl = new URL(`/${locale}/login`, request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return intlMiddleware(request);
};

export default proxy;

export const config = {
  // Match only internationalized pathnames
  // We skip all API routes, including the old /api/auth paths
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
