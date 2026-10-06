'use client';

import { Button, H2, Paragraph, YStack } from '@repo/ui';
import { useTranslations } from 'next-intl';

export default function LocaleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('error');

  return (
    <YStack minHeight="100vh" alignItems="center" justifyContent="center" gap="$4">
      <H2>{t('title')}</H2>
      <Paragraph color="$color10">{error.message}</Paragraph>
      {error.digest ? (
        <Paragraph size="$2" color="$color10">
          Error ID: {error.digest}
        </Paragraph>
      ) : null}
      <Button accent onPress={reset}>
        {t('tryAgain')}
      </Button>
    </YStack>
  );
}
