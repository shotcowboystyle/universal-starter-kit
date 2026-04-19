import { Text, View, useTheme } from "@tamagui/core";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Alert, KeyboardAvoidingView, Platform, ActivityIndicator, Pressable, TextInput, ScrollView } from "react-native";

import { useCreateBoard, useUpdateBoard, useBoard } from "@/hooks/use-boards";
import { useAuthStore } from "@/stores/auth";

export default function BoardFormScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ boardId?: string }>();
  const boardId = params.boardId;
  const isEdit = !!boardId;

  const { session } = useAuthStore();
  const { data: board, isLoading: isBoardLoading } = useBoard(boardId);
  const createMutation = useCreateBoard();
  const updateMutation = useUpdateBoard();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (board && isEdit) {
      setTitle(board.title);
      setDescription(board.description || "");
    }
  }, [board, isEdit]);

  const handleSubmit = () => {
    if (!title) {
      return;
    }

    if (isEdit && boardId) {
      updateMutation.mutate(
        { id: boardId, title, description },
        {
          onSuccess: () => {
            router.back();
          },
          onError: (error) => {
            Alert.alert(t("kanban.actions.error"), error.message);
          }
        }
      );
    } else {
      createMutation.mutate(
        { title, description, owner: session?.user._id },
        {
          onSuccess: () => {
            router.back();
          },
          onError: (error) => {
            Alert.alert(t("kanban.actions.error"), error.message);
          }
        }
      );
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: theme.background.val }}
    >
      <Stack.Screen
        options={{
          title: isEdit ? t("kanban.actions.editBoardTitle") : t("kanban.actions.newBoardTitle"),
          presentation: "formSheet",
          sheetGrabberVisible: true,
          headerLeft: () => (
            <Pressable
              onPress={() => {
                router.back();
              }}
            >
              <Text fontSize={17} color="$primary">
                {t("kanban.actions.cancel")}
              </Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={handleSubmit} disabled={isPending || !title}>
              {isPending ? (
                <ActivityIndicator />
              ) : (
                <Text
                  fontSize={17}
                  fontWeight="600"
                  color={!title ? "$mutedForeground" : "$primary"}
                >
                  {isEdit ? t("kanban.actions.save") : t("kanban.actions.create")}
                </Text>
              )}
            </Pressable>
          )
        }}
      />

      {isEdit && isBoardLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ padding: 16, gap: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          <View gap={8}>
            <Text fontWeight="600" color="$color">
              {t("kanban.actions.boardTitleLabel")}
            </Text>
            <TextInput
              style={{
                borderRadius: 8,
                borderWidth: 1,
                borderColor: theme.input.val,
                backgroundColor: theme.input.val,
                padding: 12,
                fontSize: 16,
                color: theme.color.val,
                borderCurve: "continuous"
              }}
              placeholder={t("kanban.actions.boardTitlePlaceholder")}
              placeholderTextColor={theme.mutedForeground.val}
              value={title}
              onChangeText={setTitle}
            />
          </View>

          <View gap={8}>
            <Text fontWeight="600" color="$color">
              {t("kanban.actions.descriptionLabel")}
            </Text>
            <TextInput
              style={{
                height: 128,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: theme.input.val,
                backgroundColor: theme.input.val,
                padding: 12,
                fontSize: 16,
                color: theme.color.val,
                borderCurve: "continuous",
                textAlignVertical: "top"
              }}
              placeholder={t("kanban.actions.descriptionPlaceholder")}
              placeholderTextColor={theme.mutedForeground.val}
              value={description}
              onChangeText={setDescription}
              multiline
            />
          </View>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}
