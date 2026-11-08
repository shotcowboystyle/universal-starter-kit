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
import type { MentionItem } from '@repo/forms';
import { menuRowFrame, useResolvedKnobs } from '@repo/theme';
import { isWeb } from '@tamagui/constants';
import type { ChainedCommands, Editor, JSONContent } from '@tiptap/react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { CSSProperties, ForwardedRef } from 'react';
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
import { setPreviewChrome } from './code-block-preview';
import { getEditorCSS } from './editor-styles';
import { buildEditorExtensions } from './extensions';
import { htmlToMarkdown, markdownToHtml } from './markdown';
import { createMentionExtension } from './mentions';
import { cleanPastedHtml } from './paste-cleanup';
import { fallbackSuggestionChrome } from './suggestion-popup';
import type { SuggestionChrome } from './suggestion-popup';
import { getEditorStateFromTiptap } from './use-editor-state';

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
// Commands
// ===========================================================================

/** The payload fields `executeCommand` reads (callers pass plain objects). */
interface CommandPayload {
  src?: string;
  alt?: string;
  href?: string;
  text?: string;
  color?: string | null;
  rows?: number;
  cols?: number;
  withHeaderRow?: boolean;
}

/** Runs a command on a focused chain; returns the chain's `run()` result. */
type CommandRunner = (chain: ChainedCommands, payload: CommandPayload, editor: Editor) => boolean;

const isFilled = (value: string | null | undefined): value is string =>
  value !== undefined && value !== null && value !== '';

const runLink: CommandRunner = (chain, { href, text }, editor) => {
  if (!isFilled(href)) {
    return chain.extendMarkRange('link').unsetLink().run();
  }
  if (editor.state.selection.empty && !editor.isActive('link')) {
    // GitLab parity: with nothing selected, insert the URL
    // itself as linked text instead of silently no-oping
    return chain
      .insertContent({
        type: 'text',
        text: text ?? href,
        marks: [{ type: 'link', attrs: { href } }],
      })
      .run();
  }
  // Cursor inside an existing link updates the whole link
  return chain.extendMarkRange('link').setLink({ href }).run();
};

const COMMAND_RUNNERS: Record<EditorCommand, CommandRunner> = {
  bold: (chain) => chain.toggleBold().run(),
  italic: (chain) => chain.toggleItalic().run(),
  underline: (chain) => chain.toggleUnderline().run(),
  strike: (chain) => chain.toggleStrike().run(),
  code: (chain) => chain.toggleCode().run(),
  subscript: (chain) => chain.toggleSubscript().run(),
  superscript: (chain) => chain.toggleSuperscript().run(),
  heading1: (chain) => chain.toggleHeading({ level: 1 }).run(),
  heading2: (chain) => chain.toggleHeading({ level: 2 }).run(),
  heading3: (chain) => chain.toggleHeading({ level: 3 }).run(),
  heading4: (chain) => chain.toggleHeading({ level: 4 }).run(),
  heading5: (chain) => chain.toggleHeading({ level: 5 }).run(),
  heading6: (chain) => chain.toggleHeading({ level: 6 }).run(),
  paragraph: (chain) => chain.setParagraph().run(),
  bulletList: (chain) => chain.toggleBulletList().run(),
  orderedList: (chain) => chain.toggleOrderedList().run(),
  taskList: (chain) => chain.toggleTaskList().run(),
  image: (chain, { src, alt }) => isFilled(src) && chain.setImage({ src, alt: alt ?? '' }).run(),
  blockquote: (chain) => chain.toggleBlockquote().run(),
  codeBlock: (chain) => chain.toggleCodeBlock().run(),
  link: runLink,
  undo: (chain) => chain.undo().run(),
  redo: (chain) => chain.redo().run(),
  alignLeft: (chain) => chain.setTextAlign('left').run(),
  alignCenter: (chain) => chain.setTextAlign('center').run(),
  alignRight: (chain) => chain.setTextAlign('right').run(),
  alignJustify: (chain) => chain.setTextAlign('justify').run(),
  textColor: (chain, { color }) => (isFilled(color) ? chain.setColor(color).run() : chain.unsetColor().run()),
  highlight: (chain, { color }) =>
    isFilled(color) ? chain.setHighlight({ color }).run() : chain.unsetHighlight().run(),
  horizontalRule: (chain) => chain.setHorizontalRule().run(),
  clearFormatting: (chain) => chain.unsetAllMarks().clearNodes().run(),
  insertTable: (chain, { rows = 3, cols = 3, withHeaderRow = true }) =>
    chain.insertTable({ rows, cols, withHeaderRow }).run(),
  addColumnBefore: (chain) => chain.addColumnBefore().run(),
  addColumnAfter: (chain) => chain.addColumnAfter().run(),
  deleteColumn: (chain) => chain.deleteColumn().run(),
  addRowBefore: (chain) => chain.addRowBefore().run(),
  addRowAfter: (chain) => chain.addRowAfter().run(),
  deleteRow: (chain) => chain.deleteRow().run(),
  deleteTable: (chain) => chain.deleteTable().run(),
  mergeCells: (chain) => chain.mergeCells().run(),
  splitCell: (chain) => chain.splitCell().run(),
  toggleHeaderRow: (chain) => chain.toggleHeaderRow().run(),
};

