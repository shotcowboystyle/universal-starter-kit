import { getLayoutSizeClass, useResolvedKnobs } from '@repo/theme';
/**
 * 12-column workspace grid — desk parity for the editorjs block layout.
 *
 * Blocks carry a `col` span (3 = shortcut, 4 = card, 12 = full row).
 * Consecutive blocks accumulate into rows of up to 12 columns and each row
 * lays out with flex ratios, so no pixel math is needed. The container
 * measures itself with `onLayout` (cross-platform — no media queries, no
 * DOM) and collapses spans on narrow widths: everything full-width on
 * phones, two-up on mid widths, desk's ~3–4 column layout when wide.
 */
import { XStack, YStack } from '@repo/ui';
import type { YStackProps } from '@repo/ui';
import { useState } from 'react';
import type { ReactNode } from 'react';

/** Container width below which small blocks go two-up. */
const MEDIUM_MAX = 960;

export interface WorkspaceGridItem {
  key: string;
  /** 12-column span requested by the block (defaults to 12). */
  col?: number;
  node: ReactNode;
}

const effectiveSpan = (raw: number | undefined, width: number): number => {
  const span = Math.min(Math.max(Math.round(raw ?? 12), 1), 12);
  // Not measured yet — desk-wide layout.
  if (width <= 0) {
    return span;
  }
  // `compact` is the canonical class below the house medium breakpoint (LC-28).
  if (getLayoutSizeClass(width) === 'compact') {
    return 12;
  }
  if (width < MEDIUM_MAX) {
    return span <= 6 ? 6 : 12;
  }
  return span;
};

export interface WorkspaceGridProps extends YStackProps {
  items: WorkspaceGridItem[];
}

export const WorkspaceGrid = ({ items, ...stackProps }: WorkspaceGridProps) => {
  const { knobProps } = useResolvedKnobs();
  const [width, setWidth] = useState(0);

  // Chunk consecutive blocks into rows of up to 12 columns (desk behavior).
  const rows: { item: WorkspaceGridItem; span: number }[][] = [];
  let current: { item: WorkspaceGridItem; span: number }[] = [];
  let used = 0;
  for (const item of items) {
    const span = effectiveSpan(item.col, width);
    if (used + span > 12 && current.length > 0) {
      rows.push(current);
      current = [];
      used = 0;
    }
    current.push({ item, span });
    used += span;
  }
  if (current.length > 0) {
    rows.push(current);
  }

  return (
    <YStack
      {...knobProps.gap}
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
      {...stackProps}>
      {rows.map((row, rowIndex) => {
        const rowUsed = row.reduce((sum, cell) => sum + cell.span, 0);
        return (
          <XStack
            key={row[0]?.item.key ?? rowIndex}
            {...knobProps.gap}
            alignItems="stretch">
            {row.map(({ item, span }) => (
              <YStack
                key={item.key}
                flexGrow={span}
                flexShrink={1}
                flexBasis={0}
                minWidth={0}>
                {item.node}
              </YStack>
            ))}
            {/* Filler keeps a partial row's cells at their 12-col width
                (a lone col-3 shortcut stays ~25%, like desk). */}
            {rowUsed < 12 ? (
              <YStack
                flexGrow={12 - rowUsed}
                flexBasis={0}
              />
            ) : null}
          </XStack>
        );
      })}
    </YStack>
  );
};
