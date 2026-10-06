'use client';

import { Sidebar, type SidebarItem, Text, XStack, YStack } from '@repo/ui';
import { HomeIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Icons } from '@/components/layout/Icons';
import { useBoards } from '@/hooks/useBoards';
import { usePathname, useRouter } from '@/i18n/navigation';
import type { Board } from '@/types/dbInterface';

export default function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations('sidebar');
  const pathname = usePathname();
  const router = useRouter();
  const { myBoards, teamBoards, loading } = useBoards();

  const go = (href: string) => {
    router.push(href);
    onNavigate?.();
  };

  const boardItems = (boards: Board[] | undefined): SidebarItem[] =>
    loading
      ? [{ label: t('loading'), value: 'loading' }]
      : (boards ?? []).map((board) => ({
          label: board.title,
          value: board._id,
          active: pathname.endsWith(`/boards/${board._id}`),
          onPress: () => go(`/boards/${board._id}`),
        }));

  return (
    <YStack width={250} height="100%">
      <XStack alignItems="center" gap="$2" padding="$3">
        <YStack
          width={32}
          height={32}
          alignItems="center"
          justifyContent="center"
          borderRadius="$3"
          borderWidth={1}
          borderColor="$borderColor">
          <Icons.projectLogo size={16} aria-hidden />
        </YStack>
        <Text fontWeight="600" numberOfLines={1} flex={1}>
          {t('title')}
        </Text>
      </XStack>
      <Sidebar
        aria-label={t('title')}
        sections={[
          {
            items: [
              {
                label: t('overview'),
                value: 'overview',
                icon: <HomeIcon size={16} aria-hidden />,
                active: pathname.endsWith('/boards'),
                onPress: () => go('/boards'),
              },
            ],
          },
          { title: t('myBoards'), items: boardItems(myBoards) },
          { title: t('teamBoards'), items: boardItems(teamBoards) },
        ]}
      />
    </YStack>
  );
}
