/**
 * Fixed toolbar for the rich text editor (web)
 *
 * Primary groups (always visible):
 *   History | Bold, Italic, Underline, Strike | Color | Heading | List | Blockquote, Code Block | Link, Image
 *
 * Overflow ("More" dropdown):
 *   Subscript, Superscript | Alignment | Horizontal Rule, Clear Formatting
 */

import { useCallback, useEffect, useRef } from 'react';
import { XStack } from 'tamagui';

import { isCommandInCapabilities } from '../editor/capabilities';
import { t } from '../shared/t';
import { ToolbarFrame } from '../styled';
import type { EditorCapabilities, EditorState, RichEditorRef, ToolbarSection } from '../types';
import { defaultEditorState } from '../types';

import { TextColorPicker, HighlightColorPicker } from './ColorPicker';
import { HeadingPicker } from './HeadingPicker';
import {
  UndoIcon,
  RedoIcon,
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  StrikeIcon,
  BlockquoteIcon,
  CodeBlockIcon,
  ExpandIcon,
  CompressIcon,
} from './icons';
import { ImageDialog } from './ImageDialog';
import { LinkDialog } from './LinkDialog';
import { ListPicker } from './ListPicker';
import { MoreDropdown } from './MoreDropdown';
import { SHORTCUTS } from './shortcuts';
import { ToolbarButton } from './ToolbarButton';
import { ToolbarGroup } from './ToolbarGroup';
import { useHorizontalScroll, useHorizontalScrollArrows, HorizontalScrollArrow } from './useHorizontalScroll';
import { useRovingFocus } from './useRovingFocus';

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
  /** Capability surface — markdown hides non-markdown controls (default "full") */
  capabilities?: EditorCapabilities;
  /** Whether the toolbar has an error state */
  hasError?: boolean;
  /** Whether the editor is in fullscreen mode */
  fullscreen?: boolean;
  /** Shows a fullscreen toggle at the toolbar's right end when provided */
  onFullscreenToggle?: () => void;
  /** Native only: which edge the toolbar docks to (ignored on web) */
  docked?: 'top' | 'bottom';
  /** Controlled link-dialog open state (Mod+K wiring; internal when omitted) */
  linkDialogOpen?: boolean;
  /** Called when the link-dialog open state changes */
  onLinkDialogOpenChange?: (open: boolean) => void;
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

// ===========================================================================
// FixedToolbar
// ===========================================================================

