'use client';

import { Button, H2, Paragraph, YStack } from '@repo/ui';
import { useTranslations } from 'next-intl';

import { useRouter } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations('error');
  const router = useRouter();

  return (
    <YStack minHeight="100vh" alignItems="center" justifyContent="center" gap="$4">
      <H2 size="$10">404</H2>
      <Paragraph color="$color10">{t('notFound')}</Paragraph>
      <Button accent onPress={() => router.push('/')}>
        {t('goHome')}
      </Button>
    </YStack>
  );
}
