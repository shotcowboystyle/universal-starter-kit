import { Task, TaskStatus } from "@repo/store";
import { Text, View, useTheme } from "@tamagui/core";
import { format } from "date-fns";
import * as Haptics from "expo-haptics";
import { Link, router } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS
} from "react-native-reanimated";

import { useUpdateTask, useDeleteTask } from "@/hooks/use-tasks";

interface TaskCardProps {
  task: Task;
  onMoveToProject?: () => void;
}

const SWIPE_THRESHOLD = 60;

const STATUS_ORDER: TaskStatus[] = [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.DONE];

const StatusBadge = ({ status }: { status: TaskStatus }) => {
  const { t } = useTranslation();
  let bgColor = "$gray500";
  let label = t("kanban.task.statusTodo") || "Todo";

  switch (status) {
    case "IN_PROGRESS":
      bgColor = "$blue500";
      label = t("kanban.task.statusInProgress") || "In Progress";
      break;
    case "DONE":
      bgColor = "$green500";
      label = t("kanban.task.statusDone") || "Done";
      break;
  }

  return (
    <View backgroundColor={bgColor} borderRadius={9999} paddingHorizontal={8} paddingVertical={2}>
      <Text fontSize={12} fontWeight="500" color="$white">
        {label}
      </Text>
    </View>
  );
};

export function TaskCard({ task, onMoveToProject }: TaskCardProps) {
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

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    updateTaskMutation.mutate({ id: task._id, status: nextStatus });
  }, [task._id, task.status, updateTaskMutation]);

  const handleMoveTo = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (onMoveToProject) {
      onMoveToProject();
    }
  }, [onMoveToProject]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      t("kanban.task.confirmDeleteTitle", { title: task.title }) || "Delete Task",
      t("kanban.task.confirmDeleteDescription", { title: task.title }) ||
        "Are you sure you want to delete this task?",
      [
        { text: t("common.cancel") || "Cancel", style: "cancel" },
        {
          text: t("common.delete") || "Delete",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            deleteTaskMutation.mutate(task._id);
          }
        }
      ]
    );
  }, [t, task.title, task._id, deleteTaskMutation]);

  const pan = Gesture.Pan()
    .onBegin(() => {
      context.value = translateX.value;
    })
    .onUpdate((event) => {
      translateX.value = event.translationX + context.value;
    })
    .onEnd(() => {
      if (translateX.value > SWIPE_THRESHOLD) {
        runOnJS(cycleStatus)();
      } else if (translateX.value < -SWIPE_THRESHOLD) {
        runOnJS(handleMoveTo)();
      }
      translateX.value = withSpring(0);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }]
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={animatedStyle}>
        <Link href={`/tasks/${task._id}`} asChild>
          <Link.Trigger>
            <Pressable
              style={{
                borderRadius: 12,
                backgroundColor: theme.card.val,
                padding: 16,
                marginBottom: 12,
                gap: 12,
                borderCurve: "continuous",
                borderWidth: 1,
                borderColor: "rgba(255, 255, 255, 0.25)",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25)"
              }}
            >
              <View flexDirection="row" alignItems="flex-start" justifyContent="space-between">
                <Text
                  flex={1}
                  marginRight={8}
                  fontSize={16}
                  fontWeight="500"
                  color="$color"
                  numberOfLines={2}
                >
                  {task.title}
                </Text>
                <StatusBadge status={task.status || "TODO"} />
              </View>

              <View flexDirection="row" alignItems="center" justifyContent="space-between">
                <View flexDirection="row" alignItems="center" gap={4}>
                  {task.assignee && (
                    <Text fontSize={12} color="$mutedForeground">
                      {typeof task.assignee === "string"
                        ? "Assigned"
                        : task.assignee.name || task.assignee.email}
                    </Text>
                  )}
                </View>
                {task.dueDate && (
                  <Text fontSize={12} color="$mutedForeground">
                    {format(new Date(task.dueDate), "MMM d")}
                  </Text>
                )}
              </View>
            </Pressable>
          </Link.Trigger>
          <Link.Menu>
            <Link.MenuAction
              title={t("common.edit") || "Edit"}
              icon="pencil"
              onPress={() => {
                router.push(`/tasks/${task._id}`);
              }}
            />
            <Link.MenuAction
              title={t("kanban.task.moveTask") || "Move task"}
              icon="arrow.right.square"
              onPress={handleMoveTo}
            />
            <Link.MenuAction
              title={t("common.delete") || "Delete"}
              icon="trash"
              destructive
              onPress={handleDelete}
            />
          </Link.Menu>
        </Link>
      </Animated.View>
    </GestureDetector>
  );
}
