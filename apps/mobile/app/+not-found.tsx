import { Text, View } from "@tamagui/core";
import { Link, Stack } from "expo-router";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <View flex={1} alignItems="center" justifyContent="center" padding={20}>
        <Text fontSize={20} fontWeight="700">
          This screen doesn&apos;t exist.
        </Text>

        <Link href="/" style={{ marginTop: 16, paddingVertical: 16 }}>
          <Text fontSize={14} color="$blue500">
            Go to home screen!
          </Text>
        </Link>
      </View>
    </>
  );
}