export function FixedToolbar({
  editorRef,
  state = defaultEditorState,
  sections,
  capabilities = 'full',
  hasError,
  fullscreen,
  onFullscreenToggle,
  linkDialogOpen,
  onLinkDialogOpenChange,
}: FixedToolbarProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const { arrowLeft, arrowRight, arrowScrollDirRef, updateArrows } = useHorizontalScrollArrows();

  useHorizontalScroll(scrollerRef);
  // WAI-ARIA toolbar pattern: one tab stop, arrows move between controls
  useRovingFocus(scrollerRef);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) {
      return;
    }

    const handleUpdate = () => {
      updateArrows(el);
    };
    handleUpdate();

    el.addEventListener('scroll', handleUpdate);
    const resizeObserver = new ResizeObserver(handleUpdate);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener('scroll', handleUpdate);
      resizeObserver.disconnect();
    };
  }, [updateArrows]);

  const executeCommand = useCallback(
    (command: string, payload?: any) => {
      editorRef.current?.executeCommand(command as any, payload);
    },
    [editorRef],
  );

  const visible = (section: ToolbarSection) => isSectionVisible(section, sections);

  return (
    <ToolbarFrame hasError={hasError}>
      <style>
        {`
          .toolbar-scroller {
            flex: 1;
            overflow-x: auto;
            overflow-y: hidden;
            scrollbar-width: none;
            -ms-overflow-style: none;
          }
          .toolbar-scroller::-webkit-scrollbar {
            display: none;
          }
        `}
      </style>
      <HorizontalScrollArrow
        direction="left"
        scrollRef={scrollerRef}
        visible={arrowLeft}
        arrowScrollDirRef={arrowScrollDirRef}
      />
      <div
        ref={scrollerRef}
        className="toolbar-scroller"
        role="toolbar"
        aria-label={t('Formatting toolbar')}
        aria-orientation="horizontal">
        <XStack
          alignItems="center"
          gap="$1"
          paddingHorizontal="$2">
          {/* History */}
          <ToolbarGroup visible={visible('history')}>
            <ToolbarButton
              disabled={!state.canUndo}
              onPress={() => {
                executeCommand('undo');
              }}
              aria-label={t('Undo')}
              tooltip={SHORTCUTS.undo}>
              <UndoIcon />
            </ToolbarButton>
            <ToolbarButton
              disabled={!state.canRedo}
              onPress={() => {
                executeCommand('redo');
              }}
              aria-label={t('Redo')}
              tooltip={SHORTCUTS.redo}>
              <RedoIcon />
            </ToolbarButton>
          </ToolbarGroup>

          {/* Formatting */}
          <ToolbarGroup visible={visible('formatting')}>
            <ToolbarButton
              active={state.isBold}
              onPress={() => {
                executeCommand('bold');
              }}
              aria-label={t('Bold')}
              tooltip={SHORTCUTS.bold}>
              <BoldIcon>B</BoldIcon>
            </ToolbarButton>
            <ToolbarButton
              active={state.isItalic}
              onPress={() => {
                executeCommand('italic');
              }}
              aria-label={t('Italic')}
              tooltip={SHORTCUTS.italic}>
              <ItalicIcon>I</ItalicIcon>
            </ToolbarButton>
            {isCommandInCapabilities('underline', capabilities) && (
              <ToolbarButton
                active={state.isUnderline}
                onPress={() => {
                  executeCommand('underline');
                }}
                aria-label={t('Underline')}
                tooltip={SHORTCUTS.underline}>
                <UnderlineIcon>U</UnderlineIcon>
              </ToolbarButton>
            )}
            <ToolbarButton
              active={state.isStrike}
              onPress={() => {
                executeCommand('strike');
              }}
              aria-label={t('Strikethrough')}
              tooltip={SHORTCUTS.strike}>
              <StrikeIcon>S</StrikeIcon>
            </ToolbarButton>
          </ToolbarGroup>

          {/* Color — no markdown syntax for color/highlight (LC-52) */}
          <ToolbarGroup visible={visible('color') && isCommandInCapabilities('textColor', capabilities)}>
            <TextColorPicker
              editorRef={editorRef}
              state={state}
            />
            <HighlightColorPicker
              editorRef={editorRef}
              state={state}
            />
          </ToolbarGroup>

          {/* Heading */}
          <ToolbarGroup visible={visible('heading')}>
            <HeadingPicker
              editorRef={editorRef}
              state={state}
            />
          </ToolbarGroup>

          {/* List */}
          <ToolbarGroup visible={visible('list')}>
            <ListPicker
              editorRef={editorRef}
              state={state}
            />
          </ToolbarGroup>

          {/* Block */}
          <ToolbarGroup visible={visible('block')}>
            <ToolbarButton
              active={state.isBlockquote}
              onPress={() => {
                executeCommand('blockquote');
              }}
              aria-label={t('Blockquote')}
              tooltip={SHORTCUTS.blockquote}>
              <BlockquoteIcon />
            </ToolbarButton>
            <ToolbarButton
              active={state.isCodeBlock}
              onPress={() => {
                executeCommand('codeBlock');
              }}
              aria-label={t('Code Block')}
              tooltip={SHORTCUTS.codeBlock}>
              <CodeBlockIcon />
            </ToolbarButton>
          </ToolbarGroup>

          {/* Link */}
          <ToolbarGroup visible={visible('link')}>
            <LinkDialog
              editorRef={editorRef}
              state={state}
              open={linkDialogOpen}
              onOpenChange={onLinkDialogOpenChange}
            />
          </ToolbarGroup>

          {/* Image */}
          <ToolbarGroup visible={visible('image')}>
            <ImageDialog editorRef={editorRef} />
          </ToolbarGroup>

          {/* More (overflow): sub/superscript, alignment, hr, clear */}
          <ToolbarGroup
            visible={!sections || sections.some((s) => ['formatting', 'alignment', 'clear', 'block'].includes(s))}
            showSeparator={false}>
            <MoreDropdown
              editorRef={editorRef}
              state={state}
              capabilities={capabilities}
            />
          </ToolbarGroup>
        </XStack>
      </div>
      <HorizontalScrollArrow
        direction="right"
        scrollRef={scrollerRef}
        visible={arrowRight}
        arrowScrollDirRef={arrowScrollDirRef}
      />
      {onFullscreenToggle && (
        <XStack
          alignItems="center"
          paddingHorizontal="$1">
          <ToolbarButton
            active={fullscreen}
            onPress={onFullscreenToggle}
            aria-label={t('Fullscreen')}
            aria-pressed={!!fullscreen}
            tooltip={fullscreen ? t('Exit fullscreen (Esc)') : t('Fullscreen')}>
            {fullscreen ? <CompressIcon /> : <ExpandIcon />}
          </ToolbarButton>
        </XStack>
      )}
    </ToolbarFrame>
  );
}
