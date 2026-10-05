'use client';

import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Card, CardHeader, Chip, H3, ScrollView, XStack, YStack, useMedia } from '@repo/ui';
import { PointerIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import { useHydrated } from '@/hooks/useHydrated';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { Project, UserInfo, type Task } from '@/types/dbInterface';

import NewTaskDialog from '../task/NewTaskDialog';
import { TaskCard } from '../task/TaskCard';

import { ProjectActions as ProjectActionsComponent } from './ProjectAction';

export interface ProjectDragData {
  type: 'Project';
  project: Project;
}

interface BoardProjectProps {
  project: Project;
  tasks: Task[];
  isOverlay?: boolean;
  isBoardOwner: boolean;
  isBoardMember: boolean;
  currentUserId: string;
}

// Memoize the component to prevent unnecessary re-renders
export const BoardProject = memo(BoardProjectComponent, (prevProps, nextProps) => {
  // Only re-render if these props change
  // Efficient comparison: check task IDs array instead of JSON.stringify
  const prevTaskIds = prevProps.tasks.map((t) => t._id);
  const nextTaskIds = nextProps.tasks.map((t) => t._id);
  const tasksMatch = prevTaskIds.length === nextTaskIds.length && prevTaskIds.every((id, i) => id === nextTaskIds[i]);

  return (
    prevProps.project._id === nextProps.project._id &&
    prevProps.project.title === nextProps.project.title &&
    prevProps.project.description === nextProps.project.description &&
    tasksMatch &&
    prevProps.isOverlay === nextProps.isOverlay
  );
});

// Set display name for better dev tools
BoardProject.displayName = 'BoardProject';

function getUserDisplayName(user: string | UserInfo | null | undefined): string {
  if (!user) {
    return 'Unassigned';
  }
  if (typeof user === 'string') {
    return user;
  }
  return user.name || user.email || 'Unknown User';
}

function BoardProjectComponent({
  project,
  tasks: initialTasks,
  isOverlay = false,
  isBoardOwner,
  isBoardMember,
  currentUserId,
}: BoardProjectProps) {
  const { filter, fetchTasksByProject } = useWorkspaceStore();
  const t = useTranslations('kanban.project');
  const [tasks, setTasks] = useState(initialTasks);

  // Update local state when initialTasks changes
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  const loadTasks = useCallback(async () => {
    if (!project._id) {
      return;
    }

    try {
      const fetchedTasks = await fetchTasksByProject(project._id);
      setTasks(fetchedTasks);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
  }, [project._id, fetchTasksByProject]);

  // Handle task updates from child components
  const handleTaskUpdate = useCallback(async () => {
    try {
      const fetchedTasks = await fetchTasksByProject(project._id);
      setTasks(fetchedTasks);
    } catch (error) {
      console.error('Error updating tasks:', error);
    }
  }, [project._id, fetchTasksByProject]);

  // Fetch tasks when the project changes
  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const filteredTasks = useMemo(() => {
    if (!filter.status || !tasks?.length) {
      return tasks || [];
    }
    return tasks.filter((task) => task.status === filter.status);
  }, [tasks, filter.status]);

  // Setup drag & drop functionality
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: project._id,
    data: {
      type: 'Project',
      project,
    } satisfies ProjectDragData,
    disabled: !isBoardMember, // Disable drag if not board member
    attributes: {
      roleDescription: `Project: ${project.title}`,
    },
  });

  // Button already renders role="button"; dnd-kit's string role clashes with Tamagui's Role type.
  const { role: _role, ...dragAttributes } = attributes;

  const tasksIds = useMemo(() => tasks?.map((task) => task._id) || [], [tasks]);

  const ownerId = typeof project.owner === 'string' ? project.owner : project.owner._id;
  const members =
    Array.isArray(project.members) && project.members.length > 0
      ? project.members.map(getUserDisplayName).filter(Boolean).join(', ')
      : '';

  // dnd-kit needs a real DOM node + inline transform, so the sortable ref and
  // style live on a plain div wrapper around the Tamagui card.
  return (
    <div
      ref={setNodeRef}
      style={{ transition, transform: CSS.Translate.toString(transform), flexShrink: 0 }}
      data-testid="project-container"
      data-board-owner={isBoardOwner}
      data-project-id={project._id}
      data-draggable={isBoardOwner ? 'true' : 'false'}>
      <Card
        height="75vh"
        maxHeight="75vh"
        width="100%"
        $md={{ width: 380 }}
        overflow="hidden"
        padding={0}
        gap={0}
        borderWidth={2}
        borderColor={isOverlay || isDragging ? '$color8' : 'transparent'}
        opacity={isDragging && !isOverlay ? 0.3 : 1}>
        <CardHeader
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          padding="$3"
          borderBottomWidth={2}
          borderColor="$borderColor">
          <XStack alignItems="center" gap="$2" flex={1} minWidth={0}>
            <Button
              chromeless
              size="$3"
              icon={PointerIcon}
              cursor="grab"
              aria-label={`drag project: ${project.title}`}
              testID="project-drag-handle"
              {...dragAttributes}
              {...listeners}
            />
            <H3 size="$6" numberOfLines={1}>
              {project.title}
            </H3>
          </XStack>
          <ProjectActionsComponent
            id={project._id}
            title={project.title}
            description={project.description ?? undefined}
            ownerId={ownerId}
          />
        </CardHeader>

        <ScrollView flex={1}>
          <YStack gap="$2" padding="$2">
            <YStack gap="$1" alignItems="flex-start">
              <Chip variant="outline" size="$2" maxWidth="100%">
                {`${t('description')}: ${project.description || t('noDescription')}`}
              </Chip>
              <Chip variant="outline" size="$2" maxWidth="100%">
                {`${t('owner')}: ${getUserDisplayName(project.owner)}`}
              </Chip>
              {members ? (
                <Chip variant="outline" size="$2" maxWidth="100%">
                  {`${t('members')}: ${members}`}
                </Chip>
              ) : null}
            </YStack>
            <NewTaskDialog projectId={project._id} />
            <SortableContext items={tasksIds}>
              <YStack gap="$2" paddingBottom="$2">
                {filteredTasks
                  .filter((task) => !task._deleted) // Ensure we don't render deleted tasks
                  .map((task) => {
                    const isTaskCreator = task.creator?._id === currentUserId;
                    const isTaskAssignee = task.assignee?._id === currentUserId;
                    const canDrag = isBoardOwner || isTaskCreator || isTaskAssignee;
                    return <TaskCard key={task._id} task={task} onUpdate={handleTaskUpdate} isDragEnabled={canDrag} />;
                  })}
              </YStack>
            </SortableContext>
          </YStack>
        </ScrollView>
      </Card>
    </div>
  );
}

export function BoardContainer({ children }: { children: React.ReactNode }) {
  const media = useMedia();
  // `horizontal` is a render-time prop, so follow the media query only after
  // hydration; the server always renders the narrow (vertical) layout.
  const hydrated = useHydrated();
  return (
    <ScrollView horizontal={hydrated && media.md} width="100%" testID="board-container">
      <YStack gap="$4" $md={{ flexDirection: 'row' }} paddingBottom="$2">
        {children}
      </YStack>
    </ScrollView>
  );
}
