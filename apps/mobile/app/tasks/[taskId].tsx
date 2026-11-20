import { TaskStatus } from '@repo/store';
import { Text, View, useTheme } from '@tamagui/core';
import { NotificationFeedbackType, notificationAsync, selectionAsync } from 'expo-haptics';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  ScrollView,
} from 'react-native';

import { AssigneeModal } from '@/components/assignee-modal';
import { DueDateField } from '@/components/due-date-field';
import { useTask, useUpdateTask, useDeleteTask } from '@/hooks/use-tasks';
import { useUsers } from '@/hooks/use-users';

const SPACE_BETWEEN = 'space-between';

const STATUS_OPTIONS = [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.DONE] as const;

const STATUS_LABEL_KEYS = {
  [TaskStatus.TODO]: 'statusTodo',
  [TaskStatus.IN_PROGRESS]: 'statusInProgress',
  [TaskStatus.DONE]: 'statusDone',
} as const satisfies Record<TaskStatus, string>;

const renderHeaderRight = (label: string, isPending: boolean, onSave: () => void) => (
  <Pressable
    onPress={onSave}
    disabled={isPending}>
    <Text
      fontWeight="600"
      color={isPending ? '$mutedForeground' : '$primary'}>
      {label}
    </Text>
  </Pressable>
);

