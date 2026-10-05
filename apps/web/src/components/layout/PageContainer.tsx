'use client';

import { ScrollView, YStack } from '@repo/ui';
import React from 'react';

export default function PageContainer({
  children,
  scrollable = true,
}: {
  children: React.ReactNode;
  scrollable?: boolean;
}) {
  const content = (
    <YStack testID="content-area" height="100%" paddingHorizontal="$4" $sm={{ paddingHorizontal: '$6' }}>
      {children}
    </YStack>
  );

  return (
    <YStack testID="page-container">
      {scrollable ? (
        <ScrollView testID="scroll-area" height="calc(100dvh - 52px)">
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </YStack>
  );
}
