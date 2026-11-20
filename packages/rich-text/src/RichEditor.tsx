/**
 * RichEditor compound component (web)
 *
 * Combines the TiptapEditor, FixedToolbar, and BubbleToolbar into a compound
 * component with static properties:
 * - RichEditor.FixedToolbar
 * - RichEditor.BubbleToolbar
 * - RichEditor.Editor
 *
 * Root provides RichEditorContext with resolved size, compact, and disabled.
 * Uses useResolvedKnobs for knobs integration and clampRadiusForLargeComponent
 * for radius clamping (max $4).
 */

import { clampRadiusForLargeComponent } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import { useCallback, useEffect, useEffectEvent, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { Ref, RefObject } from 'react';
import type { FontSizeTokens, SizeTokens } from 'tamagui';
import { getConfig, withStaticProperties } from 'tamagui';

import { RichEditorContext } from './context';
import { TiptapEditor } from './editor/TiptapEditor';
import { EditorFrame } from './styled';
import { BubbleToolbar } from './toolbar/BubbleToolbar';
import { FixedToolbar } from './toolbar/FixedToolbar';
import { ResizeHandle } from './toolbar/ResizeHandle';
import { StatusBar } from './toolbar/StatusBar';
import type { EditorMode, EditorState, RichEditorProps, RichEditorRef, ToolbarSection } from './types';
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
  /** Show the bubble toolbar on text selection (default: false, web only) */
  showBubbleToolbar?: boolean;
  /** Toolbar sections to display (shows all when omitted) */
  sections?: ToolbarSection[];
  /** Show a drag handle to resize the editor vertically (default: true) */
  resizable?: boolean;
  /** Show word/character count status bar (default: true) */
  showStatusBar?: boolean;
  /** Controlled fullscreen state (uncontrolled when omitted) */
  fullscreen?: boolean;
  /** Initial fullscreen state when uncontrolled (default: false) */
  defaultFullscreen?: boolean;
  /** Called when the fullscreen state changes */
  onFullscreenChange?: (fullscreen: boolean) => void;
  /**
   * Native only: render the embedded inline editor instead of the
   * preview + fullscreen edit modal. Ignored on web (the web editor is
   * always inline; fullscreen is the toolbar toggle).
   */
  inlineEditing?: boolean;
}

// ===========================================================================
// Hooks
// ===========================================================================

/** Effects that bail early still return a cleanup so every path is consistent. */
const noCleanup = (): void => undefined;

// Escape exits fullscreen -- but open menus/dialogs get Escape first:
// popover content is still mounted while it dismisses on the same
// keydown (React unmounts async), so the presence check skips this
// handler until the next Escape. The slash menu stops propagation when
// it consumes Escape, so it never reaches here. defaultPrevented is NOT
// a usable signal -- ProseMirror preventDefaults Escape unconditionally
// whenever focus is inside the editor.
const useEscapeExitsFullscreen = (fullscreen: boolean, onExit: () => void): void => {
  const exit = useEffectEvent(onExit);
  useEffect(() => {
    if (!fullscreen || typeof document === 'undefined') {
      return noCleanup;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      const openOverlay = [
        ...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="menu"], [role="listbox"]'),
      ].some((el) => el.getClientRects().length > 0);
      if (openOverlay) {
        return;
      }
      exit();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [fullscreen]);
};

// Lock page scroll while fullscreen and clear any drag-resize inline
// height (ResizeHandle writes style.height, which would beat inset 0)
const useFullscreenScrollLock = (fullscreen: boolean, frameRef: RefObject<HTMLElement | null>): void => {
  useEffect(() => {
    if (!fullscreen || typeof document === 'undefined') {
      return noCleanup;
    }
    const frame = frameRef.current;
    const prevHeight = frame?.style.height ?? '';
    if (frame) {
      frame.style.height = '';
    }
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    // scrollbar-gutter: stable shrinks the initial containing block, which
    // would leave a gutter-wide strip beside the fixed inset-0 frame
    const prevGutter = document.documentElement.style.scrollbarGutter;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.scrollbarGutter = 'auto';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.documentElement.style.scrollbarGutter = prevGutter;
      if (frame) {
        frame.style.height = prevHeight;
      }
    };
  }, [fullscreen, frameRef]);
};