// ===========================================================================
// Suggestion popup chrome
// ===========================================================================

/** A tamagui token scale or theme: Variables keyed by name. */
type VariableRecord = Record<string, { val?: unknown } | undefined>;

/** Resolves a numeric size or a token name on `scale` to px. */
const resolvePx = (scale: VariableRecord, token: number | string, fallback: number): number => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- knob tokens are either raw px numbers or token names
  const value = typeof token === 'number' ? token : scale[token]?.val;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- token Variables carry untyped `val`s from the tamagui config
  return typeof value === 'number' ? value : fallback;
};

/** A tamagui theme: colour / shadow Variables keyed by theme key. */
type ThemeRecord = Record<string, { val?: string } | undefined>;

const buildSuggestionChrome = (
  theme: ThemeRecord,
  radiusToken: number | string,
  motionMs: number,
): SuggestionChrome => {
  const tokens = getTokens();
  const color = (key: string, fallback: string): string => theme[key]?.val ?? fallback;
  // Elevation rides the theme's scheme-aware shadow tokens (Axiom 5) —
  // the same channel the popover family resolves, never a raw rgba.
  const shadowMain = theme.shadow2?.val;
  const shadowSoft = theme.shadow1?.val;
  const hasShadows = isFilled(shadowMain) && isFilled(shadowSoft);
  return {
    background: color('background', fallbackSuggestionChrome.background),
    borderColor: color('borderColor', fallbackSuggestionChrome.borderColor),
    activeBackground: color('color4', fallbackSuggestionChrome.activeBackground),
    iconTileBackground: color('color3', fallbackSuggestionChrome.iconTileBackground),
    titleColor: color('color12', fallbackSuggestionChrome.titleColor),
    descriptionColor: color('color11', fallbackSuggestionChrome.descriptionColor),
    // SAFETY: tamagui token scales are records of Variables keyed by token name.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    radius: resolvePx(tokens.radius as VariableRecord, radiusToken, fallbackSuggestionChrome.radius),
    shadow: hasShadows ? `0px 8px 28px ${shadowMain}, 0px 2px 6px ${shadowSoft}` : fallbackSuggestionChrome.shadow,
    motionMs,
    // LC-16: the DOM popup rows share menuRowFrame geometry — resolve
    // its paddingHorizontal token to px here (theme scope) and push it.
    // SAFETY: tamagui token scales are records of Variables keyed by token name.
    rowPaddingX: resolvePx(
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      tokens.space as VariableRecord,
      menuRowFrame.paddingHorizontal,
      fallbackSuggestionChrome.rowPaddingX,
    ),
  };
};

