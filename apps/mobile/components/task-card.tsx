import type { Task } from '@repo/store';
import { TaskStatus } from '@repo/store';
import { Text, View, useTheme } from '@tamagui/core';
import { format } from 'date-fns';
import { ImpactFeedbackStyle, NotificationFeedbackType, impactAsync, notificationAsync } from 'expo-haptics';
import { Link, router } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useUpdateTask, useDeleteTask } from '@/hooks/use-tasks';

interface TaskCardProps {
  task: Task;
  onMoveToProject?: () => void;
}

const SWIPE_THRESHOLD = 60;

const STATUS_ORDER: TaskStatus[] = [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.DONE];

const STATUS_BADGES = {
  [TaskStatus.TODO]: { bgColor: '$gray500', labelKey: 'kanban.task.statusTodo', fallback: 'Todo' },
  [TaskStatus.IN_PROGRESS]: { bgColor: '$blue500', labelKey: 'kanban.task.statusInProgress', fallback: 'In Progress' },
  [TaskStatus.DONE]: { bgColor: '$green500', labelKey: 'kanban.task.statusDone', fallback: 'Done' },
} as const satisfies Record<TaskStatus, { bgColor: string; labelKey: string; fallback: string }>;

const getCardStyle = (backgroundColor: string) =>
  ({
    borderRadius: 12,
    backgroundColor,
    padding: 16,
    marginBottom: 12,
    gap: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
  }) as const;

const StatusBadge = ({ status }: { status: TaskStatus }) => {
  const { t } = useTranslation();
  const { bgColor, labelKey, fallback } = STATUS_BADGES[status];
  const label = t(labelKey) || fallback;

  return (
    <View
      backgroundColor={bgColor}
      borderRadius={9999}
      paddingHorizontal={8}
      paddingVertical={2}>
      <Text
        fontSize={12}
        fontWeight="500"
        color="$white">
        {label}
      </Text>
    </View>
  );
};

export const TaskCard = ({ task, onMoveToProject }: TaskCardProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const updateTaskMutation = useUpdateTask();
  const deleteTaskMutation = useDeleteTask();
  const translateX = useSharedValue(0);
  const context = useSharedValue(0);

  const cycleStatus = useCallback(() => {
    const currentIndex = STATUS_ORDER.indexOf(task.status || TaskStatus.TODO);
    const nextIndex = (currentIndex + 1) % STATUS_ORDER.length;
    const nextStatus = STATUS_ORDER[nextIndex];

    void impactAsync(ImpactFeedbackStyle.Medium);
    updateTaskMutation.mutate({ id: task._id, status: nextStatus });
  }, [task._id, task.status, updateTaskMutation]);

  const handleMoveTo = useCallback(() => {
    void impactAsync(ImpactFeedbackStyle.Medium);
    onMoveToProject?.();
  }, [onMoveToProject]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      t('kanban.task.confirmDeleteTitle', { title: task.title }) || 'Delete Task',
      t('kanban.task.confirmDeleteDescription', { title: task.title }) || 'Are you sure you want to delete this task?',
      [
        { text: t('common.cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('common.delete') || 'Delete',
          style: 'destructive',
          onPress: () => {
            void notificationAsync(NotificationFeedbackType.Success);
            deleteTaskMutation.mutate(task._id);
          },
        },
      ],
    );
  }, [t, task.title, task._id, deleteTaskMutation]);

  // oxlint-disable-next-line react/capitalized-calls -- Gesture.Pan() is the RNGH builder, not a component
  const pan = Gesture.Pan()
    .onBegin(() => {
      context.set(translateX.get());
    })
    .onUpdate((event) => {
      translateX.set(event.translationX + context.get());
    })
    .onEnd(() => {
      if (translateX.get() > SWIPE_THRESHOLD) {
        scheduleOnRN(cycleStatus);
      } else if (translateX.get() < -SWIPE_THRESHOLD) {
        scheduleOnRN(handleMoveTo);
      }
      translateX.set(withSpring(0));
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.get() }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={animatedStyle}>
        <Link
          href={`/tasks/${task._id}`}
          asChild>
          <Link.Trigger>
            <Pressable style={getCardStyle(theme.card.val)}>
              <View
                flexDirection="row"
                alignItems="flex-start"
                justifyContent="space-between">
                <Text
                  flex={1}
                  marginRight={8}
                  fontSize={16}
                  fontWeight="500"
                  color="$color"
                  numberOfLines={2}>
                  {task.title}
                </Text>
                <StatusBadge status={task.status || 'TODO'} />
              </View>

              <View
                flexDirection="row"
                alignItems="center"
                justifyContent="space-between">
                <View
                  flexDirection="row"
                  alignItems="center"
                  gap={4}>
                  {task.assignee && (
                    <Text
                      fontSize={12}
                      color="$mutedForeground">
                      {task.assignee.name || task.assignee.email}
                    </Text>
                  )}
                </View>
                {task.dueDate && (
                  <Text
                    fontSize={12}
                    color="$mutedForeground">
                    {format(new Date(task.dueDate), 'MMM d')}
                  </Text>
                )}
              </View>
            </Pressable>
          </Link.Trigger>
          <Link.Menu>
            <Link.MenuAction
              icon="pencil"
              onPress={() => {
                router.push(`/tasks/${task._id}`);
              }}>
              {t('common.edit') || 'Edit'}
            </Link.MenuAction>
            <Link.MenuAction
              icon="arrow.right.square"
              onPress={handleMoveTo}>
              {t('kanban.task.moveTask') || 'Move task'}
            </Link.MenuAction>
            <Link.MenuAction
              icon="trash"
              destructive
              onPress={handleDelete}>
              {t('common.delete') || 'Delete'}
            </Link.MenuAction>
          </Link.Menu>
        </Link>
      </Animated.View>
    </GestureDetector>
  );
};
