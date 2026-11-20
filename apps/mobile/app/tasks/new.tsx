import { TaskStatus } from '@repo/store';
import { Text, View, useTheme } from '@tamagui/core';
import { NotificationFeedbackType, notificationAsync, selectionAsync } from 'expo-haptics';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Alert, Pressable, TextInput, ScrollView } from 'react-native';

import { AssigneeModal } from '@/components/assignee-modal';
import { DueDateField } from '@/components/due-date-field';
import { useCreateTask } from '@/hooks/use-tasks';
import { useUsers } from '@/hooks/use-users';

const SPACE_BETWEEN = 'space-between';

const STATUS_OPTIONS = [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.DONE] as const;

const STATUS_LABEL_KEYS = {
  [TaskStatus.TODO]: 'statusTodo',
  [TaskStatus.IN_PROGRESS]: 'statusInProgress',
  [TaskStatus.DONE]: 'statusDone',
} as const satisfies Record<TaskStatus, string>;

const renderHeaderLeft = (label: string, onCancel: () => void) => (
  <Pressable onPress={onCancel}>
    <Text
      fontWeight="500"
      color="$primary">
      {label}
    </Text>
  </Pressable>
);

const renderHeaderRight = (label: string, isPending: boolean, onCreate: () => void) => (
  <Pressable
    onPress={onCreate}
    disabled={isPending}>
    <Text
      fontWeight="600"
      color={isPending ? '$mutedForeground' : '$primary'}>
      {label}
    </Text>
  </Pressable>
);

const NewTaskScreen = () => {
  const { projectId, boardId } = useLocalSearchParams<{ projectId: string; boardId: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();

  const createTaskMutation = useCreateTask();
  const { data: users = [] } = useUsers();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState(TaskStatus.TODO);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<Date | null>(null);

  const [showAssigneeModal, setShowAssigneeModal] = useState(false);

  const handleCreate = () => {
    if (!title) {
      Alert.alert('Error', 'Title is required');
      return;
    }

    void notificationAsync(NotificationFeedbackType.Success);
    createTaskMutation.mutate(
      {
        title,
        description,
        status,
        assignee: assigneeId ?? undefined,
        dueDate: dueDate ?? undefined,
        project: projectId,
        board: boardId,
      },
      {
        onSuccess: () => {
          router.back();
        },
      },
    );
  };

  const assigneeUserName = users.find((u) => u._id === assigneeId)?.name;
  const assigneeName = assigneeUserName !== undefined && assigneeUserName !== '' ? assigneeUserName : 'Unassigned';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: t('kanban.task.addNewTaskTitle') || 'New Task',
          presentation: 'formSheet',
          headerLeft: () =>
            renderHeaderLeft(t('common.cancel') || 'Cancel', () => {
              router.back();
            }),
          headerRight: () =>
            renderHeaderRight(t('common.create') || 'Create', createTaskMutation.isPending, handleCreate),
        }}
      />

      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background.val }}
        contentContainerStyle={{ padding: 16, gap: 24 }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled">
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

export default NewTaskScreen;
