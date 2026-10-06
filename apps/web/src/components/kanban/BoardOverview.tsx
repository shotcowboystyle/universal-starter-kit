'use client';

import { SearchInput, Select } from '@repo/forms';
import { Button, Card, CardHeader, H2, H3, Paragraph, ScrollView, Spinner, XStack, YStack } from '@repo/ui';
import { MoreHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useBoards } from '@/hooks/use-boards';
import { useHydrated } from '@/hooks/use-hydrated';
import { usePathname, useRouter } from '@/i18n/navigation';
import { AuthService } from '@/lib/auth/auth-service';
import { useAuthStore } from '@/stores/auth-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type { Board } from '@/types/db-interface';

import { BoardActions } from './board/BoardActions';
import NewBoardDialog from './board/NewBoardDialog';

type FilterType = 'all' | 'my' | 'team';

const isFilterType = (value: unknown): value is FilterType => value === 'all' || value === 'my' || value === 'team';

const stopCardPress = (e: React.SyntheticEvent) => {
  e.stopPropagation();
};

const BoardDetails = ({ board, showOwner }: { board: Board; showOwner: boolean }) => {
  const t = useTranslations('kanban');
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Board.owner is an API union of owner id or populated user
  const owner = typeof board.owner === 'string' ? board.owner : board.owner?.name || 'Unknown';
  return (
    <YStack gap="$1">
      <Paragraph
        size="$3"
        color="$color10"
        marginBottom="$1">
        {board.description === undefined || board.description === '' ? t('noDescription') : board.description}
      </Paragraph>
      {showOwner ? <Paragraph size="$3">{`${t('owner')}: ${owner}`}</Paragraph> : null}
      <Paragraph size="$3">
        {`${t('projects')}: ${board.projects.length > 0 ? board.projects.map((p) => p.title).join(' / ') : '0'}`}
      </Paragraph>
      <Paragraph size="$3">{`${t('members')}: ${board.members.map((m) => m.name).join(', ')}`}</Paragraph>
    </YStack>
  );
};

interface BoardSectionProps {
  titleKey: 'myBoards' | 'teamBoards';
  descriptionKey: 'myBoardsDescription' | 'teamBoardsDescription';
  emptyKey: 'noBoardsFound' | 'noTeamBoardsFound';
  boards: Board[] | undefined;
  owned: boolean;
  onBoardClick: (boardId: string) => void;
  onBoardDelete: (boardId: string) => void;
}

const BoardSection = ({
  titleKey,
  descriptionKey,
  emptyKey,
  boards,
  owned,
  onBoardClick,
  onBoardDelete,
}: BoardSectionProps) => {
  const t = useTranslations('kanban');
  return (
    <YStack
      render="section"
      gap="$2">
      <H2
        size="$8"
        paddingHorizontal="$4"
        testID={`${titleKey}Title`}>
        {t(titleKey)}
      </H2>
      <Paragraph
        size="$3"
        color="$color10"
        paddingHorizontal="$4">
        {t(descriptionKey)}
      </Paragraph>
      {boards?.length === 0 ? (
        <Paragraph
          color="$color10"
          paddingHorizontal="$4">
          {t(emptyKey)}
        </Paragraph>
      ) : (
        <XStack
          flexWrap="wrap"
          gap="$4"
          padding="$4">
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
                onBoardClick(board._id);
              }}>
              <CardHeader
                flexDirection="row"
                alignItems="center"
                justifyContent="space-between">
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
                        onBoardDelete(board._id);
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
              <BoardDetails
                board={board}
                showOwner={!owned}
              />
            </Card>
          ))}
        </XStack>
      )}
    </YStack>
  );
};

