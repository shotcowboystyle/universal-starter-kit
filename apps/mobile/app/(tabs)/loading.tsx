import { View } from '@tamagui/core';
import { ActivityIndicator } from 'react-native';

const Loading = () => {
  return (
    <View
      flex={1}
      alignItems="center"
      justifyContent="center"
      backgroundColor="$background">
      <ActivityIndicator size="large" />
    </View>
  );
};

export default Loading;
