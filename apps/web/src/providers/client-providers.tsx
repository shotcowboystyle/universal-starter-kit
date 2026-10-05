'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider } from 'next-themes';
import React, { useState } from 'react';

import { type ColorScheme } from '@/lib/colorScheme';
import { useAuthStore } from '@/stores/auth-store';

import { TamaguiRoot } from './TamaguiRoot';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

// SyncAuthStore ensures auth store is hydrated from persistence on mount
// Without subscribing to any state, it just triggers hydration once
function SyncAuthStore() {
  // Trigger hydration by accessing getState, but don't subscribe to updates
  React.useEffect(() => {
    // Access getState to ensure persistence is hydrated
    useAuthStore.getState();
  }, []);
  return null;
}

export function ClientProviders({
  children,
  initialScheme,
}: {
  children: React.ReactNode;
  initialScheme?: ColorScheme;
}) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        value={{ light: 't_light', dark: 't_dark' }}
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange>
        <TamaguiRoot initialScheme={initialScheme}>
          <SyncAuthStore />
          {children}
          <ReactQueryDevtools initialIsOpen={false} />
        </TamaguiRoot>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
