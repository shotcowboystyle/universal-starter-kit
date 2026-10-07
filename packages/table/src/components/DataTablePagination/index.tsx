import { Pagination, getPaginationItems } from '@repo/ui';
import { Input, Select } from '@repo/forms';
import {
  ensureCompositeFocusRing,
  isTouchSurface,
  MIN_PRESS_TARGET,
  sizeRecipeForToken,
  textFieldInset,
  useResolvedKnobs,
} from '@repo/theme';
import { useMemo, useState } from 'react';
import type React from 'react';
import { Text, View, XStack, getTokenValue, useMedia } from 'tamagui';

import type { TablePagination, TablePaginationState } from '../../types';
import { DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE_OPTIONS } from '../../utils/paginationDefaults';
import { bidiIsolate } from '../../utils/withInterp';
import { useDataTableState } from '../DataTable/DataTableStateContext';

export interface DataTablePaginationProps {
  pagination?: TablePaginationState;
  onPaginationChange?: (pagination: TablePagination) => void;
  pageSizeOptions?: number[];
  showInfo?: boolean;
  showPageSizeSelector?: boolean;
  showPageJump?: boolean;
  /**
   * LC-37 HONEST-VIEWPORT (P-06): a pager over one page navigates nowhere, so
   * it is hidden by default. Eject to keep the pager chrome visible anyway.
   */
  showPagerWhenSinglePage?: boolean;
  compact?: boolean;
}

function controlWidth(chars: number, fontSize: number, inset: number, trailingChrome = 0) {
  // Conservative $body digit width, checked against rendered ink in Storybook.
  // Include the Box's two hairline borders after its single horizontal inset.
  return Math.ceil(chars * fontSize * 0.65) + inset * 2 + trailingChrome + 2;
}

function formatRange(start: number, end: number, total: number) {
  if (total === 0) {
    return '0–0 items';
  }
  return `${start}–${end} of ${total} items`;
}

/**
 * DataTable footer pager. Page navigation is the catalog
 * `Pagination` component (`variant={simplePager ? "simple" : "numbered"}`) — one pagination idiom
 * across the system. This wrapper adds the table-specific chrome:
 * rows-per-page selector, go-to-page jump, and the item-range summary.
 *
 * Anatomy follows Carbon/MUI table footers: size + numbered window + range,
 * with Ant's quick-jumper only when there is somewhere to type to. Compact
 * inside a DataTable stays shrink-wrapped so the table's own range can sit
 * beside it; standalone compact (reports, stories) keeps the range (LC-37).
 */
