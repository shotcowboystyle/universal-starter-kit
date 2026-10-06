'use client';

import { Paragraph, YStack } from '@repo/ui';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { memo, Suspense, useEffect } from 'react';

import { Board } from '@/components/kanban/board/Board';
import PageContainer from '@/components/layout/PageContainer';
import { useWorkspaceStore } from '@/stores/workspace-store';

const MemoizedBoard = memo(Board);

export default function BoardPage() {
  const params = useParams();
  const t = useTranslations('kanban');
  const boardId = params?.boardId as string;
  const setCurrentBoardId = useWorkspaceStore((state) => state.setCurrentBoardId);
  const fetchProjects = useWorkspaceStore((state) => state.fetchProjects);

  useEffect(() => {
    if (!boardId) {
      return;
    }
    setCurrentBoardId(boardId);
    fetchProjects(boardId);
  }, [boardId, setCurrentBoardId, fetchProjects]);

  return (
    <PageContainer>
      <YStack render="main" gap="$4">
        <Suspense fallback={<Paragraph>{t('loadingBoard')}</Paragraph>}>
          <MemoizedBoard />
        </Suspense>
      </YStack>
    </PageContainer>
  );
}
