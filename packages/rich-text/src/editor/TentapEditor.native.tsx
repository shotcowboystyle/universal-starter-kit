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

import { getEditorCSS } from './editor-styles';
import { htmlToMarkdown, markdownToHtml } from './markdown';
import { escapeNativeEditorCSS } from './native-editor-css';
import { getEditorStateFromBridge } from './use-editor-state';

type EditorScheme = 'light' | 'dark';
type EditorBridge = ReturnType<typeof useEditorBridge>;
type PaletteValue = string | number | null | undefined;

const useNativeEditorScheme = () => {
  const themeName: string = useThemeName();
  const osScheme = useColorScheme();
  let scheme: EditorScheme = osScheme === 'dark' ? 'dark' : 'light';
  if (themeName !== '') {
    scheme = themeName.startsWith('dark') ? 'dark' : 'light';
  }
  return { themeName: themeName === '' ? scheme : themeName, scheme, followsAppearance: osScheme === scheme };
};

const paletteDecls = (read: (token: string) => PaletteValue): string =>
  PALETTE_THEME_TOKENS.flatMap((token) => {
    const value = read(token);
    return value === undefined || value === null || value === '' ? [] : [`--${token}: ${value};`];
  }).join(' ');

/**
 * A theme that follows the appearance gets both palettes behind
 * prefers-color-scheme, so the WebView repaints on a scheme flip JS never
 * hears about: a fullScreen modal detaches the root view, and RN's Appearance
 * stays silent until it closes (MPO-187).
 */
const schemeStyles = (themeName: string, scheme: EditorScheme, followsAppearance: boolean, current: string) => {
  const staticStyles = {
    dark: scheme === 'dark' ? darkEditorCss : '',
    palette: `:root { ${current} }`,
  };
  if (!followsAppearance) {
    return staticStyles;
  }
  const other: EditorScheme = scheme === 'dark' ? 'light' : 'dark';
  const otherTheme = getConfig().themes[themeName.replace(/^(?:light|dark)/u, other)];
  if (otherTheme === undefined) {
    return staticStyles;
  }
  const opposite = paletteDecls(
    // SAFETY: tamagui resolves a theme variable to its raw CSS value (string or number); `getVariableValue` is typed `any`.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    (token) => getVariableValue(otherTheme[token]) as PaletteValue,
  );
  const light = scheme === 'light' ? current : opposite;
  const dark = scheme === 'dark' ? current : opposite;
  return {
    dark: `@media (prefers-color-scheme: dark) { ${darkEditorCss} }`,
    palette: `@media (prefers-color-scheme: light) { :root { ${light} } } @media (prefers-color-scheme: dark) { :root { ${dark} } }`,
  };
};

interface CommandPayload {
  src?: string;
  href?: string;
  color?: string | null;
}

const setColorFromPayload = (
  payload: CommandPayload | null | undefined,
  set: (color: string) => void,
  unset: () => void,
) => {
  // null clears (Default swatch); undefined/missing is a no-op so a bare
  // toolbar tap cannot call setColor(undefined) and wipe content (SB-N-ios-25).
  if (payload === undefined || payload === null || !('color' in payload)) {
    return;
  }
  const color = payload.color ?? '';
  if (color.length > 0) {
    set(color);
  } else {
    unset();
  }
};

/**
 * Commands 10Tap can run. Missing entries are no-ops: 10Tap has no bridge
 * extension for subscript, superscript, codeBlock, text alignment, horizontal
 * rule, clear formatting, tables, or a heading-to-paragraph toggle.
 */
