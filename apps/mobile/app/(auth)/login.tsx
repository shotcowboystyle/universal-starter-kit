import { Text, View, useTheme } from "@tamagui/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, Alert, Pressable, TextInput, ActivityIndicator } from "react-native";

import { DEFAULT_EMAIL } from "@/constants/app";
import { useAuth } from "@/hooks/use-auth";

export default function LoginScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { login, loginMutation } = useAuth();
  const [email, setEmail] = useState(DEFAULT_EMAIL);

  const handleLogin = () => {
    if (!email) {
      Alert.alert("Error", t("login.invalidEmail"));
      return;
    }
    login(email);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <View flex={1} alignItems="center" justifyContent="center" gap={24} backgroundColor="$background" padding={32}>
        <Text fontSize={30} fontWeight="700" color="$color">
          {t("login.title")}
        </Text>
        <Text textAlign="center" color="$mutedForeground">
          {t("login.formHint")}
        </Text>

        {loginMutation.isError && (
          <Text textAlign="center" color="$destructive">
            {loginMutation.error?.message}
          </Text>
        )}

        <TextInput
          style={{
            width: "100%",
            borderRadius: 8,
            borderWidth: 1,
            borderColor: theme.borderColor.val,
            backgroundColor: theme.input.val,
            padding: 16,
            color: theme.color.val,
            fontSize: 16
          }}
          placeholder={t("login.emailPlaceholder")}
          placeholderTextColor={theme.mutedForeground.val}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
        />

        <Pressable
          style={{
            width: "100%",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            backgroundColor: theme.primary.val,
            padding: 16
          }}
          onPress={handleLogin}
          disabled={loginMutation.isPending}
        >
          {loginMutation.isPending ? (
            <ActivityIndicator style={{ marginRight: 8 }} color={theme.primaryForeground.val} />
          ) : null}
          <Text fontWeight="600" color="$primaryForeground">
            {t("login.continueButton")}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
