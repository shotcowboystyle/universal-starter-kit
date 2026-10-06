'use client';

import { ThemeProvider } from '@repo/theme';
import { useTheme } from 'next-themes';
import { useServerInsertedHTML } from 'next/navigation';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { CookiesProvider } from 'react-cookie';
import { StyleSheet } from 'react-native';

import { useHydrated } from '@/hooks/use-hydrated';
import { COLOR_SCHEME_COOKIE } from '@/lib/color-scheme';
import type { ColorScheme } from '@/lib/color-scheme';
import { themeConfig } from '@/lib/tamagui/theme-config';

interface RNWStyleSheet {
  getSheet: () => { id: string; textContent: string };
}

/**
 * Mounts the house theme (Tamagui + knobs) under next-themes, which owns the
 * light/dark choice and writes `t_light` / `t_dark` on <html> before paint.
 * `initialScheme` (read from the cookie on the server) is used until hydration
 * so late-hydrating Suspense boundaries render the same scheme as the server.
 */
export function TamaguiRoot({
  children,
  initialScheme = 'light',
}: {
  children: ReactNode;
  initialScheme?: ColorScheme;
}) {
  const { resolvedTheme } = useTheme();
  const hydrated = useHydrated();
  const resolved: ColorScheme = resolvedTheme === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    if (!resolvedTheme) {
      return;
    }
    document.cookie = `${COLOR_SCHEME_COOKIE}=${resolved}; path=/; max-age=31536000; samesite=lax`;
  }, [resolvedTheme, resolved]);
  const injectedTamaguiCss = useRef(false);

  useServerInsertedHTML(() => {
    const sheet = (StyleSheet as unknown as RNWStyleSheet).getSheet();
    const tamaguiCss = injectedTamaguiCss.current ? '' : themeConfig.tamagui.getCSS();
    injectedTamaguiCss.current = true;
    return (
      <>
        <style
          id={sheet.id}
          dangerouslySetInnerHTML={{ __html: sheet.textContent }}
        />
        {tamaguiCss ? (
          <style
            id="tamagui-css"
            dangerouslySetInnerHTML={{ __html: tamaguiCss }}
          />
        ) : null}
      </>
    );
  });

  return (
    <CookiesProvider>
      <ThemeProvider
        config={{ tamagui: themeConfig.tamagui }}
        systemTheme={hydrated ? resolved : initialScheme}>
        {children}
      </ThemeProvider>
    </CookiesProvider>
  );
}