// oxlint-disable-next-line react-doctor/prefer-useReducer -- independent form fields, each bound to its own input
const TaskDetailScreen = () => {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();

  const { data: task, isLoading } = useTask(taskId);
  const updateTaskMutation = useUpdateTask();
  const deleteTaskMutation = useDeleteTask();
  const { data: users = [] } = useUsers();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState(TaskStatus.TODO);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<Date | null>(null);

  const [showAssigneeModal, setShowAssigneeModal] = useState(false);

  useEffect(() => {
    if (task != null) {
      // oxlint-disable-next-line react/set-state-in-effect -- seeds editable form state from fetched task
      setTitle(task.title);
      setDescription(task.description ?? '');
      setStatus(task.status);
      setAssigneeId(task.assignee?._id ?? null);
      setDueDate(task.dueDate == null ? null : new Date(task.dueDate));
    }
  }, [task]);

  const handleSave = () => {
    if (taskId === undefined || taskId === '') {
      return;
    }

    void notificationAsync(NotificationFeedbackType.Success);
    updateTaskMutation.mutate(
      {
        id: taskId,
        title,
        description,
        status,
        assigneeId,
        dueDate,
      },
      {
        onSuccess: () => {
          router.back();
        },
      },
    );
  };

  const handleDelete = () => {
    if (taskId === undefined || taskId === '') {
      return;
    }

    Alert.alert(
      t('kanban.task.confirmDeleteTitle', { title: task?.title }) || 'Delete Task',
      t('kanban.task.confirmDeleteDescription', { title: task?.title }) || 'Are you sure you want to delete this task?',
      [
        { text: t('common.cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('common.delete') || 'Delete',
          style: 'destructive',
          onPress: () => {
            void notificationAsync(NotificationFeedbackType.Success);
            deleteTaskMutation.mutate(taskId, {
              onSuccess: () => {
                router.back();
              },
            });
          },
        },
      ],
    );
  };

  if (isLoading) {
    return (
      <View
        flex={1}
        alignItems="center"
        justifyContent="center"
        backgroundColor="$background">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (task == null) {
    return (
      <View
        flex={1}
        alignItems="center"
        justifyContent="center"
        backgroundColor="$background">
        <Text color="$color">Task not found</Text>
      </View>
    );
  }

  const assigneeUserName = users.find((u) => u._id === assigneeId)?.name;
  const assigneeName = assigneeUserName !== undefined && assigneeUserName !== '' ? assigneeUserName : 'Unassigned';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: t('kanban.task.editTaskTitle') || 'Edit Task',
          headerBackButtonDisplayMode: 'minimal',
          headerRight: () => renderHeaderRight(t('common.save') || 'Save', updateTaskMutation.isPending, handleSave),
        }}
      />

      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background.val }}
        contentContainerStyle={{ padding: 16, gap: 24 }}>
        {/* Title */}
        <View gap={8}>
          <Text
            fontSize={14}
            fontWeight="500"
            color="$mutedForeground">
            {t('kanban.task.titleLabel') || 'Title'}
          </Text>
          <TextInput
            style={{
              borderRadius: 8,
              borderWidth: 1,
              borderColor: theme.borderColor.val,
              backgroundColor: theme.input.val,
              padding: 12,
              color: theme.color.val,
              fontSize: 16,
            }}
            value={title}
            onChangeText={setTitle}
            placeholder={t('kanban.task.titlePlaceholder') || 'Task title'}
            placeholderTextColor={theme.mutedForeground.val}
          />
        </View>

        {/* Status */}
        <View gap={8}>
          <Text
            fontSize={14}
            fontWeight="500"
            color="$mutedForeground">
            {t('kanban.task.statusLabel') || 'Status'}
          </Text>
          <View
            flexDirection="row"
            gap={8}>
            {STATUS_OPTIONS.map((s) => (
              <Pressable
                key={s}
                onPress={() => {
                  void selectionAsync();
                  setStatus(s);
                }}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  borderRadius: 8,
                  borderWidth: 1,
                  padding: 12,
                  borderColor: status === s ? theme.primary.val : theme.borderColor.val,
                  backgroundColor: status === s ? theme.primary.val : theme.card.val,
                }}>
                <Text
                  fontWeight="500"
                  color={status === s ? '$primaryForeground' : '$color'}>
                  {t(`kanban.task.${STATUS_LABEL_KEYS[s]}`) || s.replace('_', ' ')}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Assignee */}
        <View gap={8}>
          <Text
            fontSize={14}
            fontWeight="500"
            color="$mutedForeground">
            {t('kanban.task.assignToLabel') || 'Assignee'}
          </Text>
          <Pressable
            onPress={() => {
              setShowAssigneeModal(true);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: SPACE_BETWEEN,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: theme.borderColor.val,
              backgroundColor: theme.card.val,
              padding: 12,
            }}>
            <Text color="$color">{assigneeName}</Text>
            <Image
              source="sf:chevron.down"
              style={{ width: 12, height: 12 }}
              tintColor="gray"
            />
          </Pressable>
        </View>

        <DueDateField
          dueDate={dueDate}
          onChange={setDueDate}
        />

        {/* Description */}
        <View gap={8}>
          <Text
            fontSize={14}
            fontWeight="500"
            color="$mutedForeground">
            {t('kanban.task.descriptionLabel') || 'Description'}
          </Text>
          <TextInput
            style={{
              minHeight: 100,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: theme.borderColor.val,
              backgroundColor: theme.input.val,
              padding: 12,
              color: theme.color.val,
              fontSize: 16,
              textAlignVertical: 'top',
            }}
            value={description}
            onChangeText={setDescription}
            placeholder={t('kanban.task.descriptionPlaceholder') || 'Add description...'}
            placeholderTextColor={theme.mutedForeground.val}
            multiline
          />
        </View>

        {/* Delete Button */}
        <Pressable
          onPress={handleDelete}
          style={{
            marginTop: 16,
            alignItems: 'center',
            borderRadius: 8,
            backgroundColor: theme.destructiveAlpha10.val,
            padding: 16,
          }}>
          <Text
            fontWeight="600"
            color="$destructive">
            {t('kanban.task.delete') || 'Delete Task'}
          </Text>
        </Pressable>
      </ScrollView>

      <AssigneeModal
        visible={showAssigneeModal}
        users={users}
        assigneeId={assigneeId}
        onSelect={(id) => {
          setAssigneeId(id);
          setShowAssigneeModal(false);
        }}
        onClose={() => {
          setShowAssigneeModal(false);
        }}
      />
    </KeyboardAvoidingView>
  );
};

export default TaskDetailScreen;
