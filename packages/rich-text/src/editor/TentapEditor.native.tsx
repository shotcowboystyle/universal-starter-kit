/**
 * 10Tap-based rich text editor for React Native
 *
 * Rebuilt to properly use 10Tap bridge extensions:
 * - ColorBridge for text color
 * - HighlightBridge for highlight/background color
 * - ImageBridge for image insertion
 * - TaskListBridge for task lists
 *
 * Uses getEditorStateFromBridge() for state mapping and
 * RichEditorContext for styling from the compound component.
 *
 * No BubbleToolbar (10Tap does not support floating menus).
 */

import {
  RichText,
  useEditorBridge,
  TenTapStartKit,
  UnderlineBridge,
  LinkBridge,
  PlaceholderBridge,
  ColorBridge,
  HighlightBridge,
  ImageBridge,
  TaskListBridge,
  darkEditorCss,
  darkEditorTheme,
} from '@10play/tentap-editor';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import type { ForwardedRef } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { View, getConfig, getVariableValue, useTheme, useThemeName } from 'tamagui';

import { PALETTE_THEME_TOKENS } from '../constants';
import { RichEditorContext } from '../context';
import { t } from '../shared/t';
import type { RichEditorProps, RichEditorRef, EditorCommand } from '../types';

import { getEditorCSS } from './editorStyles';
import { htmlToMarkdown, markdownToHtml } from './markdown';
import { escapeNativeEditorCSS } from './nativeEditorCSS';
import { getEditorStateFromBridge } from './useEditorState';

type EditorScheme = 'light' | 'dark';

function useNativeEditorScheme() {
  const themeName = String(useThemeName() || '');
  const osScheme = useColorScheme();
  const scheme: EditorScheme = themeName
    ? themeName.startsWith('dark')
      ? 'dark'
      : 'light'
    : osScheme === 'dark'
      ? 'dark'
      : 'light';
  return { themeName: themeName || scheme, scheme, followsAppearance: osScheme === scheme };
}

function paletteDecls(read: (token: string) => unknown): string {
  return PALETTE_THEME_TOKENS.flatMap((token) => {
    const value = read(token);
    return value ? [`--${token}: ${value};`] : [];
  }).join(' ');
}

/**
 * A theme that follows the appearance gets both palettes behind
 * prefers-color-scheme, so the WebView repaints on a scheme flip JS never
 * hears about: a fullScreen modal detaches the root view, and RN's Appearance
 * stays silent until it closes (MPO-187).
 */
function schemeStyles(
  themeName: string,
  scheme: EditorScheme,
  followsAppearance: boolean,
  current: string,
): { dark: string; palette: string } {
  const staticStyles = {
    dark: scheme === 'dark' ? darkEditorCss : '',
    palette: `:root { ${current} }`,
  };
  if (!followsAppearance) {
    return staticStyles;
  }
  const other: EditorScheme = scheme === 'dark' ? 'light' : 'dark';
  const otherTheme = (getConfig().themes as Record<string, Record<string, unknown>>)[
    themeName.replace(/^(light|dark)/, other)
  ];
  if (!otherTheme) {
    return staticStyles;
  }
  const opposite = paletteDecls((token) => getVariableValue(otherTheme[token]));
  const byScheme = { [scheme]: current, [other]: opposite } as Record<EditorScheme, string>;
  return {
    dark: `@media (prefers-color-scheme: dark) { ${darkEditorCss} }`,
    palette: `@media (prefers-color-scheme: light) { :root { ${byScheme.light} } } @media (prefers-color-scheme: dark) { :root { ${byScheme.dark} } }`,
  };
}

// ===========================================================================
// TentapEditor
// ===========================================================================

export interface TentapEditorProps extends RichEditorProps {
  /** Fill the available space (fullscreen modal) instead of using minHeight */
  fill?: boolean;
  /** CSS font-family string for body text (resolved from knobs by RichEditor) */
  bodyFontFamily?: string;
  /** CSS font-family string for headings (resolved from knobs by RichEditor) */
  headingFontFamily?: string;
}