// ===========================================================================
// Markdown source view
// ===========================================================================

const MARKDOWN_TEXTAREA_STYLE: CSSProperties = {
  width: '100%',
  padding: '12px 12px 12px 16px',
  border: 'none',
  // The rich-text surface also drops the native ring (editor-styles); both
  // modes share the container chrome instead.
  outline: 'none',
  resize: 'none',
  background: 'transparent',
  color: 'inherit',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '0.875em',
  lineHeight: '1.6',
  overflow: 'auto',
  boxSizing: 'border-box',
};

interface MarkdownSourceViewProps {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  fullscreen: boolean;
  minHeight: number;
  maxHeight: number | undefined;
}

const MarkdownSourceView = ({ value, onChange, fullscreen, minHeight, maxHeight }: MarkdownSourceViewProps) => (
  <EditorContainer
    minHeight={fullscreen ? 0 : minHeight}
    maxHeight={fullscreen ? undefined : maxHeight}
    overflow="hidden">
    <textarea
      value={value}
      onChange={onChange}
      aria-label={t('Markdown source')}
      style={{
        ...MARKDOWN_TEXTAREA_STYLE,
        minHeight: fullscreen ? 0 : minHeight,
        maxHeight: fullscreen ? undefined : maxHeight,
        flex: fullscreen ? '1 1 0%' : undefined,
      }}
      spellCheck={false}
    />
  </EditorContainer>
);

// ===========================================================================
// TiptapEditor
// ===========================================================================

interface EditorOverlaysProps {
  editor: Editor | null;
  editorRef: React.RefObject<RichEditorRef | null>;
  capabilities: NonNullable<TiptapEditorProps['capabilities']>;
  showBubbleToolbar: boolean;
  editable: boolean;
}

