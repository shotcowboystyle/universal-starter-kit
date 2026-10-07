/**
 * Fixed toolbar for the rich text editor (native)
 *
 * Same interface as web version but uses NATIVE_SUPPORTED_COMMANDS to hide
 * unsupported features entirely (not show disabled buttons).
 * Uses React Native ScrollView horizontal instead of CSS-based scroll.
 */

import { ScrollView } from '@repo/ui';
import { useCallback } from 'react';
import { Text, XStack } from 'tamagui';

import { NATIVE_SUPPORTED_COMMANDS } from '../constants';
import { t } from '../shared/t';
import { ToolbarFrame } from '../styled';
import type { EditorCommand, EditorState, RichEditorRef, ToolbarSection } from '../types';
import { defaultEditorState } from '../types';

import { TextColorPicker, HighlightColorPicker } from './ColorPicker';
import {
  UndoIcon,
  RedoIcon,
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  StrikeIcon,
  AlignLeftIcon,
  AlignCenterIcon,
  AlignRightIcon,
  AlignJustifyIcon,
  BlockquoteIcon,
  ClearFormattingIcon,
} from './icons';
import { ImageDialog } from './ImageDialog';
import { LinkDialog } from './LinkDialog';
import { ToolbarButton } from './ToolbarButton';
import { ToolbarGroup } from './ToolbarGroup';

// ===========================================================================
// Types
// ===========================================================================

export interface FixedToolbarProps {
  /** Reference to the editor */
  editorRef: React.RefObject<RichEditorRef | null>;
  /** Current editor state */
  state?: EditorState;
  /** Toolbar sections to show (shows all when omitted) */
  sections?: ToolbarSection[];
  /** Whether the toolbar has an error state */
  hasError?: boolean;
  /**
   * Which edge the toolbar docks to (default: "top"). "bottom" flips the
   * hairline to the top edge -- used by the fullscreen modal where the
   * toolbar rides above the keyboard.
   */
  docked?: 'top' | 'bottom';
  /** Interface parity with web (native fullscreen is the modal; no toggle button) */
  fullscreen?: boolean;
  /** Interface parity with web (ignored on native) */
  onFullscreenToggle?: () => void;
}

// ===========================================================================
// Helpers
// ===========================================================================

function isSectionVisible(section: ToolbarSection, sections?: ToolbarSection[]): boolean {
  if (!sections) {
    return true;
  }
  return sections.includes(section);
}

/**
 * Checks if a command is supported on native (10Tap).
 * Unsupported commands are hidden entirely rather than shown disabled.
 */
function isNativeSupported(command: EditorCommand): boolean {
  return NATIVE_SUPPORTED_COMMANDS[command];
}

/**
 * Checks if any command in a group is supported on native.
 * If no commands in a section are supported, the entire section is hidden.
 */
function hasAnySupportedCommand(commands: EditorCommand[]): boolean {
  return commands.some(isNativeSupported);
}

// ===========================================================================
// FixedToolbar (Native)
// ===========================================================================

