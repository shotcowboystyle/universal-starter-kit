import { Text, View, useTheme } from "@tamagui/core";
import { Image } from "expo-image";
import { Link, Stack } from "expo-router";
import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { RefreshControl, ScrollView, Pressable } from "react-native";

import { BoardCard } from "@/components/board-card";
import { useBoards } from "@/hooks/use-boards";

type FilterType = "all" | "my" | "team";

const FILTERS: FilterType[] = ["all", "my", "team"];

export default function BoardsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { data, isLoading, refetch, isRefetching } = useBoards();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");

  const handleSearchChange = useCallback((text: string) => {
    setSearch(text);
  }, []);

  const filteredMyBoards = useMemo(
    () =>
      (data?.myBoards || []).filter((b) => b.title.toLowerCase().includes(search.toLowerCase())),
    [data?.myBoards, search]
  );

  const filteredTeamBoards = useMemo(
    () =>
      (data?.teamBoards || []).filter((b) => b.title.toLowerCase().includes(search.toLowerCase())),
    [data?.teamBoards, search]
  );

  const showMy = filter === "all" || filter === "my";
  const showTeam = filter === "all" || filter === "team";
  const isEmpty =
    !isLoading &&
    (!showMy || filteredMyBoards.length === 0) &&
    (!showTeam || filteredTeamBoards.length === 0);

  const filterLabels: Record<FilterType, string> = {
    all: t("kanban.allBoards"),
    my: t("kanban.myBoards"),
    team: t("kanban.teamBoards")
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background.val }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl=<RefreshControl refreshing={isRefetching} onRefresh={refetch} />
    >
      <Stack.Screen
        options={{
          title: t("sidebar.overview"),
          headerLargeTitle: true,
          headerSearchBarOptions: {
            placeholder: t("kanban.searchBoards"),
            onChangeText: (event) => {
              handleSearchChange(event.nativeEvent.text);
            },
            onCancelButtonPress: () => {
              handleSearchChange("");
            }
          }
        }}
      />

      {/* Header Section */}
      <View gap={12} paddingTop={16} paddingBottom={16}>
        {/* New Board Button */}
        <Link href="/boards/form" asChild>
          <Pressable>
            <View
              alignItems="center"
              justifyContent="center"
              borderRadius={8}
              backgroundColor="$primary"
              paddingHorizontal={16}
              paddingVertical={12}
              style={{ borderCurve: "continuous" }}
            >
              <Text fontSize={14} fontWeight="500" color="$primaryForeground">
                {t("kanban.newBoard")}
              </Text>
            </View>
          </Pressable>
        </Link>

        {/* Filter Pills */}
        <View flexDirection="row" gap={8}>
          {FILTERS.map((f) => (
            <Pressable
              key={f}
              style={{
                flex: 1,
                alignItems: "center",
                borderRadius: 6,
                paddingVertical: 8,
                backgroundColor: f === filter ? theme.primary.val : theme.card.val,
                borderWidth: f === filter ? 0 : 1,
                borderColor: f === filter ? undefined : theme.borderColor.val
              }}
              onPress={() => {
                setFilter(f);
              }}
            >
              <Text
                fontSize={14}
                fontWeight="500"
                color={f === filter ? "$primaryForeground" : "$mutedForeground"}
              >
                {filterLabels[f]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Loading State */}
      {isLoading && !isRefetching ? (
        <View marginTop={32} alignItems="center">
          <View style={{ width: 36, height: 36 }}>
            <Image
              source="sf:progress.indicator"
              style={{ width: 36, height: 36 }}
              tintColor="gray"
            />
          </View>
        </View>
      ) : null}

      {/* Board Sections */}
      {!isLoading && !isEmpty ? (
        <View gap={24}>
          {showMy && filteredMyBoards.length > 0 ? (
            <View gap={12}>
              <View gap={4}>
                <Text fontSize={24} fontWeight="700" color="$color">
                  {t("kanban.myBoards")}
                </Text>
                <Text fontSize={14} color="$mutedForeground">
                  {t("kanban.myBoardsDescription")}
                </Text>
              </View>
              <View gap={12}>
                {filteredMyBoards.map((board) => (
                  <BoardCard key={board._id} board={board} />
                ))}
              </View>
            </View>
          ) : null}

          {showTeam && filteredTeamBoards.length > 0 ? (
            <View gap={12}>
              <View gap={4}>
                <Text fontSize={24} fontWeight="700" color="$color">
                  {t("kanban.teamBoards")}
                </Text>
                <Text fontSize={14} color="$mutedForeground">
                  {t("kanban.teamBoardsDescription")}
                </Text>
              </View>
              <View gap={12}>
                {filteredTeamBoards.map((board) => (
                  <BoardCard key={board._id} board={board} showOwner />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Empty State */}
      {!isLoading && isEmpty ? (
        <View flex={1} alignItems="center" justifyContent="center" gap={16} paddingVertical={80}>
          <Text textAlign="center" fontSize={18} color="$mutedForeground">
            {t("kanban.noBoardsFound")}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
