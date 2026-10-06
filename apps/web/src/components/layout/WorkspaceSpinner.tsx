'use client';

import { Spinner, YStack } from '@repo/ui';

const WorkspaceSpinner = () => {
  return (
    <YStack
      height="100vh"
      alignItems="center"
      justifyContent="center">
      <Spinner size="large" />
    </YStack>
  );
};

export default WorkspaceSpinner;