export function FixedToolbar({
  editorRef,
  state = defaultEditorState,
  sections,
  hasError,
  docked = 'top',
}: FixedToolbarProps) {
  const executeCommand = useCallback(
    (command: EditorCommand, payload?: any) => {
      editorRef.current?.executeCommand(command, payload);
    },
    [editorRef],
  );

  const visible = (section: ToolbarSection) => isSectionVisible(section, sections);

  // History commands: undo, redo
  const historyVisible = visible('history') && hasAnySupportedCommand(['undo', 'redo']);

  // Formatting commands (hide unsupported: subscript, superscript)
  const formattingVisible =
    visible('formatting') && hasAnySupportedCommand(['bold', 'italic', 'underline', 'strike', 'code']);

  // Color commands: textColor, highlight
  const colorVisible = visible('color') && hasAnySupportedCommand(['textColor', 'highlight']);

  // Heading commands
  const headingVisible =
    visible('heading') && hasAnySupportedCommand(['heading1', 'heading2', 'heading3', 'paragraph']);

  // Alignment commands (not supported on native)
  const alignmentVisible =
    visible('alignment') && hasAnySupportedCommand(['alignLeft', 'alignCenter', 'alignRight', 'alignJustify']);

  // List commands
  const listVisible = visible('list') && hasAnySupportedCommand(['bulletList', 'orderedList', 'taskList']);

  // Block commands (blockquote supported, codeBlock/horizontalRule not)
  const blockVisible = visible('block') && hasAnySupportedCommand(['blockquote', 'codeBlock', 'horizontalRule']);

  // Link
  const linkVisible = visible('link') && isNativeSupported('link');

  // Image
  const imageVisible = visible('image') && isNativeSupported('image');

  // Clear formatting (not supported on native)
  const clearVisible = visible('clear') && isNativeSupported('clearFormatting');

  return (
    <ToolbarFrame
      hasError={hasError}
      {...(docked === 'bottom' && {
        borderBottomWidth: 0,
        borderTopWidth: 1,
        borderTopColor: hasError ? '$red10' : ('$color6' as any),
      })}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 8, gap: 2 }}>
        <XStack
          alignItems="center"
          gap={4}>
          {/* History */}
          <ToolbarGroup visible={historyVisible}>
            {isNativeSupported('undo') && (
              <ToolbarButton
                disabled={!state.canUndo}
                onPress={() => {
                  executeCommand('undo');
                }}
                aria-label={t('Undo')}>
                <UndoIcon />
              </ToolbarButton>
            )}
            {isNativeSupported('redo') && (
              <ToolbarButton
                disabled={!state.canRedo}
                onPress={() => {
                  executeCommand('redo');
                }}
                aria-label={t('Redo')}>
                <RedoIcon />
              </ToolbarButton>
            )}
          </ToolbarGroup>

          {/* Formatting (hide subscript, superscript on native) */}
          <ToolbarGroup visible={formattingVisible}>
            {isNativeSupported('bold') && (
              <ToolbarButton
                active={state.isBold}
                onPress={() => {
                  executeCommand('bold');
                }}
                aria-label={t('Bold')}>
                <BoldIcon>B</BoldIcon>
              </ToolbarButton>
            )}
            {isNativeSupported('italic') && (
              <ToolbarButton
                active={state.isItalic}
                onPress={() => {
                  executeCommand('italic');
                }}
                aria-label={t('Italic')}>
                <ItalicIcon>I</ItalicIcon>
              </ToolbarButton>
            )}
            {isNativeSupported('underline') && (
              <ToolbarButton
                active={state.isUnderline}
                onPress={() => {
                  executeCommand('underline');
                }}
                aria-label={t('Underline')}>
                <UnderlineIcon>U</UnderlineIcon>
              </ToolbarButton>
            )}
            {isNativeSupported('strike') && (
              <ToolbarButton
                active={state.isStrike}
                onPress={() => {
                  executeCommand('strike');
                }}
                aria-label={t('Strikethrough')}>
                <StrikeIcon>S</StrikeIcon>
              </ToolbarButton>
            )}
            {isNativeSupported('code') && (
              <ToolbarButton
                active={state.isCode}
                onPress={() => {
                  executeCommand('code');
                }}
                aria-label={t('Code')}>
                <Text>{'</>'}</Text>
              </ToolbarButton>
            )}
            {/* subscript and superscript are NOT supported on native -- hidden entirely */}
          </ToolbarGroup>

          {/* Color — must open a picker; bare textColor/highlight with no
              payload is a no-op at best and historically wiped Tentap content
              when ColorBridge received an undefined setColor. */}
          <ToolbarGroup visible={colorVisible}>
            {isNativeSupported('textColor') && (
              <TextColorPicker
                editorRef={editorRef}
                state={state}
              />
            )}
            {isNativeSupported('highlight') && (
              <HighlightColorPicker
                editorRef={editorRef}
                state={state}
              />
            )}
          </ToolbarGroup>

          {/* Heading */}
          <ToolbarGroup visible={headingVisible}>
            {isNativeSupported('heading1') && (
              <ToolbarButton
                active={state.isHeading1}
                onPress={() => {
                  executeCommand('heading1');
                }}
                aria-label={t('Heading 1')}>
                <Text fontWeight="700">H1</Text>
              </ToolbarButton>
            )}
            {isNativeSupported('heading2') && (
              <ToolbarButton
                active={state.isHeading2}
                onPress={() => {
                  executeCommand('heading2');
                }}
                aria-label={t('Heading 2')}>
                <Text fontWeight="600">H2</Text>
              </ToolbarButton>
            )}
            {isNativeSupported('heading3') && (
              <ToolbarButton
                active={state.isHeading3}
                onPress={() => {
                  executeCommand('heading3');
                }}
                aria-label={t('Heading 3')}>
                <Text fontWeight="600">H3</Text>
              </ToolbarButton>
            )}
          </ToolbarGroup>

          {/* Alignment (not supported on native -- entire group hidden) */}
          <ToolbarGroup visible={alignmentVisible}>
            {isNativeSupported('alignLeft') && (
              <ToolbarButton
                active={state.textAlign === 'left'}
                onPress={() => {
                  executeCommand('alignLeft');
                }}
                aria-label={t('Align Left')}>
                <AlignLeftIcon />
              </ToolbarButton>
            )}
            {isNativeSupported('alignCenter') && (
              <ToolbarButton
                active={state.textAlign === 'center'}
                onPress={() => {
                  executeCommand('alignCenter');
                }}
                aria-label={t('Align Center')}>
                <AlignCenterIcon />
              </ToolbarButton>
            )}
            {isNativeSupported('alignRight') && (
              <ToolbarButton
                active={state.textAlign === 'right'}
                onPress={() => {
                  executeCommand('alignRight');
                }}
                aria-label={t('Align Right')}>
                <AlignRightIcon />
              </ToolbarButton>
            )}
            {isNativeSupported('alignJustify') && (
              <ToolbarButton
                active={state.textAlign === 'justify'}
                onPress={() => {
                  executeCommand('alignJustify');
                }}
                aria-label={t('Justify')}>
                <AlignJustifyIcon />
              </ToolbarButton>
            )}
          </ToolbarGroup>

          {/* List */}
          <ToolbarGroup visible={listVisible}>
            {isNativeSupported('bulletList') && (
              <ToolbarButton
                active={state.isBulletList}
                onPress={() => {
                  executeCommand('bulletList');
                }}
                aria-label={t('Bullet List')}>
                <Text>•</Text>
              </ToolbarButton>
            )}
            {isNativeSupported('orderedList') && (
              <ToolbarButton
                active={state.isOrderedList}
                onPress={() => {
                  executeCommand('orderedList');
                }}
                aria-label={t('Ordered List')}>
                <Text>1.</Text>
              </ToolbarButton>
            )}
            {isNativeSupported('taskList') && (
              <ToolbarButton
                active={state.isTaskList}
                onPress={() => {
                  executeCommand('taskList');
                }}
                aria-label={t('Task List')}>
                <Text>[ ]</Text>
              </ToolbarButton>
            )}
          </ToolbarGroup>

          {/* Block (only blockquote is supported on native) */}
          <ToolbarGroup visible={blockVisible}>
            {isNativeSupported('blockquote') && (
              <ToolbarButton
                active={state.isBlockquote}
                onPress={() => {
                  executeCommand('blockquote');
                }}
                aria-label={t('Blockquote')}>
                <BlockquoteIcon />
              </ToolbarButton>
            )}
            {/* codeBlock and horizontalRule are NOT supported on native -- hidden entirely */}
          </ToolbarGroup>

          {/* Link (modal dialog -- a bare "link" command has no href and is a no-op) */}
          <ToolbarGroup visible={linkVisible}>
            <LinkDialog
              editorRef={editorRef}
              state={state}
            />
          </ToolbarGroup>

          {/* Image (modal dialog -- a bare "image" command has no src and is a no-op) */}
          <ToolbarGroup
            visible={imageVisible}
            showSeparator={!clearVisible}>
            <ImageDialog editorRef={editorRef} />
          </ToolbarGroup>

          {/* Clear formatting (not supported on native -- hidden entirely) */}
          <ToolbarGroup
            visible={clearVisible}
            showSeparator={false}>
            <ToolbarButton
              onPress={() => {
                executeCommand('clearFormatting');
              }}
              aria-label={t('Clear Formatting')}>
              <ClearFormattingIcon />
            </ToolbarButton>
          </ToolbarGroup>
        </XStack>
      </ScrollView>
    </ToolbarFrame>
  );
}
