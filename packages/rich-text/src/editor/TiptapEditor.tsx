/**
 * Tiptap-based rich text editor for web
 *
 * Uses extracted utilities:
 * - getEditorCSS() for ProseMirror styles (theme-aware CSS custom properties)
 * - getEditorStateFromTiptap() for state mapping
 * - RichEditorContext for styling context
 * - BubbleToolbar for inline formatting on text selection
 */

import { clampRadiusForLargeComponent } from '@repo/forms';
import { menuRowFrame, useResolvedKnobs } from '@repo/theme';
import { isWeb } from '@tamagui/constants';
import { useEditor, EditorContent } from '@tiptap/react';
import { forwardRef, memo, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, getTokens, styled, useTheme, useThemeName } from 'tamagui';

import { RichEditorContext } from '../context';
import { t } from '../shared/t';
import { BubbleToolbar } from '../toolbar/BubbleToolbar';
import { CodeBlockBubble } from '../toolbar/CodeBlockBubble';
import { ImageBubble } from '../toolbar/ImageBubble';
import { LinkBubble } from '../toolbar/LinkBubble';
import { MathBubble } from '../toolbar/MathBubble';
import { TableBubble } from '../toolbar/TableBubble';
import type { RichEditorProps, RichEditorRef, EditorCommand } from '../types';
import { defaultEditorState } from '../types';

import { isCommandInCapabilities } from './capabilities';
import { setPreviewChrome } from './codeBlockPreview';
import { getEditorCSS } from './editorStyles';
import { buildEditorExtensions } from './extensions';
import { htmlToMarkdown, markdownToHtml } from './markdown';
import { createMentionExtension } from './mentions';
import { cleanPastedHtml } from './pasteCleanup';
import { fallbackSuggestionChrome } from './suggestionPopup';
import type { SuggestionChrome } from './suggestionPopup';
import { getEditorStateFromTiptap } from './useEditorState';

/** Enter/exit fade for bubbles and suggestion popups (0 when animation none) */
const MOTION_MS = 120;

// ===========================================================================
// Types
// ===========================================================================

export interface TiptapEditorProps extends RichEditorProps {
  /** Show the bubble toolbar on text selection (web only) */
  showBubbleToolbar?: boolean;
  /** CSS font-family string for body text (resolved from knobs) */
  bodyFontFamily?: string;
  /** CSS font-family string for headings (resolved from knobs) */
  headingFontFamily?: string;
  /** Current editing mode: richtext (WYSIWYG) or markdown (raw source) */
  editorMode?: 'richtext' | 'markdown';
  /** Fullscreen mode: content fills the flex parent and scrolls internally */
  fullscreen?: boolean;
}

// ===========================================================================
// Styled Container
// ===========================================================================

const EditorContainer = styled(View, {
  name: 'TiptapEditorContainer',
  flex: 1,
  minHeight: 150,
  overflow: 'hidden',
});

// ===========================================================================
// TiptapEditor
// ===========================================================================

