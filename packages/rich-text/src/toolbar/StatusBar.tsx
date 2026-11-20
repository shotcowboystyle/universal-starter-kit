/**
 * Status bar footer showing word/character count and a rich-text / markdown toggle.
 */

import { XStack, Text } from 'tamagui';

import { t } from '../shared/t';
import type { EditorMode, EditorState } from '../types';

export interface StatusBarProps {
  state: EditorState;
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
}

const ModeButton = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
  <Text
    fontSize={11}
    color={active ? '$color12' : '$color11'}
    fontWeight={active ? '600' : '400'}
    cursor="pointer"
    onPress={onPress}
    hoverStyle={{ color: '$color11' }}
    userSelect="none">
    {label}
  </Text>
);

export const StatusBar = ({ state, mode, onModeChange }: StatusBarProps) => (
  <XStack
    borderTopWidth={1}
    borderTopColor="$color5"
    paddingHorizontal="$3"
    paddingVertical="$1.5"
    justifyContent="space-between"
    alignItems="center">
    <XStack
      gap="$1.5"
      alignItems="center">
      <ModeButton
        label={t('Rich text')}
        active={mode === 'richtext'}
        onPress={() => {
          onModeChange('richtext');
        }}
      />
      <Text
        fontSize={11}
        color="$color8">
        |
      </Text>
      <ModeButton
        label={t('Markdown')}
        active={mode === 'markdown'}
        onPress={() => {
          onModeChange('markdown');
        }}
      />
    </XStack>
    <XStack gap="$3">
      <Text
        fontSize={11}
        color="$color11">
        {state.wordCount === 1
          ? t('{{count}} word', { count: state.wordCount })
          : t('{{count}} words', { count: state.wordCount })}
      </Text>
      <Text
        fontSize={11}
        color="$color11">
        {state.characterCount === 1
          ? t('{{count}} character', { count: state.characterCount })
          : t('{{count}} characters', { count: state.characterCount })}
      </Text>
    </XStack>
  </XStack>
);
