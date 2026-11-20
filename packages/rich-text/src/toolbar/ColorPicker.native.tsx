/**
 * Color picker for text color and highlight (native)
 *
 * Must NOT use a second RN Modal / FloatingPanel here: the fullscreen editor
 * is already a Modal, and nesting another Modal on iOS dismisses the parent
 * (SB-N-ios-25 wipe looked like "Text Color cleared the doc" because Cancel
 * via onRequestClose ran). ActionSheetIOS / Android Alert stay in-process.
 */

import { useCallback, useMemo } from 'react';
import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { useTheme, useThemeName } from 'tamagui';

import { TEXT_COLOR_TOKENS, TEXT_COLOR_TOKENS_DARK, HIGHLIGHT_COLOR_TOKENS } from '../constants';
import type { ColorEntry, ColorTokenEntry } from '../constants';
import { t } from '../shared/t';
import type { EditorState, RichEditorRef } from '../types';

import { TextColorIcon, HighlightIcon } from './icons';
import { ToolbarButton } from './ToolbarButton';

/**
 * Resolves palette theme tokens to concrete color values via the active
 * theme (Axiom 5 ONE SOURCE): RN and the 10Tap webview cannot resolve CSS
 * custom properties, so the native picker applies resolved values.
 */
const useResolvedPalette = (entries: ColorTokenEntry[]): ColorEntry[] => {
  const theme = useTheme();
  return useMemo(
    () =>
      entries.map(({ name, token }) => {
        // SAFETY: palette tokens are theme keys whose variables carry a string `val`; a missing key is undefined.
        const variable = token === null ? undefined : (theme[token] as { val?: string } | undefined);
        return { name, value: variable?.val ?? null };
      }),
    [entries, theme],
  );
};

// ===========================================================================
// Types
// ===========================================================================

export interface ColorPickerProps {
  /** Reference to the editor */
  editorRef: React.RefObject<RichEditorRef | null>;
  /** Current editor state */
  state: EditorState;
  /** Whether the picker is disabled */
  disabled?: boolean;
}

const pickColor = (title: string, colors: ColorEntry[], onSelect: (color: string | null) => void) => {
  const labels = colors.map((c) => t(c.name));
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...labels, t('Cancel')],
        cancelButtonIndex: labels.length,
      },
      (index) => {
        if (index >= labels.length) {
          return;
        }
        onSelect(colors[index]?.value ?? null);
      },
    );
    return;
  }
  Alert.alert(title, undefined, [
    ...colors.map((c) => ({
      text: t(c.name),
      onPress: () => {
        onSelect(c.value);
      },
    })),
    { text: t('Cancel'), style: 'cancel' as const },
  ]);
};

// ===========================================================================
// TextColorPicker
// ===========================================================================

export const TextColorPicker = ({ editorRef, state, disabled }: ColorPickerProps) => {
  const themeName = useThemeName();
  // Same tokens both schemes; only the neutral ink's honest label flips
  const textColors = useResolvedPalette(themeName.startsWith('dark') ? TEXT_COLOR_TOKENS_DARK : TEXT_COLOR_TOKENS);

  const handlePress = useCallback(() => {
    pickColor(t('Text Color'), textColors, (color) => {
      editorRef.current?.executeCommand('textColor', { color });
    });
  }, [editorRef, textColors]);

  return (
    <ToolbarButton
      active={Boolean(state.textColor)}
      disabled={disabled}
      onPress={handlePress}
      aria-label={t('Text Color')}>
      <TextColorIcon color={state.textColor} />
    </ToolbarButton>
  );
};

// ===========================================================================
// HighlightColorPicker
// ===========================================================================

export const HighlightColorPicker = ({ editorRef, state, disabled }: ColorPickerProps) => {
  const highlightColors = useResolvedPalette(HIGHLIGHT_COLOR_TOKENS);
  const handlePress = useCallback(() => {
    pickColor(t('Highlight'), highlightColors, (color) => {
      editorRef.current?.executeCommand('highlight', { color });
    });
  }, [editorRef, highlightColors]);

  return (
    <ToolbarButton
      active={Boolean(state.highlightColor)}
      disabled={disabled}
      onPress={handlePress}
      aria-label={t('Highlight Color')}>
      <HighlightIcon color={state.highlightColor} />
    </ToolbarButton>
  );
};
