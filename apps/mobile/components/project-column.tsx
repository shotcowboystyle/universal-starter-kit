import { Project, TaskStatus } from "@repo/store";
import { Text, View, useTheme } from "@tamagui/core";
import { Image } from "expo-image";
import { Link, router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Alert, Pressable } from "react-native";

import { useDeleteProject } from "@/hooks/use-projects";
import { useTasks } from "@/hooks/use-tasks";

import { SortableTaskList } from "./sortable-task-list";

interface ProjectColumnProps {
  project: Project;
  boardId: string;
  statusFilter?: TaskStatus | null;
}

export function ProjectColumn({ project, boardId, statusFilter }: ProjectColumnProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { data: allTasks = [] } = useTasks(project._id);
  const tasks = statusFilter ? allTasks.filter((task) => task.status === statusFilter) : allTasks;
  const deleteProjectMutation = useDeleteProject();

  const handleDelete = () => {
    Alert.alert(
      t("kanban.project.confirmDeleteTitle", { title: project.title }) || "Delete Project",
      t("kanban.project.confirmDeleteDescription") ||
        "Are you sure you want to delete this project?",
      [
        { text: t("common.cancel") || "Cancel", style: "cancel" },
        {
          text: t("common.delete") || "Delete",
          style: "destructive",
          onPress: () => {
            deleteProjectMutation.mutate({ id: project._id, boardId });
          }
        }
      ]
    );
  };

  return (
    <View
      overflow="hidden"
      borderRadius={12}
      borderWidth={1}
      borderColor="$borderColor"
      backgroundColor="$secondary"
    >
      {/* Header */}
      <View
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        borderBottomWidth={1}
        borderColor="$borderColor"
        backgroundColor="$card"
        padding={12}
      >
        <View flex={1} flexDirection="row" alignItems="center" gap={8}>
          <Text fontWeight="600" color="$color" numberOfLines={1}>
            {project.title}
          </Text>
          <View borderRadius={9999} backgroundColor="$secondary" paddingHorizontal={8} paddingVertical={2}>
            <Text
              fontSize={12}
              color="$mutedForeground"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {statusFilter ? `${tasks.length}/${allTasks.length}` : tasks.length}
            </Text>
          </View>
        </View>

        <Link href={`/projects/new?boardId=${boardId}&projectId=${project._id}`} asChild>
          <Link.Trigger>
            <Pressable style={{ padding: 4 }}>
              <Image source="sf:ellipsis" style={{ width: 20, height: 20 }} tintColor="gray" />
            </Pressable>
          </Link.Trigger>
          <Link.Menu>
            <Link.MenuAction
              title={t("common.edit") || "Edit"}
              icon="pencil"
              onPress={() => {
                router.push(`/projects/new?boardId=${boardId}&projectId=${project._id}`);
              }}
            />
            <Link.MenuAction
              title={t("common.delete") || "Delete"}
              icon="trash"
              destructive
              onPress={handleDelete}
            />
          </Link.Menu>
        </Link>
      </View>

      {/* Add Task — positioned above task list for easy access */}
      <View borderBottomWidth={1} borderColor="$borderColor" backgroundColor="$card" paddingHorizontal={8} paddingVertical={6}>
        <Link href={`/tasks/new?boardId=${boardId}&projectId=${project._id}`} asChild>
          <Pressable
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              borderRadius: 8,
              backgroundColor: theme.primaryAlpha10.val,
              padding: 8,
              borderCurve: "continuous"
            }}
          >
            <Image
              source="sf:plus.circle.fill"
              style={{ width: 16, height: 16 }}
              tintColor="gray"
            />
            <Text fontSize={14} fontWeight="500" color="$color">
              {t("kanban.task.addNewTask") || "+ Add New Task"}
            </Text>
          </Pressable>
        </Link>
      </View>

      {/* Tasks List */}
      <View padding={16}>
        <SortableTaskList
          tasks={tasks}
          projectId={project._id}
          boardId={boardId}
          onTaskPress={(taskId) => {
            router.push(`/tasks/${taskId}`);
          }}
        />
      </View>
    </View>
  );
}
