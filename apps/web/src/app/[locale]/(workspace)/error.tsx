'use client';

import { Button, H3, Paragraph, YStack } from '@repo/ui';
import { useTranslations } from 'next-intl';

const WorkspaceError = ({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) => {
  const t = useTranslations('error');

  return (
    <YStack
      flex={1}
      alignItems="center"
      justifyContent="center"
      gap="$4">
      <H3>{t('workspaceError')}</H3>
      <Paragraph
        size="$2"
        color="$color10">
        {error.message}
      </Paragraph>
      <Button
        outlined
        onPress={reset}>
        {t('tryAgain')}
      </Button>
    </YStack>
  );
};

export default WorkspaceError;
