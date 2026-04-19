import { Project } from "@repo/store";
import { Text, View, useTheme } from "@tamagui/core";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { Modal, ActivityIndicator, Platform, ActionSheetIOS, Pressable, ScrollView } from "react-native";

import { useProjects } from "@/hooks/use-projects";
import { useMoveTask } from "@/hooks/use-tasks";

interface MoveTaskSheetProps {
  visible: boolean;
  taskId: string;
  currentProjectId: string;
  boardId: string;
  onClose: () => void;
}

export function MoveTaskSheet({
  visible,
  taskId,
  currentProjectId,
  boardId,
  onClose
}: MoveTaskSheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { data: projects = [], isLoading } = useProjects(boardId);
  const moveTaskMutation = useMoveTask();

  const availableProjects = projects.filter((p: Project) => p._id !== currentProjectId);

  const handleMove = (targetProjectId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    moveTaskMutation.mutate(
      {
        taskId,
        projectId: targetProjectId,
        orderInProject: 0
      },
      {
        onSuccess: () => {
          onClose();
        }
      }
    );
  };

  if (Platform.OS === "ios") {
    if (visible && !isLoading && availableProjects.length > 0) {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...availableProjects.map((p) => p.title), t("common.cancel") || "Cancel"],
          cancelButtonIndex: availableProjects.length,
          title: t("kanban.task.moveToTitle") || "Move to Project",
          message: t("kanban.task.moveToDescription") || "Select a project to move this task to"
        },
        (buttonIndex) => {
          if (buttonIndex < availableProjects.length) {
            handleMove(availableProjects[buttonIndex]._id);
          } else {
            onClose();
          }
        }
      );
    }
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <Pressable
        style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}
        onPress={onClose}
      >
        <Pressable
          style={{
            maxHeight: "50%",
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            backgroundColor: theme.background.val
          }}
          onPress={(e) => {
            e.stopPropagation();
          }}
        >
          <View
            flexDirection="row"
            alignItems="center"
            justifyContent="space-between"
            borderBottomWidth={1}
            borderColor="$borderColor"
            padding={16}
          >
            <Text fontSize={18} fontWeight="600" color="$color">
              {t("kanban.task.moveToTitle") || "Move to Project"}
            </Text>
            <Pressable onPress={onClose}>
              <Image source="sf:xmark" style={{ width: 20, height: 20 }} tintColor="gray" />
            </Pressable>
          </View>

          {isLoading ? (
            <View alignItems="center" padding={32}>
              <ActivityIndicator size="large" />
              <Text marginTop={8} color="$mutedForeground">
                {t("common.loading") || "Loading..."}
              </Text>
            </View>
          ) : availableProjects.length === 0 ? (
            <View alignItems="center" padding={32}>
              <Text color="$mutedForeground">
                {t("kanban.task.noProjectsAvailable") || "No other projects available"}
              </Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 300 }}>
              {availableProjects.map((project) => (
                <Pressable
                  key={project._id}
                  onPress={() => {
                    handleMove(project._id);
                  }}
                  disabled={moveTaskMutation.isPending}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderBottomWidth: 1,
                    borderColor: theme.borderColor.val,
                    padding: 16,
                    backgroundColor: pressed ? theme.secondaryAlpha50.val : undefined
                  })}
                >
                  <View flex={1}>
                    <Text fontWeight="500" color="$color">
                      {project.title}
                    </Text>
                    {project.description && (
                      <Text fontSize={14} color="$mutedForeground" numberOfLines={1}>
                        {project.description}
                      </Text>
                    )}
                  </View>
                  {moveTaskMutation.isPending &&
                  moveTaskMutation.variables?.projectId === project._id ? (
                    <ActivityIndicator size="small" />
                  ) : (
                    <Image
                      source="sf:chevron.right"
                      style={{ width: 16, height: 16 }}
                      tintColor="gray"
                    />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
