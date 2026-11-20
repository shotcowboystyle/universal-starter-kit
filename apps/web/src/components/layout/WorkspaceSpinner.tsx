'use client';

import { Spinner, YStack } from '@repo/ui';

const WorkspaceSpinner = () => (
  <YStack
    height="100vh"
    alignItems="center"
    justifyContent="center">
    <Spinner size="large" />
  </YStack>
);

export default WorkspaceSpinner;
