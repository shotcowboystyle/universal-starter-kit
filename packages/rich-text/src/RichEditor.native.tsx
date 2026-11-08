/**
 * RichEditor compound component (native)
 *
 * Mobile editing model (Notion / Gmail convention):
 *
 * - INLINE (default): a compact PREVIEW surface themed like an input --
 *   the committed content rendered as styled text (or the placeholder),
 *   with a subtle edit affordance. Tapping it does not type inline; it
 *   opens the fullscreen editor.
 * - FULLSCREEN EDIT: a safe-area-aware RN Modal. Header bar with Cancel
 *   (left, discards the draft back to the pre-open value) and Done (right,
 *   commits via onChange) -- draft-until-commit. The Tentap editor fills
 *   the screen and the FixedToolbar docks ABOVE the keyboard via
 *   KeyboardAvoidingView.
 * - `inlineEditing` opts back into the embedded inline editor for hosts
 *   that truly want the old behavior.
 *
 * The web `fullscreen` / `defaultFullscreen` / `onFullscreenChange` props
 * map to the modal here, so the public API is one surface.
 *
 * No BubbleToolbar sub-component (10Tap does not support floating menus).
 * The BubbleToolbar property is still present on the compound component
 * to maintain the same public interface, but renders nothing on native.
 */

import { Button, clampRadiusForLargeComponent } from '@repo/forms';
import { fontCategoryStacks, sizeRecipeForToken, useGlyphColor, useResolvedKnobs } from '@repo/theme';
import { Pencil } from '@repo/ui';
import type { JSONContent } from '@tiptap/core';
import { useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { Ref, RefObject } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView, StyleSheet } from 'react-native';
import type { FontSizeTokens, SizeTokens } from 'tamagui';
import { Text, View, XStack, YStack, getConfig, withStaticProperties } from 'tamagui';

import { RichEditorContext } from './context';
import { htmlToMarkdown, markdownToHtml } from './editor/markdown';
import type { TentapEditor as TentapEditorComponent } from './editor/TentapEditor.native';
import type { PreviewBlock, PreviewBlockKind, PreviewSpan } from './preview';
import { parseHtmlPreview } from './preview';
import { t } from './shared/t';
import { EditorFrame } from './styled';
import { FixedToolbar } from './toolbar/FixedToolbar';
import type { EditorState, RichEditorProps, RichEditorRef, ToolbarSection } from './types';
import { defaultEditorState } from './types';

// ===========================================================================
// Combined Props
// ===========================================================================

export interface RichEditorCombinedProps extends RichEditorProps {
  /** Size token for the editor */
  size?: SizeTokens;
  /** Use compact sizing for tighter controls */
  compact?: boolean;
  /** Show the fixed toolbar (default: true) */
  showToolbar?: boolean;
  /** Show the bubble toolbar on text selection (not supported on native, ignored) */
  showBubbleToolbar?: boolean;
  /** Toolbar sections to display (shows all when omitted) */
  sections?: ToolbarSection[];
  /** Controlled fullscreen state (opens the fullscreen edit modal) */
  fullscreen?: boolean;
  /** Initial fullscreen state when uncontrolled (default: false) */
  defaultFullscreen?: boolean;
  /** Called when the fullscreen state changes */
  onFullscreenChange?: (fullscreen: boolean) => void;
  /**
   * Escape hatch: render the old embedded inline editor instead of the
   * preview + fullscreen modal (default: false)
   */
  inlineEditing?: boolean;
}

// ===========================================================================
// Noop BubbleToolbar (native has no floating menus)
// ===========================================================================

/** No-op BubbleToolbar for native -- 10Tap does not support floating menus */
const NativeBubbleToolbar = () => null;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});

// ===========================================================================
// TentapEditor dynamic import
// ===========================================================================

let TentapEditor: typeof TentapEditorComponent | null = null;
let tentapLoadError: string | null = null;
try {
  // SAFETY: the guarded module is our own TentapEditor.native file, whose export shape is fixed.
  // oxlint-disable-next-line node/global-require, unicorn/prefer-module, typescript/no-unsafe-type-assertion -- optional native backend: a guarded require keeps a missing @10play/tentap-editor from crashing the bundle
  ({ TentapEditor } = require('./editor/TentapEditor.native') as { TentapEditor: typeof TentapEditorComponent });
} catch (error) {
  // @10play/tentap-editor missing or failed to init — surface visibly below.
  tentapLoadError = error instanceof Error ? error.message : String(error);
  console.warn('[RichEditor] TentapEditor failed to load:', tentapLoadError);
}