// Avoid `forwardRef<A, B>(...)` — Metro/Babel TSX can parse the `>` as JSX and
// throw "Missing initializer in const declaration". Cast instead.
export const TentapEditor = forwardRef(
  (
    {
      initialContent = '',
      initialJSON,
      placeholder: placeholderProp,
      editable = true,
      autoFocus = false,
      onChange,
      onStateChange,
      minHeight = 150,
      maxHeight,
      fill = false,
      bodyFontFamily,
      headingFontFamily,
      hasError: _hasError,
    }: TentapEditorProps,
    ref: ForwardedRef<RichEditorRef>,
  ) => {
    const ctx = RichEditorContext.useStyledContext();
    const placeholder = placeholderProp ?? t('Start writing...');
    const { themeName, scheme, followsAppearance } = useNativeEditorScheme();
    const isDarkMode = scheme === 'dark';
    const cachedHtml = useRef<string>('');
    const cachedJson = useRef<any>(null);

    const editor = useEditorBridge({
      bridgeExtensions: [
        ...TenTapStartKit,
        UnderlineBridge,
        LinkBridge,
        ColorBridge,
        HighlightBridge,
        ImageBridge,
        TaskListBridge,
        PlaceholderBridge.configureExtension({
          placeholder,
        }),
      ],
      theme: isDarkMode ? darkEditorTheme : undefined,
      // Tentap accepts HTML string OR a ProseMirror JSON object. Never
      // JSON.stringify the object — that loads as broken HTML and wipes the doc.
      initialContent: initialJSON ?? initialContent,
      autofocus: autoFocus,
      editable,
      onChange: async () => {
        try {
          const html = await editor.getHTML();
          const json = await editor.getJSON();
          cachedHtml.current = html;
          cachedJson.current = json;
          onChange?.(html, json);
        } catch {
          // Ignore errors during content fetch
        }
      },
    });

    const theme = useTheme();
    const webviewLoaded = useRef(false);
    const applyEditorStyles = useCallback(() => {
      const inject = (css: string, tag: string) => {
        editor.injectCSS(escapeNativeEditorCSS(css), tag);
      };
      // The WebView has no Tamagui stylesheet. Resolve the same palette as
      // web-authored color/highlight marks before applying content rules.
      const styles = schemeStyles(
        themeName,
        scheme,
        followsAppearance,
        paletteDecls((token) => (theme as any)[token]?.val),
      );
      inject(styles.dark, 'multiplatform-tentap-dark');
      inject(styles.palette, 'multiplatform-tentap-palette');
      inject(
        getEditorCSS({
          minHeight,
          maxHeight,
          bodyFontFamily,
          headingFontFamily,
          fullscreen: fill,
          motionMs: 0,
        }),
        'multiplatform-tentap-content',
      );
    }, [
      editor,
      themeName,
      scheme,
      followsAppearance,
      theme,
      minHeight,
      maxHeight,
      bodyFontFamily,
      headingFontFamily,
      fill,
    ]);

    // TenTap invokes this after its internal onLoad handling, including its
    // first-load iOS reload. Apply on every load so the replacement document
    // receives the styles too; a mount-time timer can target the old one.
    const handleEditorLoad = useCallback(() => {
      webviewLoaded.current = true;
      applyEditorStyles();
    }, [applyEditorStyles]);
    useEffect(() => {
      if (webviewLoaded.current) {
        applyEditorStyles();
      }
    }, [applyEditorStyles]);

    // Subscribe to editor state updates
    useEffect(() => {
      const unsubscribe = editor._subscribeToEditorStateUpdate((state: any) => {
        const editorState = getEditorStateFromBridge(state);
        onStateChange?.(editorState);
      });
      return unsubscribe;
    }, [editor, onStateChange]);

    const executeCommand = useCallback(
      (command: EditorCommand, payload?: any) => {
        switch (command) {
          case 'bold': {
            editor.toggleBold();
            break;
          }
          case 'italic': {
            editor.toggleItalic();
            break;
          }
          case 'underline': {
            editor.toggleUnderline();
            break;
          }
          case 'strike': {
            editor.toggleStrike();
            break;
          }
          case 'code': {
            editor.toggleCode();
            break;
          }

          /** 10Tap does not have a subscript bridge extension */
          case 'subscript': {
            break;
          }
          /** 10Tap does not have a superscript bridge extension */
          case 'superscript': {
            break;
          }

          case 'heading1': {
            editor.toggleHeading(1);
            break;
          }
          case 'heading2': {
            editor.toggleHeading(2);
            break;
          }
          case 'heading3': {
            editor.toggleHeading(3);
            break;
          }
          case 'heading4': {
            editor.toggleHeading(4);
            break;
          }
          case 'heading5': {
            editor.toggleHeading(5);
            break;
          }
          case 'heading6': {
            editor.toggleHeading(6);
            break;
          }
          case 'paragraph': {
            // Toggle back to paragraph by toggling heading off
            break;
          }
          case 'bulletList': {
            editor.toggleBulletList();
            break;
          }
          case 'orderedList': {
            editor.toggleOrderedList();
            break;
          }
          case 'taskList': {
            editor.toggleTaskList();
            break;
          }
          case 'image': {
            if (payload?.src) {
              editor.setImage(payload.src);
            }
            break;
          }
          case 'blockquote': {
            editor.toggleBlockquote();
            break;
          }

          /** 10Tap does not have a codeBlock bridge extension */
          case 'codeBlock': {
            break;
          }

          case 'link': {
            if (payload?.href) {
              editor.setLink(payload.href);
            }
            break;
          }
          case 'undo': {
            editor.undo();
            break;
          }
          case 'redo': {
            editor.redo();
            break;
          }

          /** 10Tap does not have text alignment bridge extensions */
          case 'alignLeft':
          case 'alignCenter':
          case 'alignRight':
          case 'alignJustify': {
            break;
          }

          case 'textColor': {
            // null clears (Default swatch); undefined/missing is a no-op so a
            // bare toolbar tap cannot call setColor(undefined) and wipe content
            // (SB-N-ios-25).
            if (payload && 'color' in payload) {
              if (typeof payload.color === 'string' && payload.color.length > 0) {
                editor.setColor(payload.color);
              } else {
                editor.unsetColor();
              }
            }
            break;
          }
          case 'highlight': {
            if (payload && 'color' in payload) {
              if (typeof payload.color === 'string' && payload.color.length > 0) {
                editor.setHighlight(payload.color);
              } else {
                editor.unsetHighlight();
              }
            }
            break;
          }

          /** 10Tap does not have a horizontal rule bridge extension */
          case 'horizontalRule': {
            break;
          }
          /** 10Tap does not have a clear formatting bridge extension */
          case 'clearFormatting': {
            break;
          }
        }
      },
      [editor],
    );

    useImperativeHandle(
      ref,
      () => ({
        executeCommand,
        getState: () => getEditorStateFromBridge(editor.getEditorState()),
        getHTML: () => cachedHtml.current,
        getJSON: () => cachedJson.current,
        // Best-effort on native: turndown needs a DOM, which Hermes lacks —
        // hosts needing markdown values on native should keep markdown
        // source editing instead (documented fallback).
        getMarkdown: () => {
          try {
            return htmlToMarkdown(cachedHtml.current);
          } catch (error) {
            console.warn('[TentapEditor] getMarkdown unavailable on native:', error);
            return '';
          }
        },
        setHTML: (html: string) => {
          editor.setContent(html);
        },
        setJSON: (json: any) => {
          editor.setContent(json);
        },
        setMarkdown: (markdown: string) => {
          editor.setContent(markdownToHtml(markdown));
        },
        focus: () => {
          editor.focus();
        },
        blur: () => {
          editor.blur();
        },
      }),
      [editor, executeCommand],
    );

    return (
      <View
        flex={fill ? 1 : undefined}
        minHeight={fill ? undefined : minHeight}
        maxHeight={fill ? undefined : maxHeight}
        backgroundColor={ctx.disabled ? '$color3' : fill ? '$background' : '$color2'}
        overflow="hidden"
        opacity={ctx.disabled ? 0.5 : 1}>
        <RichText
          editor={editor}
          style={fill ? styles.editorFill : styles.editor}
          onLoad={handleEditorLoad}
        />
      </View>
    );
  },
);

TentapEditor.displayName = 'TentapEditor';

const styles = StyleSheet.create({
  editor: {
    flex: 1,
    minHeight: 150,
  },
  editorFill: {
    flex: 1,
  },
});
