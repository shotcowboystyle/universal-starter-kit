import { Text, View, useTheme } from '@tamagui/core';
import { NotificationFeedbackType, notificationAsync } from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Pressable,
  TextInput,
  ScrollView,
} from 'react-native';

import { useCreateProject, useUpdateProject, useProjects } from '@/hooks/use-projects';
import { useAuthStore } from '@/stores/auth';

const renderHeaderLeft = (label: string, onCancel: () => void) => (
  <Pressable onPress={onCancel}>
    <Text
      fontWeight="500"
      color="$primary">
      {label}
    </Text>
  </Pressable>
);

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

const ProjectFormScreen = () => {
  const { boardId, projectId } = useLocalSearchParams<{ boardId: string; projectId?: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuthStore();

  const { data: projects = [], isLoading: isLoadingProjects } = useProjects(boardId);
  const createProjectMutation = useCreateProject();
  const updateProjectMutation = useUpdateProject();

  const isEditMode = projectId !== undefined && projectId !== '';
  const project = isEditMode ? projects.find((p) => p._id === projectId) : null;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (project != null) {
      // oxlint-disable-next-line react/set-state-in-effect -- seeds editable form state from fetched project
      setTitle(project.title);
      setDescription(project.description ?? '');
    }
  }, [project]);

  const handleSave = () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Title is required');
      return;
    }

    void notificationAsync(NotificationFeedbackType.Success);

    if (isEditMode && projectId) {
      updateProjectMutation.mutate(
        {
          id: projectId,
          title,
          description: description || null,
        },
        {
          onSuccess: () => {
            router.back();
          },
          onError: (error) => {
            Alert.alert(t('common.error') || 'Error', error.message);
          },
        },
      );
    } else {
      if (!boardId) {
        return;
      }
      createProjectMutation.mutate(
        {
          title,
          description: description || null,
          boardId,
          owner: session?.user._id,
        },
        {
          onSuccess: () => {
            router.back();
          },
          onError: (error) => {
            Alert.alert(t('common.error') || 'Error', error.message);
          },
        },
      );
    }
  };

  if (isEditMode && isLoadingProjects) {
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

  const isPending = createProjectMutation.isPending || updateProjectMutation.isPending;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: isEditMode
            ? t('kanban.project.editProjectTitle') || 'Edit Project'
            : t('kanban.project.addNewProjectTitle') || 'New Project',
          presentation: 'formSheet',
          headerLeft: () =>
            renderHeaderLeft(t('common.cancel') || 'Cancel', () => {
              router.back();
            }),
          headerRight: () =>
            renderHeaderRight(
              isEditMode ? t('common.save') || 'Save' : t('common.create') || 'Create',
              isPending,
              handleSave,
            ),
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
            {t('kanban.project.titleLabel') || 'Title'}
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
            placeholder={t('kanban.project.titlePlaceholder') || 'Project title'}
            placeholderTextColor={theme.mutedForeground.val}
          />
        </View>

        {/* Description */}
        <View gap={8}>
          <Text
            fontSize={14}
            fontWeight="500"
            color="$mutedForeground">
            {t('kanban.project.descriptionLabel') || 'Description'}
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
            placeholder={t('kanban.project.descriptionPlaceholder') || 'Add description...'}
            placeholderTextColor={theme.mutedForeground.val}
            multiline
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default ProjectFormScreen;