const TentapUnavailableMessage = ({ detail }: { detail?: string | null }) => (
  <YStack
    gap="$2"
    alignItems="center"
    justifyContent="center"
    padding="$3">
    <Text
      color="$orange10"
      fontSize={14}
      fontWeight="700"
      textAlign="center">
      {t('Rich text editor unavailable')}
    </Text>
    <Text
      color="$color11"
      fontSize={12}
      textAlign="center">
      {detail ?? t('TentapEditor failed to load (requires @10play/tentap-editor)')}
    </Text>
  </YStack>
);

/** Visible stub when compound `RichEditor.Editor` is used without Tentap */
const TentapUnavailableEditor = (props: { minHeight?: number }) => (
  <View
    minHeight={props.minHeight ?? 150}
    padding="$4"
    justifyContent="center"
    alignItems="center"
    backgroundColor="$orange2"
    borderWidth={1}
    borderColor="$orange8"
    borderRadius="$3"
    accessibilityRole="alert"
    aria-label={t('Rich text editor unavailable')}>
    <TentapUnavailableMessage detail={tentapLoadError} />
  </View>
);

// ===========================================================================
// Preview rendering
// ===========================================================================

const HEADING_STYLE = new Map<PreviewBlockKind, { fontSize: number; fontWeight: '600' | '700' }>([
  ['heading1', { fontSize: 20, fontWeight: '700' }],
  ['heading2', { fontSize: 18, fontWeight: '700' }],
  ['heading3', { fontSize: 16, fontWeight: '600' }],
  ['heading4', { fontSize: 15, fontWeight: '600' }],
  ['heading5', { fontSize: 14, fontWeight: '600' }],
  ['heading6', { fontSize: 14, fontWeight: '600' }],
]);

const blockPrefix = (block: PreviewBlock): string => {
  if (block.kind === 'bullet') {
    return '•  ';
  }
  if (block.kind === 'ordered') {
    return `${block.index ?? 1}.  `;
  }
  if (block.kind === 'task') {
    return block.checked === true ? '☑  ' : '☐  ';
  }
  return '';
};

const spanDecoration = (span: PreviewSpan) => {
  const underline = span.underline === true;
  const strike = span.strike === true;
  if (underline && strike) {
    return 'underline line-through';
  }
  if (underline) {
    return 'underline';
  }
  return strike ? 'line-through' : undefined;
};

const PreviewBlockText = ({ block }: { block: PreviewBlock }) => {
  const heading = HEADING_STYLE.get(block.kind);
  const quote = block.quote === true;

  const body = (
    <Text
      color={quote ? '$color11' : '$color12'}
      fontSize={heading?.fontSize ?? 14}
      fontWeight={heading?.fontWeight}
      fontStyle={quote ? 'italic' : undefined}
      lineHeight={heading ? undefined : 20}
      numberOfLines={heading ? 2 : 4}
      // RN logical prop so the block indent flips with I18nManager in RTL
      paddingStart={(block.indent ?? 0) * 12}>
      {blockPrefix(block)}
      {block.spans.map((span, i) => (
        <Text
          // oxlint-disable-next-line react-doctor/no-array-index-as-key -- spans are positional parse output with no identity; the list is re-derived wholesale
          key={i}
          color={span.code === true ? '$color12' : undefined}
          fontWeight={span.bold === true ? '700' : undefined}
          fontStyle={span.italic === true ? 'italic' : undefined}
          backgroundColor={span.code === true ? '$color4' : undefined}
          textDecorationLine={spanDecoration(span)}>
          {span.text}
        </Text>
      ))}
    </Text>
  );

  if (quote) {
    return (
      // RN logical props so the quote rail flips with I18nManager in RTL
      <XStack
        borderStartWidth={3}
        borderStartColor="$color6"
        paddingStart="$2">
        {body}
      </XStack>
    );
  }
  return body;
};

// ===========================================================================
// Hooks
// ===========================================================================

const GENERIC_FAMILY_TAIL =
  /(?:^|,)\s*(?:serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded)\s*$/iu;

const isFontCategory = (key: string): key is keyof typeof fontCategoryStacks => Object.hasOwn(fontCategoryStacks, key);

