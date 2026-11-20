import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { COLOR_SCHEME_COOKIE } from '@/lib/color-scheme';

import { ClientProviders } from './ClientProviders';

/** Reads the persisted color scheme so SSR matches what the client will render. */
export const SchemeProviders = async ({ children }: { children: ReactNode }) => {
  const cookieStore = await cookies();
  const scheme = cookieStore.get(COLOR_SCHEME_COOKIE)?.value;
  return <ClientProviders initialScheme={scheme === 'dark' ? 'dark' : 'light'}>{children}</ClientProviders>;
};
