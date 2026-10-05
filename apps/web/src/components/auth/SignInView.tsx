'use client';

import { H1, Paragraph, Text, Theme, XStack, YStack } from '@repo/ui';
import { Presentation } from 'lucide-react';
import { useTranslations } from 'next-intl';
import React from 'react';

import UserAuthForm from './UserAuthForm';

export default function SignInViewPage() {
  const t = useTranslations('login');
  return (
    <XStack
      render="main"
      aria-label="Sign in page"
      minHeight="100vh"
      flexDirection="column"
      $lg={{ flexDirection: 'row' }}>
      {/* Brand panel stays dark in both schemes; forceClassName keeps the
          server and client theme markup identical during hydration. */}
      <Theme name="dark" forceClassName>
        <YStack flex={1} backgroundColor="$background" padding="$8">
          <XStack alignItems="center" gap="$2">
            <Presentation size={24} aria-hidden />
            <Text fontSize="$6" fontWeight="500">
              {t('title')}
            </Text>
          </XStack>
        </YStack>
      </Theme>
      <YStack flex={1} alignItems="center" justifyContent="center" padding="$4" $lg={{ padding: '$8' }}>
        <YStack width="100%" gap="$5" $sm={{ width: 350 }}>
          <YStack gap="$2" alignItems="center">
            <H1 size="$8" textAlign="center">
              {t('description')}
            </H1>
            <Paragraph color="$color10" textAlign="center">
              {t('formHint')}
            </Paragraph>
          </YStack>
          <UserAuthForm />
        </YStack>
      </YStack>
    </XStack>
  );
}
