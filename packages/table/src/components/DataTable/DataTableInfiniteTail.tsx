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
import { bidiIsolate, withInterp } from '../../utils/with-interp';

export interface DataTableInfiniteTailProps {
  infinite: DataTableInfiniteState;
  /** Rows on screen now, for "Showing N of M". */
  visibleCount: number;
  /** False when the virtualizer draws its own skeleton row. */
  showAppendSkeleton: boolean;
  rowHeightPx: number;
  /** The knob size token; it is a valid font-size token name. */
  fontSize: string;
  gapProps?: { gap: string };
  /** The platform's load-more trigger; absent once the data is exhausted. */
  sentinel?: ReactNode;
}

export const DataTableInfiniteTail = ({
  infinite,
  visibleCount,
  showAppendSkeleton,
  rowHeightPx,
  fontSize,
  gapProps,
  sentinel,
}: DataTableInfiniteTailProps) => {
  const { t } = useTranslation();
  const { totalCount } = infinite;
  const hasTotal = totalCount !== undefined;
  let status: string;
  if (infinite.isAppending) {
    status = t('Loading more rows…');
  } else if (infinite.exhausted) {
    status =
      hasTotal && totalCount > 0
        ? bidiIsolate(withInterp(t('All {{count}} rows loaded', { count: totalCount }), { count: totalCount }))
        : t('End of results');
  } else if (hasTotal) {
    status = bidiIsolate(
      withInterp(t('Showing {{visible}} of {{total}} rows', { visible: visibleCount, total: totalCount }), {
        visible: visibleCount,
        total: totalCount,
      }),
    );
  } else {
    status = bidiIsolate(
      withInterp(t('Showing {{visible}} rows', { visible: visibleCount }), {
        visible: visibleCount,
      }),
    );
  }
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
          {...{ 'data-testid': 'infinite-append-skeleton' }}>
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
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui Text is the cross-platform primitive (no native <output> on RN); role supplies the live-region semantics
        role="status"
        aria-live="polite"
        textAlign="center"
        paddingVertical="$2"
        fontSize={fontSize}
        color="$color10"
        {...{ 'data-testid': 'infinite-status' }}>
        {/* Numeric labels are bidi-isolated so RTL contexts keep
            the interpolated runs in order (FSI…PDI). */}
        {status}
      </Text>
    </View>
  );
};