/** The selection bubbles plus the always-on math bubble. */
const EditorOverlays = ({ editor, editorRef, capabilities, showBubbleToolbar, editable }: EditorOverlaysProps) => (
  <>
    {showBubbleToolbar && (
      <>
        <BubbleToolbar
          editor={editor}
          editorRef={editorRef}
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
  </>
);

/**
 * Mention wiring is captured at mount (the extension list is fixed); the
 * items function stays live through a ref.
 */
const useMentionExtension = (mentions: TiptapEditorProps['mentions']) => {
  const mentionsRef = useRef(mentions);
  // oxlint-disable-next-line react/refs -- latest-value ref, written every render by design
  mentionsRef.current = mentions;
  // oxlint-disable-next-line react/hook-use-state, react/refs -- mount-time constant, never set; the ref is read only when the popup queries
  const [mentionExtension] = useState(() =>
    mentions
      ? createMentionExtension({
          trigger: mentions.trigger,
          items: (query): MentionItem[] | Promise<MentionItem[]> => mentionsRef.current?.items(query) ?? [],
        })
      : null,
  );
  return mentionExtension;
};

const TiptapEditorBase = (
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
  }: TiptapEditorProps,
  ref: ForwardedRef<RichEditorRef>,
) => {
  RichEditorContext.useStyledContext();
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
  const scopeClass = `rt-scope-${useId().replaceAll(/[^a-zA-Z0-9-]/gu, '')}`;

  const mentionExtension = useMentionExtension(mentions);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
    onChangeRef.current = onChange;
  });

  // Capability surface is fixed at mount (extension lists cannot swap
  // live); the canonical list comes from the one factory the capability
  // specs also verify (LC-52).
  // oxlint-disable-next-line react/hook-use-state -- mount-time constant, never set
  const [extensions] = useState(() => buildEditorExtensions({ capabilities, placeholder, mentionExtension }));

  const editor = useEditor({
    extensions,
    // In markdown capabilities the incoming string IS markdown
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- `initialJSON` is untyped ProseMirror JSON (public API)
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
    onUpdate: ({ editor: instance }) => {
      cancelAnimationFrame(changeRafRef.current);
      changeRafRef.current = requestAnimationFrame(() => {
        const html = instance.getHTML();
        const json = instance.getJSON();
        // Markdown capabilities serialize the content OUT as markdown —
        // the host's value stays a markdown string end to end.
        onChangeRef.current?.(capabilities === 'markdown' ? htmlToMarkdown(html) : html, json);
      });
    },
    onTransaction: ({ editor: instance }) => {
      cancelAnimationFrame(stateRafRef.current);
      stateRafRef.current = requestAnimationFrame(() => {
        onStateChangeRef.current?.(getEditorStateFromTiptap(instance));
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
    // oxlint-disable-next-line react/immutability -- extension storage is the editor's own mutable state, synced from an effect
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
    // SAFETY: a tamagui theme is a record of Variables keyed by theme key.
    const chrome = buildSuggestionChrome(theme as ThemeRecord, radiusToken, motionMs);
    // oxlint-disable-next-line react/immutability -- extension storage is the editor's own mutable state, synced from an effect
    editor.storage.suggestionChrome.value = chrome;
  }, [editor, theme, knobProps.borderRadius.borderRadius, motionMs]);

  // Push the resolved color scheme for block previews (mermaid/math):
  // the node views subscribe and re-render diagrams on a theme flip.
  useEffect(() => {
    if (!editor) {
      return;
    }
    setPreviewChrome(editor, {
      scheme: themeName.startsWith('dark') ? 'dark' : 'light',
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
      // oxlint-disable-next-line react/set-state-in-effect -- snapshots the external editor's HTML at the moment of the mode switch
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
    (command: EditorCommand, payload?: CommandPayload) => {
      if (!editor) {
        return;
      }
      // Capability guard: outside the surface the command's extension is
      // not registered, so the chained method would not even exist.
      if (!isCommandInCapabilities(command, capabilities)) {
        return;
      }
      COMMAND_RUNNERS[command](editor.chain().focus(), payload ?? {}, editor);
    },
    [editor, capabilities],
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
      setHTML: (html: string) => {
        editor?.commands.setContent(html, { emitUpdate: false });
      },
      setJSON: (json: JSONContent) => {
        editor?.commands.setContent(json, { emitUpdate: false });
      },
      setMarkdown: (markdown: string) => {
        editor?.commands.setContent(markdownToHtml(markdown), { emitUpdate: false });
      },
      focus: () => {
        editor?.commands.focus();
      },
      blur: () => {
        // oxlint-disable-next-line github/no-blur -- tiptap's blur command (RichEditorRef API), not element.blur()
        editor?.commands.blur();
      },
    }),
    [editor, executeCommand],
  );

  useImperativeHandle(ref, () => refMethods, [refMethods]);
  // The bubble toolbar drives commands through this ref (set before any
  // user interaction can reach the toolbar).
  useImperativeHandle(internalRef, () => refMethods, [refMethods]);

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
      <MarkdownSourceView
        value={markdownSource}
        onChange={handleMarkdownChange}
        fullscreen={fullscreen}
        minHeight={minHeight}
        maxHeight={maxHeight}
      />
    );
  }

  return (
    <EditorContainer
      className={scopeClass}
      minHeight={fullscreen ? 0 : minHeight}
      maxHeight={fullscreen ? undefined : maxHeight}
      overflow="hidden">
      {isWeb && <style>{editorCSS}</style>}
      <EditorOverlays
        editor={editor}
        editorRef={internalRef}
        capabilities={capabilities}
        showBubbleToolbar={showBubbleToolbar}
        editable={editable}
      />
      <EditorContent
        editor={editor}
        style={fullscreen ? { flex: '1 1 0%', minHeight: 0, overflowY: 'auto' } : undefined}
      />
    </EditorContainer>
  );
};

export const TiptapEditor = memo(forwardRef<RichEditorRef, TiptapEditorProps>(TiptapEditorBase));

TiptapEditor.displayName = 'TiptapEditor';