export const BoardOverview = () => {
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
  const recentlyDeleted = useRef(new Set<string>());
  // Ensure consistent SSR/client hydration
  const mounted = useHydrated();

  // Navigate to a board unless it was just deleted. Clicks inside the actions
  // menu never reach here (see stopCardPress below).
  const handleBoardClick = useCallback(
    (boardId: string) => {
      if (boardId !== '' && !recentlyDeleted.current.has(boardId)) {
        router.push(`/boards/${boardId}`);
      }
    },
    [router],
  );

  // Handle board deletion
  const handleBoardDelete = useCallback(
    (boardId: string) => {
      // Store the current path
      const currentPath = pathname;

      // Add to recently deleted set
      recentlyDeleted.current.add(boardId);

      // Immediately redirect to /boards if we're on a board page
      if (currentPath.includes(`/board/`)) {
        router.push('/boards');
        return;
      }

      // Refresh the board list
      void refresh();

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

      let failure: Error | undefined;
      try {
        setIsProcessingLogin(true);

        // Always fetch fresh session to ensure we have the latest data
        const session = await AuthService.getSession();

        const sessionUser = session?.user;
        if (session !== null && sessionUser?._id !== undefined && sessionUser._id !== '') {
          // Update both auth and workspace stores with the user info
          setSession(session);
          setUserInfo(sessionUser.email, sessionUser._id);

          // Manually trigger boards data refresh after user info is set
          await refresh();

          // Show success message
          toast.success(tLogin('success'));

          // Clean up URL
          const params = new URLSearchParams(searchParams.toString());
          params.delete('login_success');
          const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
          // oxlint-disable-next-line react-doctor/nextjs-no-client-side-redirect -- strips the one-shot login_success param from the URL after processing
          router.replace(newUrl, { scroll: false });
        } else {
          failure = new Error('Failed to get user session');
        }
      } catch (error) {
        failure = error instanceof Error ? error : new Error(String(error));
      }
      if (failure !== undefined) {
        console.error('Error processing login:', failure);
        toast.error(tLogin('error'));
      }
      setIsProcessingLogin(false);
    };

    void processLogin();
  }, [searchParams, router, pathname, tLogin, setSession, setUserInfo, refresh]);

  // Ensure boards data is fetched when user is authenticated
  useEffect(() => {
    // If user is authenticated but we don't have boards data, fetch it
    const isAuthenticated = userId !== null && userId !== '';
    const hasNoBoards = !myBoards?.length && !teamBoards?.length;
    if (isAuthenticated && !boardsLoading && hasNoBoards) {
      void refresh();
    }
  }, [userId, refresh, myBoards, teamBoards, boardsLoading]);

  // Handle data refresh on tab visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
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
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        gap="$4">
        <Spinner size="large" />
        <Paragraph>{t('loading')}</Paragraph>
      </YStack>
    );
  }

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
        <YStack
          width="100%"
          $sm={{ width: 200 }}>
          <NewBoardDialog>
            <Button
              accent
              width="100%"
              testID="new-board-trigger">
              {t('newBoard')}
            </Button>
          </NewBoardDialog>
        </YStack>
        <XStack
          width="100%"
          gap="$2"
          $sm={{ width: 'auto' }}>
          <YStack
            flex={1}
            $sm={{ width: 200, flex: 0 }}>
            <SearchInput
              placeholder={t('searchBoards')}
              aria-label={t('searchBoards')}
              value={search}
              onChange={setSearch}
              inputProps={{ testID: 'board-search-input' }}
            />
          </YStack>
          <YStack
            width={160}
            testID="select-filter-trigger">
            <Select
              aria-label={t('filterBoards')}
              placeholder={t('filterBoards')}
              value={filter}
              onChange={(value) => {
                if (isFilterType(value)) {
                  setFilter(value);
                }
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
          {shouldShowMyBoards && (
            <BoardSection
              titleKey="myBoards"
              descriptionKey="myBoardsDescription"
              emptyKey="noBoardsFound"
              boards={filteredMyBoards}
              owned
              onBoardClick={handleBoardClick}
              onBoardDelete={handleBoardDelete}
            />
          )}
          {shouldShowTeamBoards && (
            <BoardSection
              titleKey="teamBoards"
              descriptionKey="teamBoardsDescription"
              emptyKey="noTeamBoardsFound"
              boards={filteredTeamBoards}
              owned={false}
              onBoardClick={handleBoardClick}
              onBoardDelete={handleBoardDelete}
            />
          )}
        </YStack>
      </ScrollView>
    </YStack>
  );
};
