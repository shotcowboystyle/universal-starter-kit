import { Text, View, useTheme } from "@tamagui/core";
import { ErrorBoundaryProps } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable } from "react-native";

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <View flex={1} alignItems="center" justifyContent="center" gap={16} backgroundColor="$background" padding={24}>
      <Text fontSize={20} fontWeight="700" color="$color">
        {t("error.title")}
      </Text>
      <Text textAlign="center" color="$mutedForeground">
        {error.message || t("error.workspaceError")}
      </Text>
      <Pressable
        onPress={retry}
        style={{
          borderRadius: 8,
          backgroundColor: theme.primary.val,
          paddingHorizontal: 24,
          paddingVertical: 12
        }}
      >
        <Text fontWeight="600" color="$primaryForeground">
          {t("error.tryAgain")}
        </Text>
      </Pressable>
    </View>
  );
}

export default ErrorBoundary;
