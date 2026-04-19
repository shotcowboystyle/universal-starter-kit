import type { Board } from "@repo/store";
import { Text, View, useTheme } from "@tamagui/core";
import * as Haptics from "expo-haptics";
import { Link } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable } from "react-native";

import { BoardActions } from "@/components/board-actions";

interface BoardCardProps {
  board: Board;
  showOwner?: boolean;
}

export function BoardCard({ board, showOwner }: BoardCardProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [pressed, setPressed] = useState(false);

  const projectNames = useMemo(
    () => (board.projects?.length > 0 ? board.projects.map((p) => p.title).join(" / ") : "0"),
    [board.projects]
  );

  const memberNames = useMemo(
    () => (board.members?.length > 0 ? board.members.map((m) => m.name).join(", ") : ""),
    [board.members]
  );

  const ownerName = useMemo(
    () => (typeof board.owner === "string" ? board.owner : board.owner?.name || "Unknown"),
    [board.owner]
  );

  const handlePressIn = useCallback(() => {
    setPressed(true);
    if (process.env.EXPO_OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const handlePressOut = useCallback(() => {
    setPressed(false);
  }, []);

  return (
    <Link href={`/boards/${board._id}`} asChild>
      <Pressable
        style={{
          borderRadius: 12,
          borderWidth: 1,
          backgroundColor: theme.card.val,
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 16,
          borderColor: pressed ? theme.primary.val : theme.borderColor.val,
          borderCurve: "continuous",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)"
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {/* Header: title + actions — matches web CardHeader layout */}
        <View marginBottom={4} flexDirection="row" alignItems="center" justifyContent="space-between">
          <Text flex={1} paddingRight={16} fontSize={18} fontWeight="600" color="$color" numberOfLines={1}>
            {board.title}
          </Text>
          <BoardActions boardId={board._id} boardTitle={board.title} />
        </View>

        {/* Description */}
        <Text marginBottom={12} fontSize={14} color="$mutedForeground" numberOfLines={2}>
          {board.description || t("kanban.noDescription")}
        </Text>

        {/* Metadata — matches web CardContent layout */}
        <View gap={4}>
          {showOwner ? (
            <Text fontSize={14} color="$color">
              {t("kanban.owner")}: {ownerName}
            </Text>
          ) : null}

          <Text fontSize={14} color="$color">
            {t("kanban.projects")}: {projectNames}
          </Text>

          <Text fontSize={14} color="$color">
            {t("kanban.members")}: {memberNames}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}
