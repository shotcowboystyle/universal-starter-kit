import SegmentedControl from "@react-native-segmented-control/segmented-control";
import { Text, View, useTheme } from "@tamagui/core";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useColorScheme, ScrollView, Pressable } from "react-native";

import { useAuth } from "@/hooks/use-auth";
import { i18n } from "@/lib/i18n";
import { saveLanguagePreference } from "@/lib/language";
import {
  type ThemePreference,
  applyThemePreference,
  loadThemePreference,
  saveThemePreference
} from "@/lib/theme";

const THEME_OPTIONS: ThemePreference[] = ["light", "dark", "system"];
const LANGUAGE_CODES = ["en", "de"] as const;
const LANGUAGE_LABELS = ["English", "Deutsch"];

export default function SettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const { logout, user } = useAuth();

  const [themeIndex, setThemeIndex] = useState(2);
  const [langIndex, setLangIndex] = useState(i18n.language === "de" ? 1 : 0);

  useEffect(() => {
    loadThemePreference().then((pref) => {
      setThemeIndex(THEME_OPTIONS.indexOf(pref));
    });
  }, []);

  const handleThemeChange = useCallback((index: number) => {
    const pref = THEME_OPTIONS[index];
    setThemeIndex(index);
    applyThemePreference(pref);
    saveThemePreference(pref);
    if (process.env.EXPO_OS === "ios") {
      Haptics.selectionAsync();
    }
  }, []);

  const handleLanguageChange = useCallback((index: number) => {
    const lang = LANGUAGE_CODES[index];
    setLangIndex(index);
    i18n.changeLanguage(lang);
    saveLanguagePreference(lang);
    if (process.env.EXPO_OS === "ios") {
      Haptics.selectionAsync();
    }
  }, []);

  const themeLabels = [t("theme.light"), t("theme.dark"), t("theme.system")];
  const isDark = colorScheme === "dark";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background.val }}
      contentContainerStyle={{ padding: 16, gap: 32 }}
      contentInsetAdjustmentBehavior="automatic"
    >
      {/* Account Section */}
      <View gap={12}>
        <View gap={16} borderRadius={12} backgroundColor="$card" padding={16} style={{ borderCurve: "continuous" }}>
          {/* User Info Row */}
          <View flexDirection="row" alignItems="center" gap={12}>
            <View height={48} width={48} alignItems="center" justifyContent="center" borderRadius={9999} backgroundColor="$primary">
              <Text fontSize={18} fontWeight="700" color="$primaryForeground">
                {user?.email?.[0]?.toUpperCase() ?? "?"}
              </Text>
            </View>
            <View flex={1}>
              <Text selectable fontSize={16} fontWeight="600" color="$color">
                {user?.name ?? user?.email?.split("@")[0]}
              </Text>
              <Text selectable fontSize={14} color="$mutedForeground">
                {user?.email}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View height={1} backgroundColor="$borderColor" />

          {/* Logout Button */}
          <Pressable
            onPress={logout}
            style={{ alignItems: "center", borderRadius: 8, paddingVertical: 10 }}
          >
            <Text fontSize={16} fontWeight="500" color="$destructive">
              {t("user.logOut")}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Language Section */}
      <View gap={12}>
        <Text fontSize={12} fontWeight="600" letterSpacing={0.8} color="$mutedForeground" textTransform="uppercase">
          {t("settings.language", { defaultValue: "Language" })}
        </Text>
        <View gap={12} borderRadius={12} backgroundColor="$card" padding={16} style={{ borderCurve: "continuous" }}>
          <SegmentedControl
            values={LANGUAGE_LABELS}
            selectedIndex={langIndex}
            onChange={(event) => {
              handleLanguageChange(event.nativeEvent.selectedSegmentIndex);
            }}
            appearance={isDark ? "dark" : "light"}
          />
        </View>
      </View>

      {/* Theme Section */}
      <View gap={12}>
        <Text fontSize={12} fontWeight="600" letterSpacing={0.8} color="$mutedForeground" textTransform="uppercase">
          {t("theme.toggleTheme")}
        </Text>
        <View gap={12} borderRadius={12} backgroundColor="$card" padding={16} style={{ borderCurve: "continuous" }}>
          <SegmentedControl
            values={themeLabels}
            selectedIndex={themeIndex}
            onChange={(event) => {
              handleThemeChange(event.nativeEvent.selectedSegmentIndex);
            }}
            appearance={isDark ? "dark" : "light"}
          />
        </View>
      </View>
    </ScrollView>
  );
}
