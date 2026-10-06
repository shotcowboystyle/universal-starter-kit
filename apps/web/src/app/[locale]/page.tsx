'use client';

import { Paragraph, YStack } from '@repo/ui';
import { useEffect } from 'react';

import { ROUTES } from '@/constants/routes';
import { useRouter } from '@/i18n/navigation';
import { useAuthStore } from '@/stores/auth-store';

// This page acts as a client-side entry point to redirect users
// based on their authentication status.
const RootPage = () => {
  const { user, isLoading } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    // Wait until the authentication status is determined
    if (isLoading) {
      return;
    }

    // Logged in: main content page. Otherwise the login page; '/login' is hardcoded
    // because it's a frontend route and not part of the API routes constant.
    const target = user == null ? '/login' : ROUTES.BOARDS.OVERVIEW_PAGE;
    // oxlint-disable-next-line react-doctor/nextjs-no-client-side-redirect -- auth state lives in a client store, so the redirect can't run on the server
    router.replace(target);
  }, [user, isLoading, router]);

  // Render a loading state while we determine the redirect.
  // This can be replaced with a more sophisticated loading spinner component.
  return (
    <YStack
      height="100vh"
      width="100%"
      alignItems="center"
      justifyContent="center">
      <Paragraph>Loading...</Paragraph>
    </YStack>
  );
};

export default RootPage;
