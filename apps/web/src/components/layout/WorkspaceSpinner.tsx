'use client';

import { Spinner, YStack } from '@repo/ui';

export default function WorkspaceSpinner() {
  return (
    <YStack height="100vh" alignItems="center" justifyContent="center">
      <Spinner size="large" />
    </YStack>
  );
}
