import { View } from "@tamagui/core";
import { ActivityIndicator } from "react-native";

export default function Loading() {
  return (
    <View flex={1} alignItems="center" justifyContent="center" backgroundColor="$background">
      <ActivityIndicator size="large" />
    </View>
  );
}
