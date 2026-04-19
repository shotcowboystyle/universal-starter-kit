import DateTimePicker from "@react-native-community/datetimepicker";
import { TaskStatus } from "@repo/store";
import { Text, View, useTheme } from "@tamagui/core";
import { format } from "date-fns";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, Modal, FlatList, Alert, Pressable, TextInput, ScrollView } from "react-native";

import { useCreateTask } from "@/hooks/use-tasks";
import { useUsers } from "@/hooks/use-users";

export default function NewTaskScreen() {
  const { projectId, boardId } = useLocalSearchParams<{ projectId: string; boardId: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();

  const createTaskMutation = useCreateTask();
  const { data: users = [] } = useUsers();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState(TaskStatus.TODO);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<Date | null>(null);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAssigneeModal, setShowAssigneeModal] = useState(false);

  const handleCreate = () => {
    if (!title) {
      Alert.alert("Error", "Title is required");
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    createTaskMutation.mutate(
      {
        title,
        description,
        status,
        assignee: assigneeId || undefined,
        dueDate: dueDate || undefined,
        project: projectId,
        board: boardId
      },
      {
        onSuccess: () => {
          router.back();
        }
      }
    );
  };

  const assigneeName = users.find((u) => u._id === assigneeId)?.name || "Unassigned";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <Stack.Screen
        options={{
          title: t("kanban.task.addNewTaskTitle") || "New Task",
          presentation: "formSheet",
          headerLeft: () => (
            <Pressable
              onPress={() => {
                router.back();
              }}
            >
              <Text fontWeight="500" color="$primary">
                {t("common.cancel") || "Cancel"}
              </Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={handleCreate} disabled={createTaskMutation.isPending}>
              <Text
                fontWeight="600"
                color={createTaskMutation.isPending ? "$mutedForeground" : "$primary"}
              >
                {t("common.create") || "Create"}
              </Text>
            </Pressable>
          )
        }}
      />

      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background.val }}
        contentContainerStyle={{ padding: 16, gap: 24 }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
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