const resolveNativeFontFamily = (fonts: ReturnType<typeof getConfig>['fonts'] | undefined, token?: string): string => {
  const key = token?.replace(/^\$/u, '') ?? 'body';
  const configured = fonts?.[key]?.family;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a Tamagui font family may be a theme Variable; only a literal string names a CSS stack
  const family = typeof configured === 'string' ? configured.trim() : undefined;
  const hasFamily = family !== undefined && family !== '';
  // RN's bare Inter name is not a font installed inside WKWebView.
  // Preserve explicit CSS stacks; otherwise use the shared category fallback.
  if (hasFamily && GENERIC_FAMILY_TAIL.test(family)) {
    return family;
  }
  const fallback = isFontCategory(key) ? fontCategoryStacks[key] : fontCategoryStacks['sans-serif'];
  return hasFamily ? `${family}, ${fallback}` : fallback;
};

// Same resolver as the web RichEditor: the knob names a registered font
// token ($body / $heading); the WebView needs its concrete CSS family
// string, which only the Tamagui config knows (MPO-187).
const useNativeFontFamilies = (bodyToken: string | undefined, headingToken: string | undefined) =>
  useMemo(() => {
    const fonts = getConfig()?.fonts;
    return {
      bodyFontFamily: resolveNativeFontFamily(fonts, bodyToken),
      headingFontFamily: resolveNativeFontFamily(fonts, headingToken),
    };
  }, [bodyToken, headingToken]);

interface CommittedValue {
  html: string;
  /** ProseMirror JSON, passed through to the editor and onChange. */
  json: JSONContent | null;
}

/**
 * Committed value (draft-until-commit): the preview renders this, the
 * fullscreen editor drafts against it, Done promotes the draft into it.
 */
const useCommittedValue = (
  initialContent: string | undefined,
  initialJSON: JSONContent | undefined,
  fullscreen: boolean,
) => {
  const [committed, setCommitted] = useState<CommittedValue>(() => ({
    html: initialContent ?? '',
    json: initialJSON ?? null,
  }));
  const committedRef = useRef(committed);
  // oxlint-disable-next-line react/refs -- latest-value ref, written every render by design
  committedRef.current = committed;

  // Adopt external resets (e.g. form.reset) while the modal is closed:
  // when the initialContent prop changes to something we neither emitted
  // nor already hold, treat it as the new committed value.
  const incoming = initialContent ?? '';
  const lastInitialContent = useRef(incoming);
  const lastEmitted = useRef<string | null>(null);
  const isExternalReset =
    !fullscreen &&
    // oxlint-disable-next-line react/refs -- render-phase prop-change detection (adjust-state-on-prop-change), refs hold the previous values
    ![lastInitialContent.current, lastEmitted.current, committedRef.current.html].includes(incoming);
  if (isExternalReset) {
    const next = { html: incoming, json: null };
    // oxlint-disable-next-line react/refs -- keeps the latest-value ref in step with the state set below
    committedRef.current = next;
    setCommitted(next);
  }
  // oxlint-disable-next-line react/refs -- previous-prop ref, written every render by design
  lastInitialContent.current = incoming;

  const commit = useCallback((next: CommittedValue) => {
    committedRef.current = next;
    setCommitted(next);
  }, []);

  const markEmitted = useCallback((html: string) => {
    lastEmitted.current = html;
  }, []);

  return { committed, committedRef, commit, markEmitted };
};

// ===========================================================================
// RichEditorImpl
// ===========================================================================

type CommonEditorProps = Omit<
  RichEditorCombinedProps,
  | 'size'
  | 'compact'
  | 'showToolbar'
  | 'showBubbleToolbar'
  | 'fullscreen'
  | 'defaultFullscreen'
  | 'onFullscreenChange'
  | 'inlineEditing'
  | 'sections'
  | 'hasError'
  | 'editable'
  | 'onStateChange'
  | 'minHeight'
  | 'maxHeight'
>;

interface FullscreenModalProps {
  open: boolean;
  sizeToken: FontSizeTokens;
  compact: boolean;
  showToolbar: boolean;
  sections: ToolbarSection[] | undefined;
  editorRef: RefObject<RichEditorRef | null>;
  editorState: EditorState;
  editorProps: CommonEditorProps;
  committed: CommittedValue;
  fonts: { bodyFontFamily: string; headingFontFamily: string };
  onDraftChange: (html: string, json: JSONContent) => void;
  onStateChange: (state: EditorState) => void;
  onCancel: () => void;
  onDone: () => void;
}

