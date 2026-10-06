import { Stack } from 'expo-router';

const TasksLayout = () => (
  <Stack
    screenOptions={{
      headerStyle: { backgroundColor: 'hsl(180, 35%, 5%)' },
      headerTitleStyle: { color: 'hsl(180, 20%, 100%)' },
      headerTintColor: 'hsl(180, 20%, 100%)',
    }}>
    <Stack.Screen name="[taskId]" />
    <Stack.Screen
      name="new"
      options={{ presentation: 'formSheet' }}
    />
  </Stack>
);

export default TasksLayout;
