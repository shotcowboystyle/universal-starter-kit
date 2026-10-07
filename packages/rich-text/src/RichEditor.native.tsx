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

import { Pencil } from '@repo/ui';
import { Button, clampRadiusForLargeComponent } from '@repo/forms';
import { fontCategoryStacks, sizeRecipeForToken, useGlyphColor, useResolvedKnobs } from '@repo/theme';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView, StyleSheet } from 'react-native';
import type { SizeTokens } from 'tamagui';
import { Text, View, XStack, YStack, getConfig, withStaticProperties } from 'tamagui';

import { RichEditorContext } from './context';
import { htmlToMarkdown, markdownToHtml } from './editor/markdown';
import type { PreviewBlock } from './preview';
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
function NativeBubbleToolbar() {
  return null;
}

// ===========================================================================
// TentapEditor dynamic import
// ===========================================================================

let TentapEditor: any = null;
let tentapLoadError: string | null = null;
try {
  TentapEditor = require('./editor/TentapEditor.native').TentapEditor;
} catch (error) {
  // @10play/tentap-editor missing or failed to init — surface visibly below.
  tentapLoadError = error instanceof Error ? error.message : String(error);
  console.warn('[RichEditor] TentapEditor failed to load:', tentapLoadError);
}

function TentapUnavailableMessage({ detail }: { detail?: string | null }) {
  return (
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
}

/** Visible stub when compound `RichEditor.Editor` is used without Tentap */
function TentapUnavailableEditor(props: { minHeight?: number }) {
  return (
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
}

// ===========================================================================
// Preview rendering
// ===========================================================================

const HEADING_STYLE: Record<string, { fontSize: number; fontWeight: any }> = {
  heading1: { fontSize: 20, fontWeight: '700' },
  heading2: { fontSize: 18, fontWeight: '700' },
  heading3: { fontSize: 16, fontWeight: '600' },
  heading4: { fontSize: 15, fontWeight: '600' },
  heading5: { fontSize: 14, fontWeight: '600' },
  heading6: { fontSize: 14, fontWeight: '600' },
};

function PreviewBlockText({ block }: { block: PreviewBlock }) {
  const heading = HEADING_STYLE[block.kind];
  const prefix =
    block.kind === 'bullet'
      ? '•  '
      : block.kind === 'ordered'
        ? `${block.index ?? 1}.  `
        : block.kind === 'task'
          ? block.checked
            ? '☑  '
            : '☐  '
          : '';

  const body = (
    <Text
      color={block.quote ? '$color11' : '$color12'}
      fontSize={heading?.fontSize ?? 14}
      fontWeight={heading?.fontWeight}
      fontStyle={block.quote ? 'italic' : undefined}
      lineHeight={heading ? undefined : 20}
      numberOfLines={heading ? 2 : 4}
      // RN logical prop so the block indent flips with I18nManager in RTL
      paddingStart={(block.indent ?? 0) * 12}>
      {prefix}
      {block.spans.map((span, i) => (
        <Text
          key={i}
          color={span.code ? '$color12' : undefined}
          fontWeight={span.bold ? '700' : undefined}
          fontStyle={span.italic ? 'italic' : undefined}
          backgroundColor={span.code ? '$color4' : undefined}
          textDecorationLine={
            span.underline && span.strike
              ? 'underline line-through'
              : span.underline
                ? 'underline'
                : span.strike
                  ? 'line-through'
                  : undefined
          }>
          {span.text}
        </Text>
      ))}
    </Text>
  );

  if (block.quote) {
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
}

// ===========================================================================
// RichEditorImpl
// ===========================================================================

const RichEditorImpl = forwardRef<RichEditorRef, RichEditorCombinedProps>(
  (
    {
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
    },
    ref,
  ) => {
    const internalRef = useRef<RichEditorRef>(null);
    const [editorState, setEditorState] = useState<EditorState>(defaultEditorState);
    const [internalFullscreen, setInternalFullscreen] = useState(defaultFullscreen);
    const fullscreen = fullscreenProp ?? internalFullscreen;

    // Committed value (draft-until-commit): the preview renders this, the
    // fullscreen editor drafts against it, Done promotes the draft into it.
    const [committed, setCommitted] = useState<{ html: string; json: any }>(() => ({
      html: editorProps.initialContent ?? '',
      json: editorProps.initialJSON ?? null,
    }));
    const committedRef = useRef(committed);
    committedRef.current = committed;
    const draftHtml = useRef<string | null>(null);
    const draftJson = useRef<any>(null);

    // Adopt external resets (e.g. form.reset) while the modal is closed:
    // when the initialContent prop changes to something we neither emitted
    // nor already hold, treat it as the new committed value.
    const lastInitialContent = useRef(editorProps.initialContent ?? '');
    const lastEmitted = useRef<string | null>(null);
    if (
      !fullscreen &&
      (editorProps.initialContent ?? '') !== lastInitialContent.current &&
      (editorProps.initialContent ?? '') !== lastEmitted.current &&
      (editorProps.initialContent ?? '') !== committedRef.current.html
    ) {
      const html = editorProps.initialContent ?? '';
      committedRef.current = { html, json: null };
      setCommitted(committedRef.current);
    }
    lastInitialContent.current = editorProps.initialContent ?? '';

    const { knobProps } = useResolvedKnobs({
      component: 'RichEditor',
      size,
      compact,
    });
    const editGlyphColor = useGlyphColor('$color11');

    // Same resolver as the web RichEditor: the knob names a registered font
    // token ($body / $heading); the WebView needs its concrete CSS family
    // string, which only the Tamagui config knows (MPO-187).
    const { bodyFontFamily, headingFontFamily } = useMemo(() => {
      const fonts = getConfig()?.fonts;
      const resolve = (token?: string) => {
        const key = token?.replace(/^\$/, '') ?? 'body';
        const configured = fonts?.[key]?.family;
        const family = typeof configured === 'string' ? configured.trim() : undefined;
        // RN's bare Inter name is not a font installed inside WKWebView.
        // Preserve explicit CSS stacks; otherwise use the shared category fallback.
        if (
          family &&
          /(?:^|,)\s*(?:serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded)\s*$/i.test(
            family,
          )
        ) {
          return family;
        }
        const fallback = Object.hasOwn(fontCategoryStacks, key)
          ? fontCategoryStacks[key as keyof typeof fontCategoryStacks]
          : fontCategoryStacks['sans-serif'];
        return family ? `${family}, ${fallback}` : fallback;
      };
      return {
        bodyFontFamily: resolve(knobProps.body?.fontFamily),
        headingFontFamily: resolve(knobProps.heading?.fontFamily),
      };
    }, [knobProps.body?.fontFamily, knobProps.heading?.fontFamily]);

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
        committedRef.current = { html, json: draftJson.current };
        setCommitted(committedRef.current);
        lastEmitted.current = html;
        onChange?.(html, draftJson.current);
      }
      handleFullscreenChange(false);
      onBlur?.();
    }, [handleFullscreenChange, onChange, onBlur]);

    useImperativeHandle(
      ref,
      () => ({
        executeCommand: (command, payload) => internalRef.current?.executeCommand(command, payload),
        getState: () => internalRef.current?.getState() ?? defaultEditorState,
        getHTML: () =>
          internalRef.current ? internalRef.current.getHTML() || committedRef.current.html : committedRef.current.html,
        getJSON: () =>
          internalRef.current
            ? (internalRef.current.getJSON() ?? committedRef.current.json)
            : committedRef.current.json,
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
            committedRef.current = { html, json: null };
            setCommitted(committedRef.current);
          }
        },
        setHTML: (html: string) => {
          if (internalRef.current) {
            internalRef.current.setHTML(html);
          } else {
            committedRef.current = { html, json: null };
            setCommitted(committedRef.current);
          }
        },
        setJSON: (json: any) => {
          if (internalRef.current) {
            internalRef.current.setJSON(json);
          } else {
            committedRef.current = { ...committedRef.current, json };
            setCommitted(committedRef.current);
          }
        },
        focus: () => {
          if (internalRef.current) {
            internalRef.current.focus();
          } else if (!inlineEditing && editable) {
            openFullscreen();
          }
        },
        blur: () => internalRef.current?.blur(),
      }),
      [inlineEditing, editable, openFullscreen],
    );

    const cappedRadius = clampRadiusForLargeComponent(knobProps.borderRadius.borderRadius, 4);
    const disabled = !editable;
    const sizeToken = (knobProps.sizeToken ?? '$true') as any;
    const editGlyphSize = sizeRecipeForToken(sizeToken, { touch: true }).iconSize;

    const preview = useMemo(() => parseHtmlPreview(committed.html, 6), [committed.html]);
    const previewEmpty = preview.blocks.length === 0;

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
            borderColor={hasError ? '$red10' : '$color6'}
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
                bodyFontFamily={bodyFontFamily}
                headingFontFamily={headingFontFamily}
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
        {/*
          RN Text/YStack steal taps from Tamagui View onPress, so the preview
          open target is a core Pressable. EditorFrame stays visual-only.
        */}
        <Pressable
          onPress={disabled ? undefined : openFullscreen}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={t('Edit rich text')}
          style={({ pressed }) => ({ opacity: pressed && !disabled ? 0.85 : 1 })}>
          <EditorFrame
            hasError={hasError}
            borderRadius={cappedRadius}
            borderWidth={knobProps.borderRadius.borderWidth}
            borderColor={hasError ? '$red10' : '$color6'}
            disabled={disabled}
            minHeight={Math.min(minHeight, 120)}
            maxHeight={maxHeight ?? 240}
            pointerEvents="none">
            <YStack
              padding={knobProps.panelPadding.padding}
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
              {previewEmpty ? (
                <Text
                  color="$color10"
                  fontSize={14}
                  lineHeight={20}>
                  {editorProps.placeholder ?? t('Start writing...')}
                </Text>
              ) : (
                preview.blocks.map((block, i) => (
                  <PreviewBlockText
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

        <Modal
          visible={fullscreen}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={handleCancel}>
          {fullscreen && (
            <YStack
              flex={1}
              backgroundColor="$background">
              <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
                      onPress={handleCancel}
                      aria-label={t('Cancel')}>
                      <Text color="$color11">{t('Cancel')}</Text>
                    </Button>
                    <Button
                      chromeless
                      size={sizeToken}
                      compact={compact}
                      onPress={handleDone}
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
                        ref={internalRef}
                        bodyFontFamily={bodyFontFamily}
                        headingFontFamily={headingFontFamily}
                        {...editorProps}
                        initialContent={committed.html}
                        initialJSON={committed.json ?? undefined}
                        autoFocus={editorProps.autoFocus ?? true}
                        editable
                        fill
                        onChange={(html: string, json: any) => {
                          draftHtml.current = html;
                          draftJson.current = json;
                        }}
                        onStateChange={handleStateChange}
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
                      editorRef={internalRef}
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
      </RichEditorContext.Provider>
    );
  },
);

RichEditorImpl.displayName = 'RichEditor';

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});

// ===========================================================================
// Compound Component
// ===========================================================================

export const RichEditor = withStaticProperties(RichEditorImpl, {
  FixedToolbar,
  BubbleToolbar: NativeBubbleToolbar,
  Editor: TentapEditor ?? TentapUnavailableEditor,
});