export function DataTablePagination(props: DataTablePaginationProps) {
  const ctx = useDataTableState();
  const insideTable = Boolean(ctx);

  const pagination =
    props.pagination ??
    (ctx
      ? {
          pageIndex: ctx.state.pagination.pageIndex,
          pageSize: ctx.state.pagination.pageSize,
          totalPages: ctx.computed.totalPages,
          totalCount: ctx.computed.totalRows,
          hasPreviousPage: ctx.state.pagination.pageIndex > 0,
          hasNextPage: ctx.state.pagination.pageIndex < ctx.computed.totalPages - 1,
        }
      : {
          pageIndex: 0,
          pageSize: DEFAULT_PAGE_SIZE,
          totalPages: 1,
          totalCount: 0,
          hasPreviousPage: false,
          hasNextPage: false,
        });

  const onPaginationChange =
    props.onPaginationChange ??
    (ctx
      ? (p: TablePagination) => {
          ctx.actions.setPagination(p);
        }
      : () => {});

  const {
    pageSizeOptions = [...DEFAULT_PAGE_SIZE_OPTIONS],
    showInfo = true,
    showPageSizeSelector = true,
    showPageJump = true,
    showPagerWhenSinglePage = false,
    compact,
  } = props;

  const { sm } = useMedia();
  const { knobProps } = useResolvedKnobs(compact === undefined ? undefined : { compact });
  // The fields are always compact, independently of the footer's layout.
  const { knobProps: fieldKnobs } = useResolvedKnobs({ compact: true });
  const fieldRecipe = sizeRecipeForToken(knobProps.sizeToken, { touch: isTouchSurface() });
  const selectInset = Number(
    getTokenValue(fieldKnobs.panelPadding.padding as Parameters<typeof getTokenValue>[0], 'space'),
  );
  const isMobile = !sm;
  const packed = compact && insideTable;
  const [availableWidth, setAvailableWidth] = useState<number | undefined>();
  const measureWidth = (event: import('react-native').LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0) {
      setAvailableWidth((previous) => (previous === width ? previous : width));
    }
  };
  // LC-71: mount the composite-boundary ring sheet before Select/Input paint.
  ensureCompositeFocusRing();

  const handlePageSizeChange = (newPageSize: number) => {
    if (!Number.isFinite(newPageSize) || newPageSize <= 0) {
      return;
    }
    if (newPageSize === pagination.pageSize && pagination.pageIndex === 0) {
      return;
    }
    onPaginationChange({
      pageIndex: 0,
      pageSize: newPageSize,
    });
  };

  const handlePageChange = (newPageIndex: number) => {
    if (newPageIndex >= 0 && newPageIndex < (pagination.totalPages ?? 1)) {
      onPaginationChange({
        pageIndex: newPageIndex,
        pageSize: pagination.pageSize,
      });
    }
  };

  const currentPage = pagination.pageIndex + 1;
  const totalPages = pagination.totalPages ?? 1;
  const showPager = totalPages > 1 || showPagerWhenSinglePage;
  const totalCount = pagination.totalCount ?? 0;
  const startItem = totalCount === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const endItem = Math.min((pagination.pageIndex + 1) * pagination.pageSize, totalCount);

  // Budget the numbered window from the active theme's control geometry.
  // An unmeasured host uses the safe simple presentation, including SSR.
  const pageControls = getPaginationItems(totalPages, currentPage).length + 2 + (!compact && !isMobile ? 2 : 0);
  const controlBudget = Math.max(MIN_PRESS_TARGET, knobProps.control.height + knobProps.control.paddingHorizontal * 2);
  const gapPixels = Number(getTokenValue(knobProps.gap.gap as Parameters<typeof getTokenValue>[0], 'space'));
  const paddingPixels = packed
    ? 0
    : Number(getTokenValue(knobProps.panelPadding.padding as Parameters<typeof getTokenValue>[0], 'space'));
  const measuredBudget = pageControls * controlBudget + Math.max(0, pageControls - 1) * gapPixels + paddingPixels * 2;
  const numberedBudget = Number.isFinite(measuredBudget) ? measuredBudget : Infinity;
  const simplePager = availableWidth === undefined || availableWidth < numberedBudget;

  const sizeOptions = useMemo(() => {
    const sizes = new Set(pageSizeOptions.filter((n) => Number.isFinite(n) && n > 0));
    if (pagination.pageSize > 0) {
      sizes.add(pagination.pageSize);
    }
    return [...sizes].sort((a, b) => a - b);
  }, [pageSizeOptions, pagination.pageSize]);

  const showSize = showPageSizeSelector;
  // Compact-inside-DataTable: the table footer already paints the range.
  const showRange = showInfo && !(compact && insideTable);
  const showJump = showPageJump && showPager && !compact && !isMobile && !simplePager;

  const [jumpNonce, setJumpNonce] = useState(0);

  const commitJump = (pageNumber: string, revertInvalid = false) => {
    const page = Number.parseInt(pageNumber, 10) - 1;
    if (!Number.isNaN(page) && page >= 0 && page < totalPages) {
      if (page !== pagination.pageIndex) {
        handlePageChange(page);
      }
      return;
    }
    if (revertInvalid) {
      setJumpNonce((n) => n + 1);
    }
  };

  if (!showPager && !showSize && !showRange) {
    return null;
  }

  const helperText = {
    ...knobProps.label,
    color: knobProps.textAccentColor,
    userSelect: 'none' as const,
  };

  const sizeControl = showSize ? (
    <XStack
      alignItems="center"
      gap="$2"
      flexShrink={0}
      flexWrap="wrap"
      minWidth={0}
      maxWidth="100%">
      <Text {...helperText}>Rows per page:</Text>
      <View
        width={Math.max(
          80,
          controlWidth(
            Math.max(2, ...sizeOptions.map((n) => String(n).length)),
            fieldKnobs.controlType.fontSize,
            selectInset,
            fieldRecipe.gap + 16, // Select's fixed 16px caret.
          ),
        )}
        overflow="visible"
        flexShrink={0}
        {...({ 'data-pagination-control': 'size' } as object)}>
        <Select
          value={String(pagination.pageSize)}
          onChange={(value) => {
            if (typeof value === 'string') {
              handlePageSizeChange(Number.parseInt(value, 10));
            }
          }}
          options={sizeOptions.map((size) => ({
            label: String(size),
            value: String(size),
          }))}
          aria-label="Select rows per page"
          size={knobProps.sizeToken}
          compact
        />
      </View>
    </XStack>
  ) : null;

  const pager = showPager ? (
    <Pagination
      variant={simplePager ? 'simple' : 'numbered'}
      total={totalPages}
      page={currentPage}
      onPageChange={(page) => {
        handlePageChange(page - 1);
      }}
      showFirstLast={!simplePager && !compact && !isMobile}
      aria-label="Page"
      padding={0}
    />
  ) : null;

  const jumpControl = showJump ? (
    <XStack
      alignItems="center"
      gap="$2"
      flexShrink={0}
      aria-label="Jump to page">
      <Text {...helperText}>Go to page:</Text>
      <View
        width={Math.max(48, controlWidth(String(totalPages).length, fieldRecipe.fontSize, textFieldInset(fieldRecipe)))}
        overflow="visible"
        flexShrink={0}
        {...({ 'data-pagination-control': 'jump' } as object)}>
        <Input
          key={`${currentPage}-${jumpNonce}`}
          defaultValue={String(currentPage)}
          inputProps={{
            inputMode: 'numeric',
            autoComplete: 'off',
            style: { textAlign: 'center' },
            onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') {
                commitJump((e.target as HTMLInputElement).value, true);
              }
            },
          }}
          placeholder={`1-${totalPages}`}
          aria-label="Page number"
          size={knobProps.sizeToken}
          compact
        />
      </View>
      <Text
        {...helperText}
        aria-hidden>
        / {bidiIsolate(String(totalPages))}
      </Text>
    </XStack>
  ) : null;

  const rangeControl = showRange ? (
    <Text
      {...helperText}
      aria-live="polite"
      whiteSpace="nowrap"
      flexShrink={0}>
      {bidiIsolate(formatRange(startItem, endItem, totalCount))}
    </Text>
  ) : null;

  if (packed) {
    return (
      <XStack
        role="group"
        aria-label="Table pagination"
        onLayout={measureWidth}
        minWidth={0}
        maxWidth="100%"
        flexGrow={1}
        flexShrink={1}
        flexWrap="wrap"
        alignItems="center"
        overflow="visible"
        {...knobProps.gap}>
        {sizeControl}
        {pager}
      </XStack>
    );
  }

  return (
    // LC-10: intrinsic cluster widths participate in wrapping. Zero flex
    // bases let the controls overlap while the footer itself still fits.
    // A constrained size cluster can also wrap its label above the field.
    <XStack
      role="group"
      aria-label="Table pagination"
      onLayout={measureWidth}
      minWidth={0}
      alignItems="center"
      overflow="visible"
      {...knobProps.gapLg}
      rowGap={knobProps.gap.gap}
      flexWrap="wrap"
      width="100%"
      paddingHorizontal={knobProps.panelPadding.padding}
      paddingVertical="$2">
      <XStack
        alignItems="center"
        flexGrow={1}
        flexShrink={1}
        minWidth={0}
        maxWidth="100%"
        justifyContent="flex-start">
        {sizeControl}
      </XStack>

      {pager ? (
        <XStack
          alignItems="center"
          flexGrow={1}
          flexShrink={0}
          justifyContent="center">
          {pager}
        </XStack>
      ) : null}

      {(jumpControl || rangeControl) && (
        <XStack
          alignItems="center"
          {...knobProps.gap}
          flexGrow={1}
          flexShrink={0}
          justifyContent="flex-end">
          {jumpControl}
          {rangeControl}
        </XStack>
      )}
    </XStack>
  );
}
