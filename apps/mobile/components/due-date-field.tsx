import DateTimePicker from '@react-native-community/datetimepicker';
import { Text, View, useTheme } from '@tamagui/core';
import { format } from 'date-fns';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable } from 'react-native';

const SPACE_BETWEEN = 'space-between';

interface DueDateFieldProps {
  dueDate: Date | null;
  onChange: (date: Date) => void;
}

export const DueDateField = ({ dueDate, onChange }: DueDateFieldProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  // oxlint-disable-next-line react/purity -- memoized once per mount as the picker's minimum date
  const today = useMemo(() => new Date(), []);
  const [showPicker, setShowPicker] = useState(false);

  return (
    <View gap={8}>
      <Text
        fontSize={14}
        fontWeight="500"
        color="$mutedForeground">
        {t('kanban.task.dueDateLabel') || 'Due Date'}
      </Text>
      <Pressable
        onPress={() => {
          setShowPicker(true);
        }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: SPACE_BETWEEN,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: theme.borderColor.val,
          backgroundColor: theme.card.val,
          padding: 12,
        }}>
        <Text color="$color">{dueDate == null ? 'Set due date' : format(dueDate, 'MMM d, yyyy')}</Text>
        <Image
          source="sf:calendar"
          style={{ width: 16, height: 16 }}
          tintColor="gray"
        />
      </Pressable>
      {showPicker &&
        (Platform.OS === 'ios' ? (
          <View
            marginTop={8}
            borderRadius={8}
            backgroundColor="$card"
            padding={8}>
            <DateTimePicker
              value={dueDate ?? today}
              mode="date"
              display="inline"
              minimumDate={today}
              onChange={(_event, date) => {
                if (date) {
                  onChange(date);
                }
              }}
            />
            <Pressable
              onPress={() => {
                setShowPicker(false);
              }}
              style={{ alignItems: 'center', padding: 8 }}>
              <Text
                fontWeight="500"
                color="$primary">
                Done
              </Text>
            </Pressable>
          </View>
        ) : (
          <DateTimePicker
            value={dueDate ?? today}
            mode="date"
            display="default"
            minimumDate={today}
            onChange={(_event, date) => {
              setShowPicker(false);
              if (date) {
                onChange(date);
              }
            }}
          />
        ))}
    </View>
  );
};