const FullscreenEditModal = ({
  open,
  sizeToken,
  compact,
  showToolbar,
  sections,
  editorRef,
  editorState,
  editorProps,
  committed,
  fonts,
  onDraftChange,
  onStateChange,
  onCancel,
  onDone,
}: FullscreenModalProps) => (
  <Modal
    visible={open}
    animationType="slide"
    presentationStyle="fullScreen"
    onRequestClose={onCancel}>
    {open && (
      <YStack
        flex={1}
        backgroundColor="$background">
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* oxlint-disable-next-line typescript/no-deprecated -- swapping in react-native-safe-area-context adds a dependency; tracked separately */}
          <SafeAreaView style={styles.flex}>
            <XStack
              alignItems="center"
              justifyContent="space-between"
              paddingHorizontal="$2"
              paddingVertical="$1.5"
              borderBottomWidth={1}
              borderBottomColor="$color6">
              <Button
                chromeless
                size={sizeToken}
                compact={compact}
                onPress={onCancel}
                aria-label={t('Cancel')}>
                <Text color="$color11">{t('Cancel')}</Text>
              </Button>
              <Button
                chromeless
                size={sizeToken}
                compact={compact}
                onPress={onDone}
                aria-label={t('Done')}>
                <Text
                  color="$color12"
                  fontWeight="700">
                  {t('Done')}
                </Text>
              </Button>
            </XStack>
            <YStack flex={1}>
              {TentapEditor ? (
                <TentapEditor
                  ref={editorRef}
                  bodyFontFamily={fonts.bodyFontFamily}
                  headingFontFamily={fonts.headingFontFamily}
                  {...editorProps}
                  initialContent={committed.html}
                  initialJSON={committed.json ?? undefined}
                  autoFocus={editorProps.autoFocus ?? true}
                  editable
                  fill
                  onChange={onDraftChange}
                  onStateChange={onStateChange}
                  hasError={false}
                />
              ) : (
                <View
                  flex={1}
                  justifyContent="center"
                  alignItems="center"
                  padding="$4"
                  backgroundColor="$orange2"
                  accessibilityRole="alert">
                  <TentapUnavailableMessage detail={tentapLoadError} />
                </View>
              )}
            </YStack>
            {showToolbar && (
              <FixedToolbar
                editorRef={editorRef}
                state={editorState}
                sections={sections}
                docked="bottom"
              />
            )}
          </SafeAreaView>
        </KeyboardAvoidingView>
      </YStack>
    )}
  </Modal>
);

interface PreviewSurfaceProps {
  html: string;
  placeholder: string | undefined;
  disabled: boolean;
  hasError: boolean | undefined;
  cappedRadius: ReturnType<typeof clampRadiusForLargeComponent>;
  borderWidth: number | undefined;
  padding: PanelPadding;
  minHeight: number;
  maxHeight: number | undefined;
  editGlyphSize: number;
  onOpen: () => void;
}

type PanelPadding = ReturnType<typeof useResolvedKnobs>['knobProps']['panelPadding']['padding'];

const PreviewSurface = ({
  html,
  placeholder,
  disabled,
  hasError,
  cappedRadius,
  borderWidth,
  padding,
  minHeight,
  maxHeight,
  editGlyphSize,
  onOpen,
}: PreviewSurfaceProps) => {
  const editGlyphColor = useGlyphColor('$color11');
  const preview = useMemo(() => parseHtmlPreview(html, 6), [html]);

  return (
    // RN Text/YStack steal taps from Tamagui View onPress, so the preview
    // open target is a core Pressable. EditorFrame stays visual-only.
    <Pressable
      onPress={disabled ? undefined : onOpen}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={t('Edit rich text')}
      style={({ pressed }) => ({ opacity: pressed && !disabled ? 0.85 : 1 })}>
      <EditorFrame
        hasError={hasError}
        borderRadius={cappedRadius}
        borderWidth={borderWidth}
        borderColor={hasError === true ? '$red10' : '$color6'}
        disabled={disabled}
        minHeight={Math.min(minHeight, 120)}
        maxHeight={maxHeight ?? 240}
        pointerEvents="none">
        <YStack
          padding={padding}
          paddingRight="$6"
          gap="$1.5"
          flex={1}>
          {!TentapEditor && (
            <Text
              color="$orange10"
              fontSize={12}
              fontWeight="600">
              {t('Editor unavailable — tap for details')}
            </Text>
          )}
          {preview.blocks.length === 0 ? (
            <Text
              color="$color10"
              fontSize={14}
              lineHeight={20}>
              {placeholder ?? t('Start writing...')}
            </Text>
          ) : (
            preview.blocks.map((block, i) => (
              <PreviewBlockText
                // oxlint-disable-next-line react-doctor/no-array-index-as-key -- blocks are positional parse output with no identity; the list is re-derived wholesale
                key={i}
                block={block}
              />
            ))
          )}
          {preview.truncated && (
            <Text
              color="$color10"
              fontSize={14}>
              …
            </Text>
          )}
        </YStack>
        {!disabled && (
          <View
            position="absolute"
            top="$2.5"
            right="$2.5">
            <Pencil
              color={editGlyphColor}
              size={editGlyphSize}
              accessible={false}
            />
          </View>
        )}
      </EditorFrame>
    </Pressable>
  );
};

