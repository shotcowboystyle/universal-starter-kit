'use client';

import { Avatar, Button, DropdownMenu, Paragraph, Skeleton, YStack } from '@repo/ui';
import { useTranslations } from 'next-intl';

import { useAuth } from '@/hooks/useAuth';

export function UserNav() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const t = useTranslations('user');

  // While loading, show a placeholder to prevent flicker
  if (isLoading) {
    return <Skeleton variant="circular" width={36} height={36} testID="user-nav-loading" />;
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <DropdownMenu placement="bottom-end">
      <DropdownMenu.Trigger asChild>
        <Button chromeless circular size="$3" padding={0} aria-label={user.email}>
          {/* The backend doesn't provide an image, so the avatar shows initials */}
          <Avatar size="$3" initials={user.email?.[0].toUpperCase()} />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content minWidth={224}>
        <DropdownMenu.Label>
          <YStack gap="$1">
            <Paragraph size="$3" fontWeight="500">
              {user.email?.split('@')[0]}
            </Paragraph>
            <Paragraph size="$2" color="$color10">
              {user.email}
            </Paragraph>
          </YStack>
        </DropdownMenu.Label>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onSelect={logout}>{t('logOut')}</DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
