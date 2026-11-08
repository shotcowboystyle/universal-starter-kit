/**
 * Color picker popover for text color and highlight color
 */

import { PresetSwatches } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import { PopoverContent } from '@repo/ui';
import { useCallback, useState } from 'react';
import { Popover, Text, YStack, useThemeName } from 'tamagui';

import { TEXT_COLORS, TEXT_COLORS_DARK, HIGHLIGHT_COLORS } from '../constants';
import type { ColorEntry } from '../constants';
import { t } from '../shared/t';
import type { EditorState, RichEditorRef } from '../types';

import { TextColorIcon, HighlightIcon } from './icons';
import { ToolbarButton } from './ToolbarButton';

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

// ===========================================================================
// ColorGrid — titled wrapper around the forms PresetSwatches grid
// ===========================================================================

const ColorGrid = ({
  title,
  colors,
  selectedColor,
  onSelect,
  maxWidth,
}: {
  title: string;
  colors: ColorEntry[];
  selectedColor: string | null;
  onSelect: (color: string | null) => void;
  maxWidth: number;
}) => {
  const { knobProps } = useResolvedKnobs();
  return (
    <YStack {...knobProps.gap}>
      <Text
        fontSize={knobProps.sizeToken}
        fontWeight="600">
        {title}
      </Text>
      <PresetSwatches
        presetColors={colors.map((c) => ({ ...c, name: t(c.name) }))}
        selectedColor={selectedColor}
        onSelect={onSelect}
        width={maxWidth}
      />
    </YStack>
  );
};

const TEXT_COLOR = 'Text Color';

// ===========================================================================
// TextColorPicker
// ===========================================================================

export const TextColorPicker = ({ editorRef, state, disabled }: ColorPickerProps) => {
  const { knobProps } = useResolvedKnobs();
  const themeName = useThemeName();
  const textColors = themeName.startsWith('dark') ? TEXT_COLORS_DARK : TEXT_COLORS;
  const [open, setOpen] = useState(false);

  // DISMISS-BY-INTENT (LC-19): swatch click applies the color live; the popup
  // stays open so the user can try several. Outside click / Escape dismisses.
  const handleSelect = useCallback(
    (color: string | null) => {
      editorRef.current?.executeCommand('textColor', { color });
    },
    [editorRef],
  );

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottom-start">
      <Popover.Trigger asChild>
        <ToolbarButton
          active={Boolean(state.textColor)}
          disabled={disabled}
          onPress={() => {
            setOpen(true);
          }}
          aria-label={t(TEXT_COLOR)}
          tooltip={t(TEXT_COLOR)}>
          <TextColorIcon color={state.textColor} />
        </ToolbarButton>
      </Popover.Trigger>
      <PopoverContent {...knobProps.panelPadding}>
        <Popover.Arrow
          borderColor="$borderColor"
          backgroundColor="$background"
        />
        <ColorGrid
          title={t(TEXT_COLOR)}
          colors={textColors}
          selectedColor={state.textColor}
          onSelect={handleSelect}
          maxWidth={160}
        />
      </PopoverContent>
    </Popover>
  );
};

// ===========================================================================
// HighlightColorPicker
// ===========================================================================

export const HighlightColorPicker = ({ editorRef, state, disabled }: ColorPickerProps) => {
  const { knobProps } = useResolvedKnobs();
  const [open, setOpen] = useState(false);

  // DISMISS-BY-INTENT (LC-19): keep the popup open across swatch selections.
  const handleSelect = useCallback(
    (color: string | null) => {
      editorRef.current?.executeCommand('highlight', { color });
    },
    [editorRef],
  );

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottom-start">
      <Popover.Trigger asChild>
        <ToolbarButton
          active={Boolean(state.highlightColor)}
          disabled={disabled}
          onPress={() => {
            setOpen(true);
          }}
          aria-label={t('Highlight Color')}
          tooltip={t('Highlight')}>
          <HighlightIcon color={state.highlightColor} />
        </ToolbarButton>
      </Popover.Trigger>
      <PopoverContent {...knobProps.panelPadding}>
        <Popover.Arrow
          borderColor="$borderColor"
          backgroundColor="$background"
        />
        <ColorGrid
          title={t('Highlight')}
          colors={HIGHLIGHT_COLORS}
          selectedColor={state.highlightColor}
          onSelect={handleSelect}
          maxWidth={130}
        />
      </PopoverContent>
    </Popover>
  );
};
