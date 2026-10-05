'use client';

import { useMedia, XStack, YStack } from '@repo/ui';
import React, { useState } from 'react';
import { Toaster } from 'sonner';

import AppSidebar from '@/components/layout/AppSidebar';
import Header from '@/components/layout/Header';
import { TOAST_DURATION } from '@/constants/ui';

export default function RootWrapper({ children }: { children: React.ReactNode }) {
  const media = useMedia();
  // Desktop: sidebar docked, open by default. Mobile: off-canvas overlay, closed by default.
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleSidebar = () => {
    if (media.md) {
      setDesktopOpen((open) => !open);
    } else {
      setMobileOpen((open) => !open);
    }
  };

  return (
    <>
      <XStack minHeight="100dvh" testID="sidebar-provider">
        {mobileOpen && (
          <YStack
            testID="sidebar-backdrop"
            position="absolute"
            inset={0}
            zIndex={40}
            backgroundColor="$shadowColor"
            $md={{ display: 'none' }}
            onPress={() => {
              setMobileOpen(false);
            }}
          />
        )}
        <YStack
          testID="sidebar-container"
          display={mobileOpen ? 'flex' : 'none'}
          position="absolute"
          top={0}
          bottom={0}
          left={0}
          zIndex={50}
          backgroundColor="$background"
          $md={{ display: desktopOpen ? 'flex' : 'none', position: 'relative', zIndex: 0 }}>
          <AppSidebar
            onNavigate={() => {
              setMobileOpen(false);
            }}
          />
        </YStack>
        <YStack testID="sidebar-inset" flex={1} minWidth={0}>
          <Header onToggleSidebar={toggleSidebar} />
          {children}
        </YStack>
      </XStack>
      <Toaster
        position="bottom-right"
        expand={false}
        toastOptions={{
          duration: TOAST_DURATION,
        }}
        visibleToasts={1}
        closeButton
      />
    </>
  );
}