// Mod+K opens the link dialog (GitLab parity). Scoped to the editor
// frame so multiple editors on a page do not fight over the shortcut.
const useLinkShortcut = (
  frameRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  openLinkDialog: () => void,
): void => {
  const open = useEffectEvent(openLinkDialog);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !enabled || typeof document === 'undefined') {
      return noCleanup;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      const plainMod = (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey;
      if (!plainMod || event.key.toLowerCase() !== 'k') {
        return;
      }
      event.preventDefault();
      open();
    };
    frame.addEventListener('keydown', handleKeyDown);
    return () => {
      frame.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, frameRef]);
};

const useEditorFontFamilies = (bodyToken: string | undefined, headingToken: string | undefined) =>
  useMemo(() => {
    const fonts = getConfig()?.fonts;
    const resolve = (token: string | undefined): string | undefined => {
      if (token === undefined || token === '') {
        return undefined;
      }
      const key = token.startsWith('$') ? token.slice(1) : token;
      // SAFETY: Tamagui font definitions carry `family` as a CSS font-family string.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      return fonts?.[key]?.family as string | undefined;
    };
    return { bodyFontFamily: resolve(bodyToken), headingFontFamily: resolve(headingToken) };
  }, [bodyToken, headingToken]);

// ===========================================================================
// RichEditorImpl
// ===========================================================================

