'use client';

import { SearchInput, Select } from '@repo/forms';
import { Button, Card, CardHeader, H2, H3, Paragraph, ScrollView, Spinner, XStack, YStack } from '@repo/ui';
import { MoreHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { useBoards } from '@/hooks/useBoards';
import { usePathname, useRouter } from '@/i18n/navigation';
import { AuthService } from '@/lib/auth/authService';
import { useAuthStore } from '@/stores/auth-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type { Board } from '@/types/dbInterface';

import { BoardActions } from './board/BoardActions';
import NewBoardDialog from './board/NewBoardDialog';

type FilterType = 'all' | 'my' | 'team';

export function BoardOverview() {
  const { myBoards, teamBoards, loading: boardsLoading, refresh } = useBoards();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [isProcessingLogin, setIsProcessingLogin] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('kanban');
  const tLogin = useTranslations('login');
  const { userId, setUserInfo } = useWorkspaceStore();
  const { setSession } = useAuthStore();
  const [recentlyDeleted, setRecentlyDeleted] = useState(new Set());
  const [mounted, setMounted] = useState(false);

  // Ensure consistent SSR/client hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Navigate to a board unless it was just deleted. Clicks inside the actions
  // menu never reach here (see stopCardPress below).
  const handleBoardClick = useCallback(
    (boardId: string) => {
      if (boardId && !recentlyDeleted.has(boardId)) {
        router.push(`/boards/${boardId}`);
      }
    },
    [recentlyDeleted, router],
  );

  // Handle board deletion
  const handleBoardDelete = useCallback(
    (boardId: string) => {
      // Store the current path
      const currentPath = pathname;

      // Add to recently deleted set
      setRecentlyDeleted((prev) => new Set(prev).add(boardId));

      // Immediately redirect to /boards if we're on a board page
      if (currentPath.includes(`/board/`)) {
        router.push('/boards');
        return;
      }

      // Refresh the board list
      refresh();

      // Force a hard refresh to ensure we're on the correct page
      if (currentPath.endsWith('/boards')) {
        router.refresh();
      } else {
        router.push('/boards');
      }
    },
    [refresh, router, pathname],
  );

  // Handle login success and user data initialization
  useEffect(() => {
    const loginSuccess = searchParams.get('login_success');

    const processLogin = async () => {
      if (loginSuccess !== 'true') {
        return;
      }

      try {
        setIsProcessingLogin(true);

        // Always fetch fresh session to ensure we have the latest data
        const session = await AuthService.getSession();

        if (session?.user?._id) {
          // Update both auth and workspace stores with the user info
          setSession(session);
          setUserInfo(session.user.email, session.user._id);

          // Manually trigger boards data refresh after user info is set
          await refresh();

          // Show success message
          toast.success(tLogin('success'));

          // Clean up URL
          const params = new URLSearchParams(searchParams.toString());
          params.delete('login_success');
          const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
          await router.replace(newUrl, { scroll: false });
        } else {
          throw new Error('Failed to get user session');
        }
      } catch (error) {
        console.error('Error processing login:', error);
        toast.error(tLogin('error'));
      } finally {
        setIsProcessingLogin(false);
      }
    };

    processLogin();
  }, [searchParams, router, pathname, tLogin, setSession, setUserInfo, refresh]);

  // Ensure boards data is fetched when user is authenticated
  useEffect(() => {
    // If user is authenticated but we don't have boards data, fetch it
    if (userId && !boardsLoading && !myBoards?.length && !teamBoards?.length) {
      refresh();
    }
  }, [userId, refresh, myBoards, teamBoards, boardsLoading]);

  // Handle data refresh on tab visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refresh]);

  // Memoized filtered boards - must be before early return to maintain hooks order
  const filteredMyBoards = useMemo(
    () => myBoards?.filter((board) => board.title.toLowerCase().includes(search.toLowerCase())),
    [myBoards, search],
  );

  const filteredTeamBoards = useMemo(
    () => teamBoards?.filter((board) => board.title.toLowerCase().includes(search.toLowerCase())),
    [teamBoards, search],
  );

  const shouldShowMyBoards = filter === 'all' || filter === 'my';
  const shouldShowTeamBoards = filter === 'all' || filter === 'team';

  // Show loading state while processing login or loading boards
  // Also check !mounted to ensure consistent SSR/client hydration
  if (!mounted || isProcessingLogin || boardsLoading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" gap="$4">
        <Spinner size="large" />
        <Paragraph>{t('loading')}</Paragraph>
      </YStack>
    );
  }

  const renderBoardDetails = (board: Board, showOwner: boolean) => (
    <YStack gap="$1">
      <Paragraph size="$3" color="$color10" marginBottom="$1">
        {board.description || t('noDescription')}
      </Paragraph>
      {showOwner ? (
        <Paragraph size="$3">
          {`${t('owner')}: ${typeof board.owner === 'string' ? board.owner : board.owner?.name || 'Unknown'}`}
        </Paragraph>
      ) : null}
      <Paragraph size="$3">
        {`${t('projects')}: ${board.projects.length > 0 ? board.projects.map((p) => p.title).join(' / ') : '0'}`}
      </Paragraph>
      <Paragraph size="$3">{`${t('members')}: ${board.members.map((m) => m.name).join(', ')}`}</Paragraph>
    </YStack>
  );

  const renderSection = (
    titleKey: 'myBoards' | 'teamBoards',
    descriptionKey: 'myBoardsDescription' | 'teamBoardsDescription',
    emptyKey: 'noBoardsFound' | 'noTeamBoardsFound',
    boards: Board[] | undefined,
    owned: boolean,
  ) => (
    <YStack render="section" gap="$2">
      <H2 size="$8" paddingHorizontal="$4" testID={`${titleKey}Title`}>
        {t(titleKey)}
      </H2>
      <Paragraph size="$3" color="$color10" paddingHorizontal="$4">
        {t(descriptionKey)}
      </Paragraph>
      {boards?.length === 0 ? (
        <Paragraph color="$color10" paddingHorizontal="$4">
          {t(emptyKey)}
        </Paragraph>
      ) : (
        <XStack flexWrap="wrap" gap="$4" padding="$4">
          {boards?.map((board) => (
            <Card
              key={board._id}
              testID={`board-card-${board._id}`}
              tier="elevated"
              cursor="pointer"
              width="100%"
              $md={{ width: 'calc(50% - 8px)' }}
              $lg={{ width: 'calc(33.333% - 11px)' }}
              hoverStyle={{ borderColor: '$color8' }}
              onPress={() => {
                handleBoardClick(board._id);
              }}>
              <CardHeader flexDirection="row" alignItems="center" justifyContent="space-between">
                <H3 size="$6">{board.title}</H3>
                {owned ? (
                  // Plain DOM wrapper: React events from the menu/dialog portals
                  // bubble through the React tree, so stop them before the card.
                  <div
                    role="presentation"
                    style={{ display: 'contents' }}
                    onClick={stopCardPress}
                    onKeyDown={stopCardPress}>
                    <BoardActions
                      board={board}
                      onDelete={() => {
                        handleBoardDelete(board._id);
                      }}>
                      <Button
                        chromeless
                        size="$3"
                        icon={MoreHorizontal}
                        aria-label={board.title ? `${board.title} actions` : 'Board actions'}
                      />
                    </BoardActions>
                  </div>
                ) : null}
              </CardHeader>
              {renderBoardDetails(board, !owned)}
            </Card>
          ))}
        </XStack>
      )}
    </YStack>
  );

  return (
    <YStack height="calc(100vh - 8rem)">
      <YStack
        position="sticky"
        top={0}
        zIndex={10}
        backgroundColor="$background"
        padding="$4"
        gap="$2"
        alignItems="flex-start"
        justifyContent="space-between"
        $sm={{ flexDirection: 'row', alignItems: 'center' }}>
        <YStack width="100%" $sm={{ width: 200 }}>
          <NewBoardDialog>
            <Button accent width="100%" testID="new-board-trigger">
              {t('newBoard')}
            </Button>
          </NewBoardDialog>
        </YStack>
        <XStack width="100%" gap="$2" $sm={{ width: 'auto' }}>
          <YStack flex={1} $sm={{ width: 200, flex: 0 }}>
            <SearchInput
              placeholder={t('searchBoards')}
              aria-label={t('searchBoards')}
              value={search}
              onChange={setSearch}
              inputProps={{ testID: 'board-search-input' }}
            />
          </YStack>
          <YStack width={160} testID="select-filter-trigger">
            <Select
              aria-label={t('filterBoards')}
              placeholder={t('filterBoards')}
              value={filter}
              onValueChange={(value) => {
                setFilter(value as FilterType);
              }}
              options={[
                { value: 'all', label: t('allBoards') },
                { value: 'my', label: t('myBoards') },
                { value: 'team', label: t('teamBoards') },
              ]}
            />
          </YStack>
        </XStack>
      </YStack>

      <ScrollView flex={1}>
        <YStack gap="$6">
          {shouldShowMyBoards &&
            renderSection('myBoards', 'myBoardsDescription', 'noBoardsFound', filteredMyBoards, true)}
          {shouldShowTeamBoards &&
            renderSection('teamBoards', 'teamBoardsDescription', 'noTeamBoardsFound', filteredTeamBoards, false)}
        </YStack>
      </ScrollView>
    </YStack>
  );
}

function stopCardPress(e: React.SyntheticEvent) {
  e.stopPropagation();
}
