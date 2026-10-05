'use client';

import { Button, Separator, XStack } from '@repo/ui';
import { PanelLeftIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

import LanguageSwitcher from './LanguageSwitcher';
import ThemeToggle from './ThemeToggle';
import { UserNav } from './UserNav';

export default function Header({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const t = useTranslations('sidebar');
  return (
    <XStack
      render="header"
      alignItems="center"
      gap="$2"
      padding="$2"
      $md={{ gap: '$4', minHeight: 64, paddingHorizontal: '$4' }}>
      <XStack alignItems="center" gap="$2">
        <Button
          chromeless
          size="$3"
          icon={PanelLeftIcon}
          aria-label={t('toggle')}
          testID="sidebar-trigger"
          onPress={onToggleSidebar}
        />
        <Separator vertical height={16} />
      </XStack>

      <XStack flex={1} minWidth={0}>
        <Breadcrumbs />
      </XStack>

      <XStack alignItems="center" gap="$2">
        <UserNav />
        <ThemeToggle />
        <LanguageSwitcher />
      </XStack>
    </XStack>
  );
}