export const TiptapEditor = memo(
  forwardRef<RichEditorRef, TiptapEditorProps>(
    (
      {
        capabilities = 'full',
        initialContent = '',
        initialJSON,
        placeholder: placeholderProp,
        editable = true,
        autoFocus = false,
        onChange,
        onStateChange,
        onFocus,
        onBlur,
        minHeight = 150,
        maxHeight,
        hasError: _hasError,
        showBubbleToolbar = false,
        bodyFontFamily,
        headingFontFamily,
        editorMode = 'richtext',
        fullscreen = false,
        onImageUpload,
        onFileUpload,
        mentions,
      },
      ref,
    ) => {
      const _ctx = RichEditorContext.useStyledContext();
      const placeholder = placeholderProp ?? t('Start writing...');
      const internalRef = useRef<RichEditorRef>(null);
      const stateRafRef = useRef<number>(0);
      const changeRafRef = useRef<number>(0);
      const onStateChangeRef = useRef(onStateChange);
      const onChangeRef = useRef(onChange);
      const [markdownSource, setMarkdownSource] = useState('');
      const prevModeRef = useRef(editorMode);
      const theme = useTheme();
      const themeName = useThemeName();
      const { knobProps } = useResolvedKnobs();
      const motionMs = knobProps.transition === undefined ? 0 : MOTION_MS;
      const scopeClass = `rt-scope-${useId().replaceAll(/[^a-zA-Z0-9-]/g, '')}`;

      // Mention wiring is captured at mount (the extension list is fixed);
      // the items function stays live through this ref.
      const mentionsRef = useRef(mentions);
      mentionsRef.current = mentions;
      const [mentionExtension] = useState(() =>
        mentions
          ? createMentionExtension({
              trigger: mentions.trigger,
              items: (query) => mentionsRef.current?.items(query) ?? [],
            })
          : null,
      );

      useEffect(() => {
        onStateChangeRef.current = onStateChange;
        onChangeRef.current = onChange;
      });

      // Capability surface is fixed at mount (extension lists cannot swap
      // live); the canonical list comes from the one factory the capability
      // specs also verify (LC-52).
      const [extensions] = useState(() => buildEditorExtensions({ capabilities, placeholder, mentionExtension }));

      const editor = useEditor({
        extensions,
        // In markdown capabilities the incoming string IS markdown
        content: initialJSON ?? (capabilities === 'markdown' ? markdownToHtml(initialContent) : initialContent),
        editable,
        autofocus: autoFocus,
        // No htmlFor target exists for the contenteditable — name it directly
        // (axe aria-input-field-name); placeholder doubles as the name.
        editorProps: {
          attributes: {
            role: 'textbox',
            'aria-multiline': 'true',
            'aria-label': placeholder || t('Rich text editor'),
          },
          // Strip Google Docs / Word clipboard junk before ProseMirror parses
          transformPastedHTML: cleanPastedHtml,
        },
        injectCSS: false,
        immediatelyRender: false,
        shouldRerenderOnTransaction: false,
        onUpdate: ({ editor }) => {
          cancelAnimationFrame(changeRafRef.current);
          changeRafRef.current = requestAnimationFrame(() => {
            const html = editor.getHTML();
            const json = editor.getJSON();
            // Markdown capabilities serialize the content OUT as markdown —
            // the host's value stays a markdown string end to end.
            onChangeRef.current?.(capabilities === 'markdown' ? htmlToMarkdown(html) : html, json);
          });
        },
        onTransaction: ({ editor }) => {
          cancelAnimationFrame(stateRafRef.current);
          stateRafRef.current = requestAnimationFrame(() => {
            onStateChangeRef.current?.(getEditorStateFromTiptap(editor));
          });
        },
        onFocus: () => onFocus?.(),
        onBlur: () => onBlur?.(),
      });

      // Keep upload handlers live in editor storage (paste/drop + slash image)
      useEffect(() => {
        if (!editor) {
          return;
        }
        editor.storage.mediaUpload.handlers = { onImageUpload, onFileUpload };
      }, [editor, onImageUpload, onFileUpload]);

      // Push resolved theme + knob chrome for the DOM-portaled suggestion
      // popups (slash / mention): every color and structural role arrives
      // resolved -- the popups never invent their own values.
      useEffect(() => {
        if (!editor) {
          return;
        }
        const radiusToken = clampRadiusForLargeComponent(knobProps.borderRadius.borderRadius, 4);
        const radiusValue =
          typeof radiusToken === 'number'
            ? radiusToken
            : ((getTokens().radius as any)?.[radiusToken]?.val ?? fallbackSuggestionChrome.radius);
        // LC-16: the DOM popup rows share menuRowFrame geometry — resolve
        // its paddingHorizontal token to px here (theme scope) and push it.
        const rowPadToken = menuRowFrame.paddingHorizontal as string;
        const rowPaddingX = (getTokens().space as any)?.[rowPadToken]?.val ?? fallbackSuggestionChrome.rowPaddingX;
        // Elevation rides the theme's scheme-aware shadow tokens (Axiom 5) —
        // the same channel the popover family resolves, never a raw rgba.
        const shadowMain = theme.shadow2?.val;
        const shadowSoft = theme.shadow1?.val;
        const chrome: SuggestionChrome = {
          background: theme.background?.val ?? fallbackSuggestionChrome.background,
          borderColor: theme.borderColor?.val ?? fallbackSuggestionChrome.borderColor,
          activeBackground: theme.color4?.val ?? fallbackSuggestionChrome.activeBackground,
          iconTileBackground: theme.color3?.val ?? fallbackSuggestionChrome.iconTileBackground,
          titleColor: theme.color12?.val ?? fallbackSuggestionChrome.titleColor,
          descriptionColor: theme.color11?.val ?? fallbackSuggestionChrome.descriptionColor,
          radius: typeof radiusValue === 'number' ? radiusValue : fallbackSuggestionChrome.radius,
          shadow:
            shadowMain && shadowSoft
              ? `0px 8px 28px ${shadowMain}, 0px 2px 6px ${shadowSoft}`
              : fallbackSuggestionChrome.shadow,
          motionMs,
          rowPaddingX: typeof rowPaddingX === 'number' ? rowPaddingX : fallbackSuggestionChrome.rowPaddingX,
        };
        editor.storage.suggestionChrome.value = chrome;
      }, [editor, theme, knobProps.borderRadius.borderRadius, motionMs]);

      // Push the resolved color scheme for block previews (mermaid/math):
      // the node views subscribe and re-render diagrams on a theme flip.
      useEffect(() => {
        if (!editor) {
          return;
        }
        setPreviewChrome(editor, {
          scheme: String(themeName).startsWith('dark') ? 'dark' : 'light',
          fontFamily: bodyFontFamily,
        });
      }, [editor, themeName, bodyFontFamily]);

      useEffect(() => {
        if (!editor) {
          return;
        }
        if (prevModeRef.current === editorMode) {
          return;
        }
        prevModeRef.current = editorMode;

        if (editorMode === 'markdown') {
          setMarkdownSource(htmlToMarkdown(editor.getHTML()));
        } else {
          editor.commands.setContent(markdownToHtml(markdownSource));
        }
      }, [editorMode, editor, markdownSource]);

      const handleMarkdownChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
          const md = e.target.value;
          setMarkdownSource(md);
          // Markdown capabilities emit the markdown source itself; the full
          // surface keeps its HTML onChange contract.
          onChangeRef.current?.(capabilities === 'markdown' ? md : markdownToHtml(md), null);
        },
        [capabilities],
      );

      const executeCommand = useCallback(
        (command: EditorCommand, payload?: any) => {
          if (!editor) {
            return;
          }
          // Capability guard: outside the surface the command's extension is
          // not registered, so the chained method would not even exist.
          if (!isCommandInCapabilities(command, capabilities)) {
            return;
          }

          const chain = editor.chain().focus();

          switch (command) {
            case 'bold': {
              chain.toggleBold().run();
              break;
            }
            case 'italic': {
              chain.toggleItalic().run();
              break;
            }
            case 'underline': {
              chain.toggleUnderline().run();
              break;
            }
            case 'strike': {
              chain.toggleStrike().run();
              break;
            }
            case 'code': {
              chain.toggleCode().run();
              break;
            }
            case 'subscript': {
              chain.toggleSubscript().run();
              break;
            }
            case 'superscript': {
              chain.toggleSuperscript().run();
              break;
            }
            case 'heading1': {
              chain.toggleHeading({ level: 1 }).run();
              break;
            }
            case 'heading2': {
              chain.toggleHeading({ level: 2 }).run();
              break;
            }
            case 'heading3': {
              chain.toggleHeading({ level: 3 }).run();
              break;
            }
            case 'heading4': {
              chain.toggleHeading({ level: 4 }).run();
              break;
            }
            case 'heading5': {
              chain.toggleHeading({ level: 5 }).run();
              break;
            }
            case 'heading6': {
              chain.toggleHeading({ level: 6 }).run();
              break;
            }
            case 'paragraph': {
              chain.setParagraph().run();
              break;
            }
            case 'bulletList': {
              chain.toggleBulletList().run();
              break;
            }
            case 'orderedList': {
              chain.toggleOrderedList().run();
              break;
            }
            case 'taskList': {
              chain.toggleTaskList().run();
              break;
            }
            case 'image': {
              if (payload?.src) {
                chain.setImage({ src: payload.src, alt: payload.alt ?? '' }).run();
              }
              break;
            }
            case 'blockquote': {
              chain.toggleBlockquote().run();
              break;
            }
            case 'codeBlock': {
              chain.toggleCodeBlock().run();
              break;
            }
            case 'link': {
              if (payload?.href) {
                if (editor.state.selection.empty && !editor.isActive('link')) {
                  // GitLab parity: with nothing selected, insert the URL
                  // itself as linked text instead of silently no-oping
                  chain
                    .insertContent({
                      type: 'text',
                      text: payload.text ?? payload.href,
                      marks: [{ type: 'link', attrs: { href: payload.href } }],
                    })
                    .run();
                } else {
                  // Cursor inside an existing link updates the whole link
                  chain.extendMarkRange('link').setLink({ href: payload.href }).run();
                }
              } else {
                chain.extendMarkRange('link').unsetLink().run();
              }
              break;
            }
            case 'undo': {
              chain.undo().run();
              break;
            }
            case 'redo': {
              chain.redo().run();
              break;
            }
            case 'alignLeft': {
              chain.setTextAlign('left').run();
              break;
            }
            case 'alignCenter': {
              chain.setTextAlign('center').run();
              break;
            }
            case 'alignRight': {
              chain.setTextAlign('right').run();
              break;
            }
            case 'alignJustify': {
              chain.setTextAlign('justify').run();
              break;
            }
            case 'textColor': {
              if (payload?.color) {
                chain.setColor(payload.color).run();
              } else {
                chain.unsetColor().run();
              }
              break;
            }
            case 'highlight': {
              if (payload?.color) {
                chain.setHighlight({ color: payload.color }).run();
              } else {
                chain.unsetHighlight().run();
              }
              break;
            }
            case 'horizontalRule': {
              chain.setHorizontalRule().run();
              break;
            }
            case 'clearFormatting': {
              chain.unsetAllMarks().clearNodes().run();
              break;
            }
            case 'insertTable': {
              chain
                .insertTable({
                  rows: payload?.rows ?? 3,
                  cols: payload?.cols ?? 3,
                  withHeaderRow: payload?.withHeaderRow ?? true,
                })
                .run();
              break;
            }
            case 'addColumnBefore': {
              chain.addColumnBefore().run();
              break;
            }
            case 'addColumnAfter': {
              chain.addColumnAfter().run();
              break;
            }
            case 'deleteColumn': {
              chain.deleteColumn().run();
              break;
            }
            case 'addRowBefore': {
              chain.addRowBefore().run();
              break;
            }
            case 'addRowAfter': {
              chain.addRowAfter().run();
              break;
            }
            case 'deleteRow': {
              chain.deleteRow().run();
              break;
            }
            case 'deleteTable': {
              chain.deleteTable().run();
              break;
            }
            case 'mergeCells': {
              chain.mergeCells().run();
              break;
            }
            case 'splitCell': {
              chain.splitCell().run();
              break;
            }
            case 'toggleHeaderRow': {
              chain.toggleHeaderRow().run();
              break;
            }
          }
        },
        [editor],
      );

      const refMethods = useMemo<RichEditorRef>(
        () => ({
          executeCommand,
          getState: () => getEditorStateFromTiptap(editor),
          getHTML: () => editor?.getHTML() ?? '',
          getJSON: () => editor?.getJSON() ?? null,
          getMarkdown: () => htmlToMarkdown(editor?.getHTML() ?? ''),
          // External value sync (not a user edit): emitUpdate false so the
          // host's own set does not echo back through onChange.
          setHTML: (html: string) => editor?.commands.setContent(html, { emitUpdate: false }),
          setJSON: (json: any) => editor?.commands.setContent(json, { emitUpdate: false }),
          setMarkdown: (markdown: string) =>
            editor?.commands.setContent(markdownToHtml(markdown), { emitUpdate: false }),
          focus: () => editor?.commands.focus(),
          blur: () => editor?.commands.blur(),
        }),
        [editor, executeCommand],
      );

      useImperativeHandle(ref, () => refMethods, [refMethods]);
      (internalRef as any).current = refMethods;

      const editorCSS = useMemo(
        () =>
          getEditorCSS({
            minHeight,
            maxHeight,
            bodyFontFamily,
            headingFontFamily,
            fullscreen,
            motionMs,
            scopeClass,
          }),
        [minHeight, maxHeight, bodyFontFamily, headingFontFamily, fullscreen, motionMs, scopeClass],
      );

      if (editorMode === 'markdown') {
        return (
          <EditorContainer
            minHeight={fullscreen ? 0 : minHeight}
            maxHeight={fullscreen ? undefined : maxHeight}
            overflow="hidden">
            <textarea
              value={markdownSource}
              onChange={handleMarkdownChange}
              aria-label={t('Markdown source')}
              style={{
                width: '100%',
                minHeight: fullscreen ? 0 : minHeight,
                maxHeight: fullscreen ? undefined : (maxHeight ?? undefined),
                flex: fullscreen ? '1 1 0%' : undefined,
                padding: '12px 12px 12px 16px',
                border: 'none',
                outline: 'none',
                resize: 'none',
                background: 'transparent',
                color: 'inherit',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: '0.875em',
                lineHeight: '1.6',
                overflow: 'auto',
                boxSizing: 'border-box',
              }}
              spellCheck={false}
            />
          </EditorContainer>
        );
      }

      return (
        <EditorContainer
          className={scopeClass}
          minHeight={fullscreen ? 0 : minHeight}
          maxHeight={fullscreen ? undefined : maxHeight}
          overflow="hidden">
          {isWeb && <style>{editorCSS}</style>}
          {showBubbleToolbar && (
            <>
              <BubbleToolbar
                editor={editor}
                editorRef={internalRef}
                state={defaultEditorState}
                capabilities={capabilities}
              />
              <LinkBubble editor={editor} />
              <CodeBlockBubble editor={editor} />
              <ImageBubble editor={editor} />
              <TableBubble
                editor={editor}
                capabilities={capabilities}
              />
            </>
          )}
          {/* Always mounted (unlike the optional bubbles): it is the ONLY
              edit path for inline math atoms — without it a typed `$x$`
              node would be a dead end. Markdown capabilities have no inline
              math node, so the bubble has nothing to edit and stays out. */}
          {editable && capabilities !== 'markdown' && <MathBubble editor={editor} />}
          <EditorContent
            editor={editor}
            style={fullscreen ? { flex: '1 1 0%', minHeight: 0, overflowY: 'auto' } : undefined}
          />
        </EditorContainer>
      );
    },
  ),
);

TiptapEditor.displayName = 'TiptapEditor';