const RichEditorImpl = ({
  ref,
  size,
  compact = false,
  showToolbar = true,
  showBubbleToolbar: _showBubbleToolbar,
  fullscreen: fullscreenProp,
  defaultFullscreen = false,
  onFullscreenChange,
  inlineEditing = false,
  sections,
  hasError,
  editable = true,
  onStateChange,
  minHeight = 150,
  maxHeight,
  ...editorProps
}: RichEditorCombinedProps & { ref?: Ref<RichEditorRef> }) => {
  const internalRef = useRef<RichEditorRef>(null);
  const [editorState, setEditorState] = useState<EditorState>(defaultEditorState);
  const [internalFullscreen, setInternalFullscreen] = useState(defaultFullscreen);
  const fullscreen = fullscreenProp ?? internalFullscreen;

  const { committed, committedRef, commit, markEmitted } = useCommittedValue(
    editorProps.initialContent,
    // oxlint-disable-next-line typescript/no-unsafe-argument -- RichEditorProps.initialJSON is public `any` (ProseMirror JSON)
    editorProps.initialJSON,
    fullscreen,
  );
  const draftHtml = useRef<string | null>(null);
  const draftJson = useRef<JSONContent | null>(null);

  const { knobProps } = useResolvedKnobs({
    component: 'RichEditor',
    size,
    compact,
  });

  const fonts = useNativeFontFamilies(knobProps.body?.fontFamily, knobProps.heading?.fontFamily);

  const handleStateChange = useCallback(
    (state: EditorState) => {
      setEditorState(state);
      onStateChange?.(state);
    },
    [onStateChange],
  );

  const handleFullscreenChange = useCallback(
    (next: boolean) => {
      setInternalFullscreen(next);
      onFullscreenChange?.(next);
    },
    [onFullscreenChange],
  );

  const openFullscreen = useCallback(() => {
    draftHtml.current = null;
    draftJson.current = null;
    handleFullscreenChange(true);
  }, [handleFullscreenChange]);

  const { onChange, onBlur } = editorProps;

  const handleCancel = useCallback(() => {
    handleFullscreenChange(false);
    onBlur?.();
  }, [handleFullscreenChange, onBlur]);

  const handleDone = useCallback(() => {
    const html = draftHtml.current;
    if (html !== null && html !== committedRef.current.html) {
      commit({ html, json: draftJson.current });
      markEmitted(html);
      onChange?.(html, draftJson.current);
    }
    handleFullscreenChange(false);
    onBlur?.();
  }, [handleFullscreenChange, onChange, onBlur, commit, committedRef, markEmitted]);

  const handleDraftChange = useCallback((html: string, json: JSONContent) => {
    draftHtml.current = html;
    draftJson.current = json;
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      executeCommand: (command, payload) => internalRef.current?.executeCommand(command, payload),
      getState: () => internalRef.current?.getState() ?? defaultEditorState,
      getHTML: () => {
        const live = internalRef.current?.getHTML() ?? '';
        return live === '' ? committedRef.current.html : live;
      },
      getJSON: () => {
        if (!internalRef.current) {
          return committedRef.current.json;
        }
        // oxlint-disable-next-line typescript/no-unsafe-return -- getJSON is `any` in the public RichEditorRef contract
        return internalRef.current.getJSON() ?? committedRef.current.json;
      },
      // Native markdown serialization is best-effort (turndown needs a
      // DOM): the editor delegates and returns "" when unavailable.
      getMarkdown: () => {
        if (internalRef.current) {
          return internalRef.current.getMarkdown();
        }
        try {
          return htmlToMarkdown(committedRef.current.html);
        } catch (error) {
          console.warn('[RichEditor] getMarkdown unavailable on native:', error);
          return '';
        }
      },
      setMarkdown: (markdown: string) => {
        const html = markdownToHtml(markdown);
        if (internalRef.current) {
          internalRef.current.setHTML(html);
        } else {
          commit({ html, json: null });
        }
      },
      setHTML: (html: string) => {
        if (internalRef.current) {
          internalRef.current.setHTML(html);
        } else {
          commit({ html, json: null });
        }
      },
      setJSON: (json: JSONContent) => {
        if (internalRef.current) {
          internalRef.current.setJSON(json);
        } else {
          commit({ ...committedRef.current, json });
        }
      },
      focus: () => {
        if (internalRef.current) {
          internalRef.current.focus();
        } else if (!inlineEditing && editable) {
          openFullscreen();
        }
      },
      // oxlint-disable-next-line github/no-blur -- forwards the editor API's blur(), not a DOM element blur
      blur: () => internalRef.current?.blur(),
    }),
    [inlineEditing, editable, openFullscreen, commit, committedRef],
  );

  const cappedRadius = clampRadiusForLargeComponent(knobProps.borderRadius.borderRadius, 4);
  const disabled = !editable;
  const sizeKey = knobProps.sizeToken ?? '$true';
  // SAFETY: knobs resolve sizeToken to a `$`-prefixed size key, which every font-size scale shares.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const sizeToken = sizeKey as FontSizeTokens;
  const editGlyphSize = sizeRecipeForToken(sizeKey, { touch: true }).iconSize;

  // -----------------------------------------------------------------------
  // Escape hatch: old embedded inline editor
  // -----------------------------------------------------------------------

  if (inlineEditing) {
    return (
      <RichEditorContext.Provider
        size={sizeToken}
        compact={compact}
        disabled={disabled}>
        <EditorFrame
          hasError={hasError}
          borderRadius={cappedRadius}
          borderWidth={knobProps.borderRadius.borderWidth}
          borderColor={hasError === true ? '$red10' : '$color6'}
          disabled={disabled}>
          {showToolbar && !disabled && (
            <FixedToolbar
              editorRef={internalRef}
              state={editorState}
              sections={sections}
              hasError={hasError}
            />
          )}
          {TentapEditor ? (
            <TentapEditor
              ref={internalRef}
              minHeight={minHeight}
              maxHeight={maxHeight}
              bodyFontFamily={fonts.bodyFontFamily}
              headingFontFamily={fonts.headingFontFamily}
              {...editorProps}
              editable={editable}
              onStateChange={handleStateChange}
              hasError={false}
            />
          ) : (
            <View
              minHeight={minHeight}
              padding={knobProps.panelPadding.padding}
              justifyContent="center"
              alignItems="center"
              backgroundColor="$orange2"
              accessibilityRole="alert">
              <TentapUnavailableMessage detail={tentapLoadError} />
            </View>
          )}
        </EditorFrame>
      </RichEditorContext.Provider>
    );
  }

  // -----------------------------------------------------------------------
  // Default: compact preview + fullscreen edit modal
  // -----------------------------------------------------------------------

  return (
    <RichEditorContext.Provider
      size={sizeToken}
      compact={compact}
      disabled={disabled}>
      <PreviewSurface
        html={committed.html}
        placeholder={editorProps.placeholder}
        disabled={disabled}
        hasError={hasError}
        cappedRadius={cappedRadius}
        borderWidth={knobProps.borderRadius.borderWidth}
        padding={knobProps.panelPadding.padding}
        minHeight={minHeight}
        maxHeight={maxHeight}
        editGlyphSize={editGlyphSize}
        onOpen={openFullscreen}
      />
      <FullscreenEditModal
        open={fullscreen}
        sizeToken={sizeToken}
        compact={compact}
        showToolbar={showToolbar}
        sections={sections}
        editorRef={internalRef}
        editorState={editorState}
        editorProps={editorProps}
        committed={committed}
        fonts={fonts}
        onDraftChange={handleDraftChange}
        onStateChange={handleStateChange}
        onCancel={handleCancel}
        onDone={handleDone}
      />
    </RichEditorContext.Provider>
  );
};

RichEditorImpl.displayName = 'RichEditor';

// ===========================================================================
// Compound Component
// ===========================================================================

export const RichEditor = withStaticProperties(RichEditorImpl, {
  FixedToolbar,
  BubbleToolbar: NativeBubbleToolbar,
  Editor: TentapEditor ?? TentapUnavailableEditor,
});
