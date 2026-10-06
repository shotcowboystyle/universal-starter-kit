'use client';

import { Skeleton, XStack, YStack } from '@repo/ui';

export default function WorkspaceLoading() {
  return (
    <YStack flex={1} gap="$4" padding="$4">
      <XStack alignItems="center" justifyContent="space-between">
        <Skeleton variant="rounded" width={200} height={40} />
        <Skeleton variant="rounded" width={300} height={40} />
      </XStack>
      <XStack flexWrap="wrap" gap="$4">
        {Array.from({ length: 6 }).map((_, i) => (
          <YStack key={i} width="100%" $md={{ width: '48%' }} $lg={{ width: '31%' }}>
            <Skeleton variant="rounded" height={180} />
          </YStack>
        ))}
      </XStack>
    </YStack>
  );
}
