/**
 * Shared edit/preview arrangement for source-editing fields
 * (MarkdownEditorField, CodeEditorField).
 *
 * At container widths ≥ the house md breakpoint (`layoutBreakpoints.medium`)
 * the editing surface and the rendered preview sit side by side (two-pane);
 * below it they collapse into Write/Preview tabs (components `Tabs`). The
 * pivot measures the field's own container, not the viewport, so a field in
 * a narrow column stays tabbed on a wide screen.
 */

import { layoutBreakpoints, useResolvedKnobs } from '@repo/theme';
import { Tabs, ScrollView } from '@repo/ui';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { XStack, YStack } from 'tamagui';

export interface PreviewSurfaceProps {
  compact?: boolean;
  /** Also scroll horizontally (code panes: long lines never wrap). */
  horizontalScroll?: boolean;
  children: ReactNode;
}

/** Bordered, scrollable surface both preview panes render into. */
export function PreviewSurface({ compact, horizontalScroll, children }: PreviewSurfaceProps) {
  const { knobProps } = useResolvedKnobs({ compact });
  const body = (
    <YStack
      {...knobProps.panelPadding}
      flexGrow={1}>
      {children}
    </YStack>
  );

  return (
    <YStack
      flex={1}
      minHeight={compact ? 112 : 160}
      maxHeight={480}
      backgroundColor="$color2"
      overflow="hidden"
      {...knobProps.borderRadius}
      borderWidth={knobProps.borderRadius.borderWidth ?? 1}
      borderColor="$borderColor">
      <ScrollView
        flex={1}
        contentContainerStyle={{ flexGrow: 1 }}>
        {horizontalScroll ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ minWidth: '100%' }}>
            {body}
          </ScrollView>
        ) : (
          body
        )}
      </ScrollView>
    </YStack>
  );
}

export interface EditorPreviewPanesProps {
  /** Editing surface (textarea pane). */
  editor: ReactNode;
  /** Rendered preview pane. */
  preview: ReactNode;
  editTabLabel: string;
  previewTabLabel: string;
  compact?: boolean;
  /** Start on the preview tab (readOnly display leads with the rendering). */
  defaultPreview?: boolean;
}

export function EditorPreviewPanes({
  editor,
  preview,
  editTabLabel,
  previewTabLabel,
  compact,
  defaultPreview,
}: EditorPreviewPanesProps) {
  const { knobProps } = useResolvedKnobs({ compact });
  const [containerWidth, setContainerWidth] = useState(0);
  const [mode, setMode] = useState<'edit' | 'preview'>(defaultPreview ? 'preview' : 'edit');
  const isSplit = containerWidth >= layoutBreakpoints.medium;

  return (
    <YStack
      width="100%"
      onLayout={(e) => {
        setContainerWidth(e.nativeEvent.layout.width);
      }}
      {...knobProps.gap}>
      {isSplit ? (
        <XStack
          width="100%"
          alignItems="stretch"
          {...knobProps.gap}>
          <YStack
            flex={1}
            minWidth={0}>
            {editor}
          </YStack>
          <YStack
            flex={1}
            minWidth={0}>
            {preview}
          </YStack>
        </XStack>
      ) : (
        // Tabs stay interactive on disabled/readOnly fields: those states gate
        // editing, never viewing — the preview must remain reachable.
        <Tabs
          compact={compact}
          value={mode}
          onChange={(next) => {
            setMode(next === 'preview' ? 'preview' : 'edit');
          }}
          items={[
            { value: 'edit', label: editTabLabel, content: editor },
            { value: 'preview', label: previewTabLabel, content: preview },
          ]}
        />
      )}
    </YStack>
  );
}