// oxlint-disable-next-line eslint/complexity -- flat render: the count is prop defaults and `??` fallbacks, the logic lives in the hooks above
const RichEditorImpl = ({
  ref,
  size,
  compact = false,
  showToolbar = true,
  showBubbleToolbar = false,
  resizable = true,
  showStatusBar = true,
  sections,
  capabilities = 'full',
  hasError,
  editable = true,
  onStateChange,
  fullscreen: fullscreenProp,
  defaultFullscreen = false,
  onFullscreenChange,
  inlineEditing: _inlineEditing,
  ...editorProps
}: RichEditorCombinedProps & { ref?: Ref<RichEditorRef> }) => {
  const internalRef = useRef<RichEditorRef>(null);
  const frameRef = useRef<HTMLElement>(null);
  const [editorState, setEditorState] = useState<EditorState>(defaultEditorState);
  const [editorMode, setEditorMode] = useState<EditorMode>('richtext');
  const [internalFullscreen, setInternalFullscreen] = useState(defaultFullscreen);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);

  const fullscreen = fullscreenProp ?? internalFullscreen;

  const { knobProps } = useResolvedKnobs({
    component: 'RichEditor',
    size,
    compact,
  });

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

  useEscapeExitsFullscreen(fullscreen, () => {
    handleFullscreenChange(false);
  });
  useFullscreenScrollLock(fullscreen, frameRef);

  const showToolbarNow = showToolbar && editable && editorMode === 'richtext';
  useLinkShortcut(frameRef, showToolbarNow, () => {
    setLinkDialogOpen(true);
  });

  // Delegate per call — a frozen `internalRef.current` snapshot would bind
  // the first render's methods, where the Tiptap editor is still null
  // (immediatelyRender: false), leaving every host-facing method a no-op.
  useImperativeHandle(
    ref,
    () => ({
      executeCommand: (command, payload) => internalRef.current?.executeCommand(command, payload),
      getState: () => internalRef.current?.getState() ?? defaultEditorState,
      getHTML: () => internalRef.current?.getHTML() ?? '',
      // oxlint-disable-next-line typescript/no-unsafe-return -- getJSON is `any` in the public RichEditorRef contract
      getJSON: () => internalRef.current?.getJSON() ?? null,
      getMarkdown: () => internalRef.current?.getMarkdown() ?? '',
      setHTML: (html) => internalRef.current?.setHTML(html),
      setJSON: (json) => internalRef.current?.setJSON(json),
      setMarkdown: (markdown) => internalRef.current?.setMarkdown(markdown),
      focus: () => internalRef.current?.focus(),
      // oxlint-disable-next-line github/no-blur -- forwards the editor API's blur(), not a DOM element blur
      blur: () => internalRef.current?.blur(),
    }),
    [],
  );

  const cappedRadius = clampRadiusForLargeComponent(knobProps.borderRadius.borderRadius, 4);

  const { bodyFontFamily, headingFontFamily } = useEditorFontFamilies(
    knobProps.body?.fontFamily,
    knobProps.heading?.fontFamily,
  );

  const disabled = !editable;

  return (
    <RichEditorContext.Provider
      // SAFETY: knobs resolve sizeToken to a `$`-prefixed size key, which every font-size scale shares.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      size={(knobProps.sizeToken ?? '$true') as FontSizeTokens}
      compact={compact}
      disabled={disabled}>
      <EditorFrame
        // SAFETY: web-only file; the frame renders a DOM element, so TamaguiElement is HTMLElement here.
        // oxlint-disable-next-line typescript/no-explicit-any, typescript/no-unsafe-assignment, typescript/no-unsafe-type-assertion -- see SAFETY above
        ref={frameRef as any}
        hasError={hasError}
        borderRadius={fullscreen ? 0 : cappedRadius}
        borderWidth={fullscreen ? 0 : knobProps.borderRadius.borderWidth}
        borderColor={hasError ? '$red10' : '$color6'}
        backgroundColor={fullscreen ? '$background' : (knobProps.inputBackground ?? '$color2')}
        disabled={disabled}
        // SAFETY: web-only file; 'fixed' is valid CSS but absent from React Native's position type.
        // oxlint-disable-next-line typescript/no-explicit-any, typescript/no-unsafe-assignment, typescript/no-unsafe-type-assertion -- see SAFETY above
        position={fullscreen ? ('fixed' as any) : 'relative'}
        {...(fullscreen && { top: 0, left: 0, right: 0, bottom: 0, zIndex: 100_000 })}>
        {showToolbarNow && (
          <FixedToolbar
            editorRef={internalRef}
            state={editorState}
            sections={sections}
            capabilities={capabilities}
            hasError={hasError}
            fullscreen={fullscreen}
            onFullscreenToggle={() => {
              handleFullscreenChange(!fullscreen);
            }}
            linkDialogOpen={linkDialogOpen}
            onLinkDialogOpenChange={setLinkDialogOpen}
          />
        )}
        <TiptapEditor
          ref={internalRef}
          {...editorProps}
          capabilities={capabilities}
          editable={editable}
          onStateChange={handleStateChange}
          hasError={false}
          showBubbleToolbar={showBubbleToolbar}
          bodyFontFamily={bodyFontFamily}
          headingFontFamily={headingFontFamily}
          editorMode={editorMode}
          fullscreen={fullscreen}
        />
        {showStatusBar && (
          <StatusBar
            state={editorState}
            mode={editorMode}
            onModeChange={setEditorMode}
          />
        )}
        {resizable && !disabled && !fullscreen && (
          <ResizeHandle
            // SAFETY: the handle only mounts after the frame, so the ref is populated when it reads it.
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
            containerRef={frameRef as RefObject<HTMLElement>}
            minHeight={editorProps.minHeight ?? 150}
            maxHeight={editorProps.maxHeight}
          />
        )}
      </EditorFrame>
    </RichEditorContext.Provider>
  );
};

RichEditorImpl.displayName = 'RichEditor';

// ===========================================================================
// Compound Component
// ===========================================================================

export const RichEditor = withStaticProperties(RichEditorImpl, {
  FixedToolbar,
  BubbleToolbar,
  Editor: TiptapEditor,
});
