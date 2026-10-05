import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useResolvedKnobs } from '@repo/theme';
/**
 * OS date/time sheet — iOS spinner/calendar, Android Material dialog.
 *
 * Catalog DatePicker/TimePicker/DatetimePicker on web keep the house calendar
 * and time panel. On native those controls are the ones users expect: the
 * iOS 14+ inline calendar, the time *wheel*, and Android's dialog. This
 * sheet is the shared chrome so the three fields do not each invent a Modal.
 *
 * `native={false}` on a field skips this and keeps the catalog overlay.
 */
import { useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet, useColorScheme, Platform } from 'react-native';
import { Text, View, XStack, YStack, useTheme, useThemeName } from 'tamagui';

import { formCommonColors } from '../../shared/colorRamps';
import { t } from '../../shared/t';

import { osDateTimeIosDisplay } from './osDateTimeIosDisplay';

export type OsDateTimeMode = 'date' | 'time' | 'datetime';

export interface OsDateTimeSheetProps {
  open: boolean;
  value: Date;
  mode: OsDateTimeMode;
  minDate?: Date;
  maxDate?: Date;
  onCancel: () => void;
  onConfirm: (value: Date) => void;
}

function useNativePickerScheme(): 'light' | 'dark' {
  const themeName = useThemeName();
  const osScheme = useColorScheme();
  if (themeName) {
    return String(themeName).startsWith('dark') ? 'dark' : 'light';
  }
  return osScheme === 'dark' ? 'dark' : 'light';
}

export function OsDateTimeSheet({ open, value, mode, minDate, maxDate, onCancel, onConfirm }: OsDateTimeSheetProps) {
  const { knobProps } = useResolvedKnobs();
  const themeVariant = useNativePickerScheme();
  const theme = useTheme();
  const accentColor = theme.accentBackground?.val;
  const isIOS = Platform.OS === 'ios';
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [temp, setTemp] = useState(value);
  const pickerMode: 'date' | 'time' = mode === 'time' || (mode === 'datetime' && showTimePicker) ? 'time' : 'date';
  const iosDisplay = osDateTimeIosDisplay(pickerMode);

  const reset = useCallback(() => {
    setShowTimePicker(false);
    setTemp(value);
  }, [value]);

  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setTemp(value);
    setShowTimePicker(false);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  function handleAndroidChange(event: DateTimePickerEvent, selected?: Date) {
    if (event.type === 'dismissed') {
      reset();
      onCancel();
      return;
    }
    if (event.type !== 'set' || !selected) {
      return;
    }
    if (mode === 'datetime' && !showTimePicker) {
      setTemp(selected);
      setShowTimePicker(true);
      return;
    }
    const picked =
      mode === 'datetime'
        ? new Date(
            temp.getFullYear(),
            temp.getMonth(),
            temp.getDate(),
            selected.getHours(),
            selected.getMinutes(),
            selected.getSeconds(),
          )
        : selected;
    onConfirm(picked);
    reset();
  }

  function handleIOSChange(_event: DateTimePickerEvent, selected?: Date) {
    if (!selected) {
      return;
    }
    if (mode === 'datetime' && showTimePicker) {
      setTemp(
        new Date(
          temp.getFullYear(),
          temp.getMonth(),
          temp.getDate(),
          selected.getHours(),
          selected.getMinutes(),
          selected.getSeconds(),
        ),
      );
      return;
    }
    setTemp(selected);
  }

  function confirm() {
    onConfirm(temp);
    reset();
  }

  if (!open) {
    return null;
  }

  if (!isIOS) {
    return (
      <DateTimePicker
        value={temp}
        mode={pickerMode}
        display="default"
        onChange={handleAndroidChange}
        minimumDate={mode !== 'time' ? minDate : undefined}
        maximumDate={mode !== 'time' ? maxDate : undefined}
      />
    );
  }

  return (
    <Modal transparent animationType="fade" visible={open} onRequestClose={onCancel}>
      <Pressable style={styles.modalOverlay} onPress={onCancel}>
        <View
          pointerEvents="none"
          position="absolute"
          top={0}
          right={0}
          bottom={0}
          left={0}
          backgroundColor="$shadow6"
        />
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
          }}>
          <YStack {...knobProps.elevatedSurface} borderBottomLeftRadius={0} borderBottomRightRadius={0}>
            <XStack justifyContent="space-between" {...knobProps.panelPadding}>
              <Pressable onPress={onCancel} accessibilityRole="button">
                <Text color={formCommonColors.text}>{t('Cancel')}</Text>
              </Pressable>
              {mode === 'datetime' && !showTimePicker ? (
                <Pressable
                  onPress={() => {
                    setShowTimePicker(true);
                  }}
                  accessibilityRole="button">
                  <Text color="$accentBackground">{t('Next')}</Text>
                </Pressable>
              ) : (
                <Pressable onPress={confirm} accessibilityRole="button">
                  <Text color="$accentBackground">{t('Done')}</Text>
                </Pressable>
              )}
            </XStack>
            <YStack {...knobProps.panelPadding}>
              <DateTimePicker
                value={temp}
                mode={pickerMode}
                display={iosDisplay}
                themeVariant={themeVariant}
                accentColor={accentColor}
                onChange={handleIOSChange}
                minimumDate={mode !== 'time' ? minDate : undefined}
                maximumDate={mode !== 'time' ? maxDate : undefined}
                style={pickerMode === 'time' ? styles.wheel : styles.calendar}
              />
            </YStack>
          </YStack>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  wheel: { height: 216 },
  calendar: { height: 360 },
});
