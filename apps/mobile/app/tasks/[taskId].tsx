import DateTimePicker from "@react-native-community/datetimepicker";
import { TaskStatus } from "@repo/store";
import { Text, View, useTheme } from "@tamagui/core";
import { format } from "date-fns";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  Pressable,
  TextInput,
  ScrollView
} from "react-native";

import { useTask, useUpdateTask, useDeleteTask } from "@/hooks/use-tasks";
import { useUsers } from "@/hooks/use-users";

export default function TaskDetailScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();

  const { data: task, isLoading } = useTask(taskId);
  const updateTaskMutation = useUpdateTask();
  const deleteTaskMutation = useDeleteTask();
  const { data: users = [] } = useUsers();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState(TaskStatus.TODO);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<Date | null>(null);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAssigneeModal, setShowAssigneeModal] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || "");
      setStatus(task.status || "TODO");
      setAssigneeId(
        task.assignee
          ? typeof task.assignee === "string"
            ? task.assignee
            : task.assignee._id
          : null
      );
      setDueDate(task.dueDate ? new Date(task.dueDate) : null);
    }
  }, [task]);

  const handleSave = () => {
    if (!taskId) {
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updateTaskMutation.mutate(
      {
        id: taskId,
        title,
        description,
        status,
        assigneeId,
        dueDate
      },
      {
        onSuccess: () => {
          router.back();
        }
      }
    );
  };

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  const handleDelete = () => {
    if (!taskId) {
      return;
    }

    Alert.alert(
      t("kanban.task.confirmDeleteTitle", { title: task?.title }) || "Delete Task",
      t("kanban.task.confirmDeleteDescription", { title: task?.title }) ||
        "Are you sure you want to delete this task?",
      [
        { text: t("common.cancel") || "Cancel", style: "cancel" },
        {
          text: t("common.delete") || "Delete",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            deleteTaskMutation.mutate(taskId, {
              onSuccess: () => {
                router.back();
              }
            });
          }
        }
      ]
    );
  };

  if (isLoading) {
    return (
      <View flex={1} alignItems="center" justifyContent="center" backgroundColor="$background">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!task) {
    return (
      <View flex={1} alignItems="center" justifyContent="center" backgroundColor="$background">
        <Text color="$color">Task not found</Text>
      </View>
    );
  }

  const assigneeName = users.find((u) => u._id === assigneeId)?.name || "Unassigned";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <Stack.Screen
        options={{
          title: t("kanban.task.editTaskTitle") || "Edit Task",
          headerBackButtonDisplayMode: "minimal",
          headerLeft: undefined,
          headerRight: () => (
            <Pressable
              onPress={() => {
                handleSaveRef.current();
              }}
              disabled={updateTaskMutation.isPending}
            >
              <Text
                fontWeight="600"
                color={updateTaskMutation.isPending ? "$mutedForeground" : "$primary"}
              >
                {t("common.save") || "Save"}
              </Text>
            </Pressable>
          )
        }}
      />

      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background.val }}
        contentContainerStyle={{ padding: 16, gap: 24 }}
      >
        {/* Title */}
        <View gap={8}>
          <Text fontSize={14} fontWeight="500" color="$mutedForeground">
            {t("kanban.task.titleLabel") || "Title"}
          </Text>
          <TextInput
            style={{
              borderRadius: 8,
              borderWidth: 1,
              borderColor: theme.borderColor.val,
              backgroundColor: theme.input.val,
              padding: 12,
              color: theme.color.val,
              fontSize: 16
            }}
            value={title}
            onChangeText={setTitle}
            placeholder={t("kanban.task.titlePlaceholder") || "Task title"}
            placeholderTextColor={theme.mutedForeground.val}
          />
        </View>

        {/* Status */}
        <View gap={8}>
          <Text fontSize={14} fontWeight="500" color="$mutedForeground">
            {t("kanban.task.statusLabel") || "Status"}
          </Text>
          <View flexDirection="row" gap={8}>
            {["TODO", "IN_PROGRESS", "DONE"].map((s) => (
              <Pressable
                key={s}
                onPress={() => {
                  Haptics.selectionAsync();
                  setStatus(s as TaskStatus);
                }}
                style={{
                  flex: 1,
                  alignItems: "center",
                  borderRadius: 8,
                  borderWidth: 1,
                  padding: 12,
                  borderColor: status === s ? theme.primary.val : theme.borderColor.val,
                  backgroundColor: status === s ? theme.primary.val : theme.card.val
                }}
              >
                <Text
                  fontWeight="500"
                  color={status === s ? "$primaryForeground" : "$color"}
                >
                  {t(
                    `kanban.task.${({ TODO: "statusTodo", IN_PROGRESS: "statusInProgress", DONE: "statusDone" } as Record<string, string>)[s]}`
                  ) || s.replace("_", " ")}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Assignee */}
        <View gap={8}>
          <Text fontSize={14} fontWeight="500" color="$mutedForeground">
            {t("kanban.task.assignToLabel") || "Assignee"}
          </Text>
          <Pressable
            onPress={() => {
              setShowAssigneeModal(true);
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderRadius: 8,
              borderWidth: 1,
              borderColor: theme.borderColor.val,
              backgroundColor: theme.card.val,
              padding: 12
            }}
          >
            <Text color="$color">{assigneeName}</Text>
            <Image source="sf:chevron.down" style={{ width: 12, height: 12 }} tintColor="gray" />
          </Pressable>
        </View>

        {/* Due Date */}
        <View gap={8}>
          <Text fontSize={14} fontWeight="500" color="$mutedForeground">
            {t("kanban.task.dueDateLabel") || "Due Date"}
          </Text>
          <Pressable
            onPress={() => {
              setShowDatePicker(true);
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderRadius: 8,
              borderWidth: 1,
              borderColor: theme.borderColor.val,
              backgroundColor: theme.card.val,
              padding: 12
            }}
          >
            <Text color="$color">
              {dueDate ? format(dueDate, "MMM d, yyyy") : "Set due date"}
            </Text>
            <Image source="sf:calendar" style={{ width: 16, height: 16 }} tintColor="gray" />
          </Pressable>
          {showDatePicker &&
            (Platform.OS === "ios" ? (
              <View marginTop={8} borderRadius={8} backgroundColor="$card" padding={8}>
                <DateTimePicker
                  value={dueDate || new Date()}
                  mode="date"
                  display="inline"
                  minimumDate={new Date()}
                  onChange={(event, date) => {
                    if (date) {
                      setDueDate(date);
                    }
                  }}
                />
                <Pressable
                  onPress={() => {
                    setShowDatePicker(false);
                  }}
                  style={{ alignItems: "center", padding: 8 }}
                >
                  <Text fontWeight="500" color="$primary">
                    Done
                  </Text>
                </Pressable>
              </View>
            ) : (
              <DateTimePicker
                value={dueDate || new Date()}
                mode="date"
                display="default"
                minimumDate={new Date()}
                onChange={(event, date) => {
                  setShowDatePicker(false);
                  if (date) {
                    setDueDate(date);
                  }
                }}
              />
            ))}
        </View>

        {/* Description */}
        <View gap={8}>
          <Text fontSize={14} fontWeight="500" color="$mutedForeground">
            {t("kanban.task.descriptionLabel") || "Description"}
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
              textAlignVertical: "top"
            }}
            value={description}
            onChangeText={setDescription}
            placeholder={t("kanban.task.descriptionPlaceholder") || "Add description..."}
            placeholderTextColor={theme.mutedForeground.val}
            multiline
          />
        </View>

        {/* Delete Button */}
        <Pressable
          onPress={handleDelete}
          style={{
            marginTop: 16,
            alignItems: "center",
            borderRadius: 8,
            backgroundColor: theme.destructiveAlpha10.val,
            padding: 16
          }}
        >
          <Text fontWeight="600" color="$destructive">
            {t("kanban.task.delete") || "Delete Task"}
          </Text>
        </Pressable>
      </ScrollView>

      {/* Assignee Modal */}
      <Modal
        visible={showAssigneeModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowAssigneeModal(false);
        }}
      >
        <View flex={1} backgroundColor="$background">
          <View
            flexDirection="row"
            alignItems="center"
            justifyContent="space-between"
            borderBottomWidth={1}
            borderColor="$borderColor"
            padding={16}
          >
            <Text fontSize={18} fontWeight="600" color="$color">
              Select Assignee
            </Text>
            <Pressable
              onPress={() => {
                setShowAssigneeModal(false);
              }}
            >
              <Text fontWeight="500" color="$primary">
                Close
              </Text>
            </Pressable>
          </View>
          <FlatList
            data={users}
            keyExtractor={(item) => item._id}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  setAssigneeId(item._id);
                  setShowAssigneeModal(false);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottomWidth: 1,
                  borderColor: theme.borderColor.val,
                  padding: 16,
                  backgroundColor: assigneeId === item._id ? theme.secondaryAlpha50.val : undefined
                }}
              >
                <View>
                  <Text fontWeight="500" color="$color">
                    {item.name}
                  </Text>
                  <Text fontSize={14} color="$mutedForeground">
                    {item.email}
                  </Text>
                </View>
                {assigneeId === item._id && (
                  <Image source="sf:checkmark" style={{ width: 16, height: 16 }} tintColor="blue" />
                )}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