const nativeCommands: Partial<Record<EditorCommand, (editor: EditorBridge, payload?: CommandPayload | null) => void>> =
  {
    bold: (editor) => {
      editor.toggleBold();
    },
    italic: (editor) => {
      editor.toggleItalic();
    },
    underline: (editor) => {
      editor.toggleUnderline();
    },
    strike: (editor) => {
      editor.toggleStrike();
    },
    code: (editor) => {
      editor.toggleCode();
    },
    heading1: (editor) => {
      editor.toggleHeading(1);
    },
    heading2: (editor) => {
      editor.toggleHeading(2);
    },
    heading3: (editor) => {
      editor.toggleHeading(3);
    },
    heading4: (editor) => {
      editor.toggleHeading(4);
    },
    heading5: (editor) => {
      editor.toggleHeading(5);
    },
    heading6: (editor) => {
      editor.toggleHeading(6);
    },
    bulletList: (editor) => {
      editor.toggleBulletList();
    },
    orderedList: (editor) => {
      editor.toggleOrderedList();
    },
    taskList: (editor) => {
      editor.toggleTaskList();
    },
    image: (editor, payload) => {
      if (payload?.src !== undefined && payload.src !== '') {
        editor.setImage(payload.src);
      }
    },
    blockquote: (editor) => {
      editor.toggleBlockquote();
    },
    link: (editor, payload) => {
      if (payload?.href !== undefined && payload.href !== '') {
        editor.setLink(payload.href);
      }
    },
    undo: (editor) => {
      editor.undo();
    },
    redo: (editor) => {
      editor.redo();
    },
    textColor: (editor, payload) => {
      setColorFromPayload(
        payload,
        (color) => {
          editor.setColor(color);
        },
        () => {
          editor.unsetColor();
        },
      );
    },
    highlight: (editor, payload) => {
      setColorFromPayload(
        payload,
        (color) => {
          editor.setHighlight(color);
        },
        () => {
          editor.unsetHighlight();
        },
      );
    },
  };

const styles = StyleSheet.create({
  editor: {
    flex: 1,
    minHeight: 150,
  },
  editorFill: {
    flex: 1,
  },
});

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
  // oxlint-disable-next-line react/function-component-definition -- forwardRef render callback, not a named component
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
    const cachedJson = useRef<object | null>(null);

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
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- RichEditorProps.initialJSON is public `any` (ProseMirror JSON)
      initialContent: initialJSON ?? initialContent,
      autofocus: autoFocus,
      editable,
      // oxlint-disable-next-line typescript/no-misused-promises, typescript/strict-void-return -- the handler catches its own errors; 10Tap ignores the return value
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
      const sheets = schemeStyles(
        themeName,
        scheme,
        followsAppearance,
        // SAFETY: theme variables carry raw CSS values (string or number) in `val`.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
        paletteDecls((token) => theme[token]?.val as PaletteValue),
      );
      inject(sheets.dark, 'multiplatform-tentap-dark');
      inject(sheets.palette, 'multiplatform-tentap-palette');
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
        // oxlint-disable-next-line react-doctor/no-pass-live-state-to-parent -- injects CSS into the WebView; no parent state involved
        applyEditorStyles();
      }
    }, [applyEditorStyles]);

    // Subscribe to editor state updates
    useEffect(() => {
      const unsubscribe = editor._subscribeToEditorStateUpdate((state) => {
        const editorState = getEditorStateFromBridge(state);
        onStateChange?.(editorState);
      });
      return unsubscribe;
    }, [editor, onStateChange]);

    const executeCommand = useCallback(
      (command: EditorCommand, payload?: CommandPayload | null) => {
        nativeCommands[command]?.(editor, payload);
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
        setJSON: (json: Parameters<EditorBridge['setContent']>[0]) => {
          editor.setContent(json);
        },
        setMarkdown: (markdown: string) => {
          editor.setContent(markdownToHtml(markdown));
        },
        focus: () => {
          editor.focus();
        },
        blur: () => {
          // oxlint-disable-next-line github/no-blur -- `blur` is the public ref API; the host decides where focus goes next
          editor.blur();
        },
      }),
      [editor, executeCommand],
    );

    let backgroundColor = fill ? '$background' : '$color2';
    if (ctx.disabled) {
      backgroundColor = '$color3';
    }

    return (
      <View
        flex={fill ? 1 : undefined}
        minHeight={fill ? undefined : minHeight}
        maxHeight={fill ? undefined : maxHeight}
        backgroundColor={backgroundColor}
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
