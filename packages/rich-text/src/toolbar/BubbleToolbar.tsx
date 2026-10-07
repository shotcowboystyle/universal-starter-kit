/**
 * Bubble toolbar for the rich text editor (web only)
 *
 * Uses Tiptap 3's BubbleMenu to show inline formatting controls
 * when text is selected. Contains only inline formatting:
 * Bold, Italic, Underline, Strike, Code, Subscript, Superscript,
 * Text Color, Highlight, Link.
 *
 * No headings, lists, alignment -- those stay in the fixed toolbar.
 * No native equivalent (10Tap does not support floating menus).
 */

import { useResolvedKnobs } from '@repo/theme';
import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { XStack } from 'tamagui';

import { isCommandInCapabilities } from '../editor/capabilities';
import { t } from '../shared/t';
import type { EditorCapabilities, EditorState, RichEditorRef } from '../types';
import { defaultEditorState } from '../types';

import { TextColorPicker, HighlightColorPicker } from './ColorPicker';
import {
  BoldIcon,
  InlineCodeIcon,
  ItalicIcon,
  UnderlineIcon,
  StrikeIcon,
  SubscriptIcon,
  SuperscriptIcon,
} from './icons';
import { LinkDialog } from './LinkDialog';
import { SHORTCUTS } from './shortcuts';
import { ToolbarButton } from './ToolbarButton';

// ===========================================================================
// Types
// ===========================================================================

export interface BubbleToolbarProps {
  /** Direct Tiptap editor instance (not through ref) */
  editor: Editor | null;
  /** Reference to the editor for executeCommand */
  editorRef: React.RefObject<RichEditorRef | null>;
  /** Current editor state */
  state?: EditorState;
  /** Capability surface — markdown hides non-markdown controls (default "full") */
  capabilities?: EditorCapabilities;
}

// ===========================================================================
// BubbleToolbar
// ===========================================================================

export function BubbleToolbar({
  editor,
  editorRef,
  state = defaultEditorState,
  capabilities = 'full',
}: BubbleToolbarProps) {
  const { knobProps } = useResolvedKnobs();
  const has = (command: Parameters<typeof isCommandInCapabilities>[0]) =>
    isCommandInCapabilities(command, capabilities);

  if (!editor) {
    return null;
  }

  return (
    <BubbleMenu
      editor={editor}
      className="rt-bubble-menu"
      shouldShow={({ editor: e, from, to }) => {
        if (from === to) {
          return false;
        }
        if (e.isActive('codeBlock')) {
          return false;
        }
        if (e.isActive('image')) {
          return false;
        }
        return true;
      }}>
      <XStack
        backgroundColor="$background"
        borderWidth={1}
        borderColor="$borderColor"
        borderRadius={knobProps.borderRadius.borderRadius}
        padding="$1"
        gap={2}
        alignItems="center"
        elevation={knobProps.elevation}>
        {/* Inline formatting only */}
        <ToolbarButton
          active={state.isBold}
          onPress={() => editorRef.current?.executeCommand('bold')}
          aria-label={t('Bold')}
          tooltip={SHORTCUTS.bold}>
          <BoldIcon>B</BoldIcon>
        </ToolbarButton>

        <ToolbarButton
          active={state.isItalic}
          onPress={() => editorRef.current?.executeCommand('italic')}
          aria-label={t('Italic')}
          tooltip={SHORTCUTS.italic}>
          <ItalicIcon>I</ItalicIcon>
        </ToolbarButton>

        {has('underline') && (
          <ToolbarButton
            active={state.isUnderline}
            onPress={() => editorRef.current?.executeCommand('underline')}
            aria-label={t('Underline')}
            tooltip={SHORTCUTS.underline}>
            <UnderlineIcon>U</UnderlineIcon>
          </ToolbarButton>
        )}

        <ToolbarButton
          active={state.isStrike}
          onPress={() => editorRef.current?.executeCommand('strike')}
          aria-label={t('Strikethrough')}
          tooltip={SHORTCUTS.strike}>
          <StrikeIcon>S</StrikeIcon>
        </ToolbarButton>

        <ToolbarButton
          active={state.isCode}
          onPress={() => editorRef.current?.executeCommand('code')}
          aria-label={t('Code')}
          tooltip={SHORTCUTS.code}>
          <InlineCodeIcon />
        </ToolbarButton>

        {has('subscript') && (
          <ToolbarButton
            active={state.isSubscript}
            onPress={() => editorRef.current?.executeCommand('subscript')}
            aria-label={t('Subscript')}
            tooltip={SHORTCUTS.subscript}>
            <SubscriptIcon />
          </ToolbarButton>
        )}

        {has('superscript') && (
          <ToolbarButton
            active={state.isSuperscript}
            onPress={() => editorRef.current?.executeCommand('superscript')}
            aria-label={t('Superscript')}
            tooltip={SHORTCUTS.superscript}>
            <SuperscriptIcon />
          </ToolbarButton>
        )}

        {/* Color pickers — no markdown syntax (LC-52) */}
        {has('textColor') && (
          <TextColorPicker
            editorRef={editorRef}
            state={state}
          />
        )}
        {has('highlight') && (
          <HighlightColorPicker
            editorRef={editorRef}
            state={state}
          />
        )}

        {/* Link */}
        <LinkDialog
          editorRef={editorRef}
          state={state}
        />
      </XStack>
    </BubbleMenu>
  );
}
