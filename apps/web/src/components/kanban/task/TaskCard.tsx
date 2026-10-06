'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardHeader, Chip, H3, Paragraph, Text, XStack, YStack } from '@repo/ui';
import type { ChipColor } from '@repo/ui';
import { format } from 'date-fns';
import { Calendar1Icon, FileTextIcon, PointerIcon, UserIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import type { Task, TaskStatus } from '@/types/db-interface';

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

const TASK_NAMESPACE = 'kanban.task';

const STATUS_COLOR: Record<TaskStatus, ChipColor> = {
  TODO: 'gray',
  IN_PROGRESS: 'blue',
  DONE: 'green',
};

const getLastField = (task: Task): string => {
  const visibleFields = [];
  if (task.creator != null) {
    visibleFields.push('creator');
  }
  if (task.lastModifier != null) {
    visibleFields.push('lastModifier');
  }
  if (task.assignee != null) {
    visibleFields.push('assignee');
  }
  if (task.dueDate) {
    visibleFields.push('dueDate');
  }
  if (task.description != null && task.description !== '') {
    visibleFields.push('description');
  }

  return visibleFields.at(-1) ?? '';
};

const InfoRow = ({ divider, children }: { divider: boolean; children: ReactNode }) => (
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

const ICON_PROPS = { size: 16, 'aria-hidden': true, style: { flexShrink: 0, marginTop: 2 } };

const TaskStatusChip = ({ status }: { status: Task['status'] }) => {
  const t = useTranslations(TASK_NAMESPACE);
  const statusLabel: Record<TaskStatus, string> = {
    TODO: t('statusTodo'),
    IN_PROGRESS: t('statusInProgress'),
    DONE: t('statusDone'),
  };
  return (
    <Chip
      variant="solid"
      size="$2"
      color={status ? STATUS_COLOR[status] : 'gray'}>
      {status ? statusLabel[status] : t('noStatus')}
    </Chip>
  );
};

const TaskInfoRows = ({ task, lastField }: { task: Task; lastField: string }) => {
  const t = useTranslations(TASK_NAMESPACE);
  return (
    <>
      {task.creator != null && (
        <InfoRow divider={lastField !== 'creator'}>
          <UserIcon {...ICON_PROPS} />
          <Text
            fontSize="$3"
            color="$color10">
            {t('createdBy', { name: task.creator.name })}
          </Text>
        </InfoRow>
      )}
      {task.lastModifier != null && (
        <InfoRow divider={lastField !== 'lastModifier'}>
          <UserIcon {...ICON_PROPS} />
          <Text
            fontSize="$3"
            color="$color10">
            {t('lastModifiedBy', { name: task.lastModifier.name })}
          </Text>
        </InfoRow>
      )}
      {task.assignee != null && (
        <InfoRow divider={lastField !== 'assignee'}>
          <UserIcon {...ICON_PROPS} />
          <Text
            fontSize="$3"
            color="$color10">
            {t('assignee', { name: task.assignee.name })}
          </Text>
        </InfoRow>
      )}
      {task.dueDate ? (
        <InfoRow divider={lastField !== 'dueDate'}>
          <Calendar1Icon {...ICON_PROPS} />
          <Text
            fontSize="$3"
            color="$color10">
            {t('dueDate')}: {format(new Date(task.dueDate), 'yyyy/MM/dd')}
          </Text>
        </InfoRow>
      ) : null}
      {task.description != null && task.description !== '' ? (
        <InfoRow divider={false}>
          <FileTextIcon {...ICON_PROPS} />
          <Paragraph
            fontSize="$3"
            color="$color10"
            testID="task-card-description">
            {task.description}
          </Paragraph>
        </InfoRow>
      ) : null}
    </>
  );
};

export const TaskCard = ({ task, isOverlay = false, onUpdate, isDragEnabled = false }: TaskCardProps) => {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: task?._id,
    data: {
      type: 'Task',
      task,
    } satisfies TaskDragData,
    // Disable drag if not enabled or in overlay
    disabled: isOverlay || !isDragEnabled,
    attributes: {
      roleDescription: 'Task',
      // @ts-expect-error - Adding custom data attributes for debugging
      'data-task-id': task?._id,
      'data-draggable': String(isDragEnabled && !isOverlay),
    },
  });

  // Return null if task is undefined or marked as deleted
  if (task == null || task._deleted) {
    return null;
  }

  const lastField = getLastField(task);

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
              <PointerIcon
                size={16}
                aria-hidden
              />
            </div>
          ) : (
            <YStack
              width={64}
              height={32}
            />
          )}
          <YStack
            flex={1}
            marginHorizontal="$2"
            alignItems="flex-start"
            gap="$2">
            {task.title ? (
              <H3
                size="$5"
                fontWeight="500">
                {task.title}
              </H3>
            ) : null}
            <TaskStatusChip status={task.status} />
          </YStack>
          <TaskActions
            id={task._id}
            title={task.title}
            description={task.description ?? undefined}
            dueDate={task.dueDate ?? undefined}
            assigneeId={task.assignee?._id}
            status={task.status}
            projectId={task.project}
            boardId={task.board}
            onUpdate={onUpdate}
          />
        </CardHeader>
        <TaskInfoRows
          task={task}
          lastField={lastField}
        />
      </Card>
    </div>
  );
};

export default TaskCard;
