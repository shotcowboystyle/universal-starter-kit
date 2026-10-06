import { Stack } from 'expo-router/stack';

const BoardsLayout = () => {
  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerStyle: { backgroundColor: 'hsl(180, 35%, 5%)' },
        headerTitleStyle: { color: 'hsl(180, 20%, 100%)' },
        headerTintColor: 'hsl(180, 20%, 100%)',
      }}
    />
  );
};

export default BoardsLayout;
