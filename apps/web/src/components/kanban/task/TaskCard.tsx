'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardHeader, Chip, H3, Paragraph, Text, XStack, YStack } from '@repo/ui';
import type { ChipColor } from '@repo/ui';
import { format } from 'date-fns';
import { Calendar1Icon, FileTextIcon, PointerIcon, UserIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { Task, TaskStatus } from '@/types/dbInterface';

import { TaskActions } from './TaskAction';

interface TaskCardProps {
  task: Task;
  isOverlay?: boolean;
  onUpdate?: () => void;
  isDragEnabled?: boolean;
}

export type TaskType = 'Task';

export interface TaskDragData {
  type: TaskType;
  task: Task;
}

const STATUS_COLOR: Record<TaskStatus, ChipColor> = {
  TODO: 'gray',
  IN_PROGRESS: 'blue',
  DONE: 'green',
};

function getLastField(task: Task): string {
  const visibleFields = [];
  if (task.creator) {
    visibleFields.push('creator');
  }
  if (task.lastModifier) {
    visibleFields.push('lastModifier');
  }
  if (task.assignee) {
    visibleFields.push('assignee');
  }
  if (task.dueDate) {
    visibleFields.push('dueDate');
  }
  if (task.description) {
    visibleFields.push('description');
  }

  return visibleFields[visibleFields.length - 1] || '';
}

function InfoRow({ divider, children }: { divider: boolean; children: ReactNode }) {
  return (
    <XStack
      alignItems="flex-start"
      gap="$2"
      paddingHorizontal="$3"
      paddingVertical="$2"
      borderBottomWidth={divider ? 1 : 0}
      borderColor="$borderColor">
      {children}
    </XStack>
  );
}

export function TaskCard({ task, isOverlay = false, onUpdate, isDragEnabled = false }: TaskCardProps) {
  const t = useTranslations('kanban.task');

  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: task?._id,
    data: {
      type: 'Task',
      task,
    } satisfies TaskDragData,
    disabled: isOverlay || !isDragEnabled, // Disable drag if not enabled or in overlay
    attributes: {
      roleDescription: 'Task',
      // @ts-ignore - Adding custom data attributes for debugging
      'data-task-id': task?._id,
      // @ts-ignore - Adding custom data attributes for debugging
      'data-draggable': String(isDragEnabled && !isOverlay),
    },
  });

  // Return null if task is undefined or marked as deleted
  if (!task || task._deleted) {
    return null;
  }

  const statusLabel: Record<TaskStatus, string> = {
    TODO: t('statusTodo'),
    IN_PROGRESS: t('statusInProgress'),
    DONE: t('statusDone'),
  };
  const lastField = getLastField(task);
  const iconProps = { size: 16, 'aria-hidden': true, style: { flexShrink: 0, marginTop: 2 } };

  return (
    // dnd-kit needs a DOM node for ref/attributes, so it lives on a plain wrapper.
    <div
      ref={setNodeRef}
      style={{ transition, transform: CSS.Translate.toString(transform), marginBottom: 12 }}
      data-testid="task-card"
      {...(isDragEnabled ? attributes : {})}>
      <Card
        tier="elevated"
        padding={0}
        gap={0}
        opacity={isDragging ? 0.3 : 1}
        borderWidth={isOverlay || isDragging ? 2 : undefined}
        borderColor={isOverlay ? '$blue10' : undefined}
        hoverStyle={{ elevation: 4 }}>
        <CardHeader
          flexDirection="row"
          alignItems="flex-start"
          paddingHorizontal="$3"
          paddingVertical="$2"
          borderBottomWidth={2}
          borderColor="$borderColor">
          {isDragEnabled ? (
            <div
              {...attributes}
              {...listeners}
              aria-label={`drag task: ${task.title}`}
              style={{
                display: 'flex',
                width: 64,
                height: 32,
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'grab',
                opacity: 0.5,
              }}>
              <PointerIcon size={16} aria-hidden />
            </div>
          ) : (
            <YStack width={64} height={32} />
          )}
          <YStack flex={1} marginHorizontal="$2" alignItems="flex-start" gap="$2">
            {task.title ? (
              <H3 size="$5" fontWeight="500">
                {task.title}
              </H3>
            ) : null}
            <Chip variant="solid" size="$2" color={task.status ? STATUS_COLOR[task.status] : 'gray'}>
              {task.status ? statusLabel[task.status] : t('noStatus')}
            </Chip>
          </YStack>
          <TaskActions
            id={task._id}
            title={task.title}
            description={task.description || undefined}
            dueDate={task.dueDate || undefined}
            assigneeId={task.assignee?._id}
            status={task.status}
            projectId={task.project}
            boardId={task.board}
            onUpdate={onUpdate}
          />
        </CardHeader>
        {task.creator && (
          <InfoRow divider={lastField !== 'creator'}>
            <UserIcon {...iconProps} />
            <Text fontSize="$3" color="$color10">
              {t('createdBy', { name: task.creator.name })}
            </Text>
          </InfoRow>
        )}
        {task.lastModifier && (
          <InfoRow divider={lastField !== 'lastModifier'}>
            <UserIcon {...iconProps} />
            <Text fontSize="$3" color="$color10">
              {t('lastModifiedBy', { name: task.lastModifier.name })}
            </Text>
          </InfoRow>
        )}
        {task.assignee && (
          <InfoRow divider={lastField !== 'assignee'}>
            <UserIcon {...iconProps} />
            <Text fontSize="$3" color="$color10">
              {t('assignee', { name: task.assignee.name })}
            </Text>
          </InfoRow>
        )}
        {task.dueDate ? (
          <InfoRow divider={lastField !== 'dueDate'}>
            <Calendar1Icon {...iconProps} />
            <Text fontSize="$3" color="$color10">
              {t('dueDate')}: {format(new Date(task.dueDate), 'yyyy/MM/dd')}
            </Text>
          </InfoRow>
        ) : null}
        {task.description ? (
          <InfoRow divider={false}>
            <FileTextIcon {...iconProps} />
            <Paragraph fontSize="$3" color="$color10" testID="task-card-description">
              {task.description}
            </Paragraph>
          </InfoRow>
        ) : null}
      </Card>
    </div>
  );
}

export default TaskCard;
