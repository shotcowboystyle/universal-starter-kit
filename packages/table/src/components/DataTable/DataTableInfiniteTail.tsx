/**
 * Infinite mode tail, shared by the web and native roots: the load-more
 * trigger each platform supplies, an append skeleton bounded by the actual
 * load (no infinite spinner), and an honest, announced end-of-data state
 * (DG-ST-01/04).
 */

import { Skeleton } from '@repo/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'tamagui';

import type { DataTableInfiniteState } from '../../types';
import { bidiIsolate, withInterp } from '../../utils/withInterp';

export interface DataTableInfiniteTailProps {
  infinite: DataTableInfiniteState;
  /** Rows on screen now, for "Showing N of M". */
  visibleCount: number;
  /** False when the virtualizer draws its own skeleton row. */
  showAppendSkeleton: boolean;
  rowHeightPx: number;
  fontSize: any;
  gapProps?: Record<string, unknown>;
  /** The platform's load-more trigger; absent once the data is exhausted. */
  sentinel?: ReactNode;
}

export function DataTableInfiniteTail({
  infinite,
  visibleCount,
  showAppendSkeleton,
  rowHeightPx,
  fontSize,
  gapProps,
  sentinel,
}: DataTableInfiniteTailProps) {
  const { t } = useTranslation();
  return (
    <View
      flexDirection="column"
      width="100%">
      {sentinel}
      {showAppendSkeleton && infinite.isAppending ? (
        <View
          flexDirection="column"
          width="100%"
          {...gapProps}
          paddingVertical="$2"
          aria-hidden
          {...({ 'data-testid': 'infinite-append-skeleton' } as any)}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton
              key={i}
              width="100%"
              height={rowHeightPx - 8}
            />
          ))}
        </View>
      ) : null}
      <Text
        role="status"
        aria-live="polite"
        textAlign="center"
        paddingVertical="$2"
        fontSize={fontSize}
        color="$color10"
        {...({ 'data-testid': 'infinite-status' } as any)}>
        {/* Numeric labels are bidi-isolated so RTL contexts keep
            the interpolated runs in order (FSI…PDI). */}
        {infinite.isAppending
          ? t('Loading more rows…')
          : infinite.exhausted
            ? typeof infinite.totalCount === 'number' && infinite.totalCount > 0
              ? bidiIsolate(
                  withInterp(t('All {{count}} rows loaded', { count: infinite.totalCount }), {
                    count: infinite.totalCount,
                  }),
                )
              : t('End of results')
            : typeof infinite.totalCount === 'number'
              ? bidiIsolate(
                  withInterp(
                    t('Showing {{visible}} of {{total}} rows', {
                      visible: visibleCount,
                      total: infinite.totalCount,
                    }),
                    { visible: visibleCount, total: infinite.totalCount },
                  ),
                )
              : bidiIsolate(
                  withInterp(t('Showing {{visible}} rows', { visible: visibleCount }), {
                    visible: visibleCount,
                  }),
                )}
      </Text>
    </View>
  );
}
