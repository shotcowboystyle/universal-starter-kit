import type { User } from '@repo/store';
import { Text, View, useTheme } from '@tamagui/core';
import { Image } from 'expo-image';
import { Modal, FlatList, Pressable } from 'react-native';

const SPACE_BETWEEN = 'space-between';

export interface AssigneeModalProps {
  visible: boolean;
  users: User[];
  assigneeId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export const AssigneeModal = ({ visible, users, assigneeId, onSelect, onClose }: AssigneeModalProps) => {
  const theme = useTheme();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View
        flex={1}
        backgroundColor="$background">
        <View
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          borderBottomWidth={1}
          borderColor="$borderColor"
          padding={16}>
          <Text
            fontSize={18}
            fontWeight="600"
            color="$color">
            Select Assignee
          </Text>
          <Pressable onPress={onClose}>
            <Text
              fontWeight="500"
              color="$primary">
              Close
            </Text>
          </Pressable>
        </View>
        <FlatList
          data={users}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                onSelect(item._id);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: SPACE_BETWEEN,
                borderBottomWidth: 1,
                borderColor: theme.borderColor.val,
                padding: 16,
                backgroundColor: assigneeId === item._id ? theme.secondaryAlpha50.val : undefined,
              }}>
              <View>
                <Text
                  fontWeight="500"
                  color="$color">
                  {item.name}
                </Text>
                <Text
                  fontSize={14}
                  color="$mutedForeground">
                  {item.email}
                </Text>
              </View>
              {assigneeId === item._id && (
                <Image
                  source="sf:checkmark"
                  style={{ width: 16, height: 16 }}
                  tintColor="blue"
                />
              )}
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
};
