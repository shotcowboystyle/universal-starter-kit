import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { COLOR_SCHEME_COOKIE } from '@/lib/colorScheme';

import { ClientProviders } from './client-providers';

/** Reads the persisted color scheme so SSR matches what the client will render. */
export async function SchemeProviders({ children }: { children: ReactNode }) {
  const scheme = (await cookies()).get(COLOR_SCHEME_COOKIE)?.value;
  return <ClientProviders initialScheme={scheme === 'dark' ? 'dark' : 'light'}>{children}</ClientProviders>;
}
