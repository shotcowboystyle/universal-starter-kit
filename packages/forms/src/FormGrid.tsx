import { useResolvedKnobs } from '@repo/theme';
import { Children, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { XStack, YStack, isWeb, useMedia } from 'tamagui';

/** Container/media width below which multi-column form grids collapse to 1 col. */
export const FORM_GRID_COLLAPSE_WIDTH = 480;

export type FormGridColumns = 1 | 2;

export interface FormGridProps {
  /**
   * Requested columns when the container is comfortable.
   * Default: 1 (single-column default).
   */
  columns?: FormGridColumns;
  /**
   * Hard cap on columns (responsive 2-col groups).
   * Default: 2.
   */
  maxColumns?: FormGridColumns;
  /**
   * Gap between fields. Defaults to the space recipe (`knobProps.gap`) —
   * density/space, never `sizeToken`. Number = px eject; token string allowed.
   */
  gap?: number | string;
  /** Nested scale. Omit to inherit the nearest Preset density. */
  compact?: boolean;
  children: ReactNode;
}

function resolveWideColumns(columns: FormGridColumns, maxColumns: FormGridColumns): FormGridColumns {
  return Math.min(columns, maxColumns) as FormGridColumns;
}

/**
 * Lays out form fields in a grid with correct tab order (left-to-right across rows).
 *
 * List children in visual row order: [row1col1, row1col2, row2col1, row2col2, ...]
 *
 * Defaults to a single column. When `columns={2}`, expands to two columns only when
 * the container is at least {@link FORM_GRID_COLLAPSE_WIDTH} wide (container measure
 * on web; viewport media on native).
 */
export function FormGrid({ columns = 1, maxColumns = 2, gap, compact, children }: FormGridProps) {
  const { knobProps } = useResolvedKnobs(compact === undefined ? undefined : { compact });
  const gapFragment = gap === undefined ? knobProps.gap : { gap };
  const resolvedGap = gapFragment.gap;
  const wideColumns = resolveWideColumns(columns, maxColumns);

  if (isWeb) {
    return (
      <FormGridWeb
        columns={wideColumns}
        maxColumns={maxColumns}
        gap={resolvedGap}
        gapFragment={gapFragment}
        density={knobProps.density}
        size={knobProps.size}>
        {children}
      </FormGridWeb>
    );
  }

  return (
    <FormGridNative
      columns={wideColumns}
      maxColumns={maxColumns}
      gap={resolvedGap}
      gapFragment={gapFragment}
      density={knobProps.density}
      size={knobProps.size}>
      {children}
    </FormGridNative>
  );
}

function FormGridWeb({
  columns,
  maxColumns,
  gap,
  gapFragment,
  density,
  size,
  children,
}: {
  columns: FormGridColumns;
  maxColumns: FormGridColumns;
  gap: number | string;
  gapFragment: { gap: number | string };
  density: string;
  size: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [containerWide, setContainerWide] = useState(true);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || columns <= 1) {
      setContainerWide(true);
      return;
    }

    const update = (width: number) => {
      setContainerWide(width >= FORM_GRID_COLLAPSE_WIDTH);
    };

    update(el.getBoundingClientRect().width);

    if (typeof ResizeObserver === 'undefined') {
      const onResize = () => {
        update(el.getBoundingClientRect().width);
      };
      window.addEventListener('resize', onResize);
      return () => {
        window.removeEventListener('resize', onResize);
      };
    }

    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? el.getBoundingClientRect().width;
      update(width);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [columns]);

  const effectiveColumns: FormGridColumns = columns <= 1 || !containerWide ? 1 : columns;

  const style: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${effectiveColumns}, minmax(0, 1fr))`,
    // Enable container queries for consumers / CSS extensions.
    containerType: columns > 1 ? 'inline-size' : undefined,
  };

  return (
    <YStack
      ref={ref as never}
      data-mpo-form-grid=""
      data-columns={effectiveColumns}
      data-max-columns={maxColumns}
      data-requested-columns={columns}
      data-gap={String(gap)}
      data-density={density}
      data-size={size}
      {...gapFragment}
      width="100%"
      minWidth={0}
      style={style}>
      {children}
    </YStack>
  );
}

function FormGridNative({
  columns,
  maxColumns,
  gap,
  gapFragment,
  density,
  size,
  children,
}: {
  columns: FormGridColumns;
  maxColumns: FormGridColumns;
  gap: number | string;
  gapFragment: { gap: number | string };
  density: string;
  size: string;
  children: ReactNode;
}) {
  const media = useMedia();
  // React Native defines a `window` global without DOM event methods or
  // innerWidth, so bare `typeof window` checks are not enough — the resize
  // listener crashed on native ("window.addEventListener is not a function").
  const canUseDomResize =
    typeof window !== 'undefined' &&
    typeof window.addEventListener === 'function' &&
    typeof window.innerWidth === 'number';
  // Prefer live viewport width when available; fall back to Tamagui media
  // (`xs` = v5 minWidth 460, nearest key to FORM_GRID_COLLAPSE_WIDTH 480 —
  // the old `gtSm` key died with the v5 media map), which stays
  // reactive on native.
  const [domViewportWide, setDomViewportWide] = useState(() =>
    canUseDomResize ? window.innerWidth >= FORM_GRID_COLLAPSE_WIDTH : true,
  );

  useEffect(() => {
    if (!canUseDomResize) {
      return;
    }
    const handler = () => {
      setDomViewportWide(window.innerWidth >= FORM_GRID_COLLAPSE_WIDTH);
    };
    handler();
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('resize', handler);
    };
  }, [canUseDomResize]);

  const viewportWide = canUseDomResize ? domViewportWide : media.xs;
  const effectiveColumns: FormGridColumns = columns <= 1 || !viewportWide ? 1 : columns;

  const childArray = Children.toArray(children);
  const rows: ReactNode[][] = [];
  for (let i = 0; i < childArray.length; i += effectiveColumns) {
    rows.push(childArray.slice(i, i + effectiveColumns));
  }

  return (
    <YStack
      {...gapFragment}
      width="100%"
      data-mpo-form-grid=""
      data-columns={effectiveColumns}
      data-max-columns={maxColumns}
      data-requested-columns={columns}
      data-gap={String(gap)}
      data-density={density}
      data-size={size}>
      {rows.map((row, rowIndex) => (
        <XStack key={rowIndex} {...gapFragment}>
          {row.map((child, colIndex) => (
            <YStack key={colIndex} flex={1} minWidth={0}>
              {child}
            </YStack>
          ))}
        </XStack>
      ))}
    </YStack>
  );
}
