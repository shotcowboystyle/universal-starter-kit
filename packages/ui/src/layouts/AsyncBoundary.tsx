/**
 * AsyncBoundary — first-class loading / empty / error / data states.
 *
 * Empty chrome is never shown when `error` is set (error wins).
 * Default loading uses a layout-matched skeleton (no layout jump).
 * Counts/badges in the failure chrome are hidden (`hideBadges`).
 * Data views treat these as first-class states.
 *
 * Subsequent loads (React Query isFetching / SWR revalidate) keep the last
 * settled data painted — skeleton and full-page error chrome are first-load
 * only. A slim pending bar or inline error Alert rides on top of the rows.
 */

import { WarningCircleIcon } from '@phosphor-icons/react';
import { Button, Spinner } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { XStack, YStack, type YStackProps } from 'tamagui';

import { Alert } from '../Alert';
import { useTranslation } from '../shared/i18n';
import { Skeleton } from '../Skeleton';
import { Text } from '../Text';

import { EmptyState } from './Page';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AsyncStatus = 'loading' | 'empty' | 'error' | 'data';

/** Layout recipe for the default skeleton. */
export type AsyncBoundaryLayout = 'list' | 'table' | 'kanban' | 'dashboard' | 'generic';

export interface AsyncBoundaryContextValue {
  status: AsyncStatus;
  /** True when status is `error` — counts/badges must not render. */
  hideBadges: boolean;
  error: unknown;
  /** Refetch in flight over previously settled content. */
  pending: boolean;
  /** Showing previously settled data despite a later error. */
  stale: boolean;
}

const AsyncBoundaryContext = createContext<AsyncBoundaryContextValue | null>(null);

/** Read async status from the nearest AsyncBoundary (null outside). */
export function useAsyncBoundary(): AsyncBoundaryContextValue | null {
  return useContext(AsyncBoundaryContext);
}

/**
 * Count / badge value that degrades on failure.
 * Returns `undefined` when the nearest boundary is in `error` (or when
 * `value` is already undefined) so Badge/count chrome hides instead of lying.
 */
export function useAsyncCount(value: number | undefined): number | undefined {
  const ctx = useAsyncBoundary();
  if (ctx?.hideBadges) {
    return undefined;
  }
  return value;
}

export interface AsyncBoundaryProps extends Omit<YStackProps, 'children'> {
  /**
   * Loading slot. `true` → layout skeleton; custom node replaces it.
   * Boolean false / undefined → not loading.
   */
  loading?: boolean | ReactNode;
  /**
   * Empty slot. `true` → default EmptyState; custom node replaces it.
   * Ignored entirely when `error` is set.
   */
  empty?: boolean | ReactNode;
  /**
   * Error slot. Truthy string / Error / node / `true` → error UI.
   * Wins over loading and empty.
   */
  error?: boolean | string | Error | ReactNode | null;
  /** Ready content. Alias of `children`. */
  data?: ReactNode;
  children?: ReactNode;
  /** Skeleton layout when `loading={true}` (default: generic). */
  layout?: AsyncBoundaryLayout;
  /** Retry action shown on the default error UI. */
  onRetry?: () => void;
  /** Default error EmptyState title. */
  errorTitle?: string;
  /** Default empty EmptyState title when `empty={true}`. */
  emptyTitle?: string;
  /** Default empty description. */
  emptyDescription?: string;
  /** Default error description (overrides Error.message when set). */
  errorDescription?: string;
  /** Compact EmptyState chrome for inline table/column use. */
  compact?: boolean;
  /**
   * Optional chrome (filters, count badges, toolbars) rendered only for
   * `data` / `empty` / `loading`. Hidden on `error` so badges can't lie.
   * Kept visible when a refetch error leaves previous data on screen.
   */
  chrome?: ReactNode;
  /**
   * Keep the last settled data (or empty chrome) painted while a later
   * `loading`/`error` flag is set. Default true — first load with nothing
   * settled still uses the layout skeleton / full error EmptyState.
   */
  keepPrevious?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isReactNodeSlot(value: unknown): value is ReactNode {
  if (value == null || typeof value === 'boolean') {
    return false;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return false;
  }
  if (value instanceof Error) {
    return false;
  }
  return true;
}

function isActiveError(error: AsyncBoundaryProps['error']): boolean {
  if (error == null || error === false) {
    return false;
  }
  return true;
}

function isActiveFlag(value: boolean | ReactNode | undefined): boolean {
  if (value == null || value === false) {
    return false;
  }
  return true;
}

export function resolveAsyncStatus(opts: {
  loading?: boolean | ReactNode;
  empty?: boolean | ReactNode;
  error?: boolean | string | Error | ReactNode | null;
}): AsyncStatus {
  if (isActiveError(opts.error)) {
    return 'error';
  }
  if (isActiveFlag(opts.loading)) {
    return 'loading';
  }
  if (isActiveFlag(opts.empty)) {
    return 'empty';
  }
  return 'data';
}

function errorCopy(
  error: AsyncBoundaryProps['error'],
  errorTitle: string,
  errorDescription?: string,
): { title: string; description?: string } {
  if (typeof error === 'string') {
    return { title: errorTitle, description: errorDescription ?? error };
  }
  if (error instanceof Error) {
    return { title: errorTitle, description: errorDescription ?? error.message };
  }
  return { title: errorTitle, description: errorDescription };
}

const seenDevWarns = new Set<string>();

function asyncDevWarn(code: string, detail = ''): void {
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  const key = `${code}:${detail}`;
  if (seenDevWarns.has(key)) {
    return;
  }
  seenDevWarns.add(key);
  console.warn(`[AsyncBoundary] ${code}${detail ? ` (${detail})` : ''}`);
}

/** @internal test helper */
export function __resetAsyncDevWarnSeen(): void {
  seenDevWarns.clear();
}

// ---------------------------------------------------------------------------
// Layout skeletons
// ---------------------------------------------------------------------------

export function AsyncSkeleton({ layout = 'generic', ...rest }: { layout?: AsyncBoundaryLayout } & YStackProps) {
  const { t } = useTranslation();
  switch (layout) {
    case 'list':
      return (
        <YStack gap="$3" width="100%" data-async-skeleton="list" aria-busy aria-label={t('Loading')} {...rest}>
          {Array.from({ length: 5 }).map((_, i) => (
            <XStack key={i} gap="$3" alignItems="center" paddingVertical="$2">
              <Skeleton.Circle size={40} />
              <YStack flex={1} gap="$1">
                <Skeleton width="70%" height={14} />
                <Skeleton width="40%" height={12} />
              </YStack>
            </XStack>
          ))}
        </YStack>
      );
    case 'table':
      return (
        <YStack gap="$2" width="100%" data-async-skeleton="table" aria-busy aria-label={t('Loading')} {...rest}>
          <XStack gap="$3" paddingBottom="$2" borderBottomWidth={1} borderColor="$color5">
            <Skeleton width={120} height={14} />
            <Skeleton width={100} height={14} />
            <Skeleton width={80} height={14} />
            <Skeleton width={60} height={14} />
          </XStack>
          {Array.from({ length: 5 }).map((_, i) => (
            <XStack key={i} gap="$3" paddingVertical="$2">
              <Skeleton width={120} height={14} />
              <Skeleton width={100} height={14} />
              <Skeleton width={80} height={14} />
              <Skeleton width={60} height={14} />
            </XStack>
          ))}
        </YStack>
      );
    case 'kanban':
      return (
        <XStack gap="$3" width="100%" data-async-skeleton="kanban" aria-busy aria-label={t('Loading')} {...rest}>
          {Array.from({ length: 3 }).map((_, col) => (
            <YStack
              key={col}
              width={260}
              gap="$2"
              padding="$3"
              borderWidth={1}
              borderColor="$borderColor"
              borderRadius="$4">
              <XStack justifyContent="space-between" alignItems="center">
                <Skeleton width={100} height={14} />
                {/* No count badge skeleton — avoid promising a count */}
              </XStack>
              {Array.from({ length: 3 }).map((_, row) => (
                <Skeleton key={row} variant="rounded" width="100%" height={64} />
              ))}
            </YStack>
          ))}
        </XStack>
      );
    case 'dashboard':
      return (
        <YStack gap="$4" width="100%" data-async-skeleton="dashboard" aria-busy aria-label={t('Loading')} {...rest}>
          <XStack gap="$3" flexWrap="wrap">
            {Array.from({ length: 4 }).map((_, i) => (
              <YStack
                key={i}
                width={180}
                gap="$2"
                padding="$3"
                borderWidth={1}
                borderColor="$borderColor"
                borderRadius="$4">
                <Skeleton width="50%" height={12} />
                <Skeleton width="70%" height={28} />
                <Skeleton width="40%" height={12} />
              </YStack>
            ))}
          </XStack>
          <Skeleton variant="rounded" width="100%" height={200} />
        </YStack>
      );
    default:
      return (
        <YStack gap="$3" width="100%" data-async-skeleton="generic" aria-busy aria-label={t('Loading')} {...rest}>
          <Skeleton.Text lines={4} />
        </YStack>
      );
  }
}

// ---------------------------------------------------------------------------
// Pending bar (refetch over settled content)
// ---------------------------------------------------------------------------

function AsyncPendingBar() {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs({ compact: true });
  return (
    <XStack
      data-async-pending="true"
      role="status"
      aria-live="polite"
      aria-label={t('Updating...')}
      alignItems="center"
      {...knobProps.gap}>
      <Spinner size="small" aria-hidden />
      <Text {...knobProps.label} color={knobProps.textAccentColor}>
        {t('Updating...')}
      </Text>
    </XStack>
  );
}

function defaultEmptyBody({
  empty,
  compact,
  emptyTitle,
  emptyDescription,
}: {
  empty: AsyncBoundaryProps['empty'];
  compact: boolean;
  emptyTitle: string;
  emptyDescription?: string;
}): ReactNode {
  if (empty !== true && isReactNodeSlot(empty)) {
    return empty;
  }
  return (
    <EmptyState
      compact={compact}
      intent="neutral"
      data-async-state="empty"
      title={emptyTitle}
      description={emptyDescription}
    />
  );
}

function defaultErrorBody({
  error,
  compact,
  errorTitle,
  errorDescription,
  onRetry,
  retryLabel,
}: {
  error: AsyncBoundaryProps['error'];
  compact: boolean;
  errorTitle: string;
  errorDescription?: string;
  onRetry?: () => void;
  retryLabel: string;
}): ReactNode {
  if (isReactNodeSlot(error)) {
    return error;
  }
  const copy = errorCopy(error, errorTitle, errorDescription);
  return (
    <EmptyState
      compact={compact}
      intent="error"
      data-async-state="error"
      title={copy.title}
      description={copy.description}
      icon=<WarningCircleIcon size={compact ? 24 : 32} />
      action={
        onRetry ? (
          <Button size={compact ? '$3' : '$4'} onPress={onRetry}>
            <Text fontWeight="400">{retryLabel}</Text>
          </Button>
        ) : undefined
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders exactly one of: error → loading → empty → data.
 *
 * After a successful paint, a later `loading` or `error` keeps that paint
 * (pending bar / inline Alert) unless `keepPrevious={false}`.
 *
 * ```tsx
 * <AsyncBoundary
 *   loading={isFetching}
 *   empty={items.length === 0}
 *   error={queryError}
 *   layout="list"
 *   onRetry={refetch}
 *   emptyTitle="No items found"
 * >
 *   <List items={items} ... />
 * </AsyncBoundary>
 * ```
 */
export function AsyncBoundary({
  loading,
  empty,
  error,
  data,
  children,
  layout = 'generic',
  onRetry,
  errorTitle = "Couldn't load data",
  emptyTitle = 'No items found',
  emptyDescription,
  errorDescription,
  compact = false,
  chrome,
  keepPrevious = true,
  ...stackProps
}: AsyncBoundaryProps) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs({ compact });
  const status = resolveAsyncStatus({ loading, empty, error });
  const content = data ?? children;
  // Retry is a §6.1 label — weight 400 on the TEXT NODE via
  // house Text. Alert's actionLabel hardcodes 600; the action slot does not.
  const retryLabel = t('Retry');

  const emptyBody = defaultEmptyBody({ empty, compact, emptyTitle, emptyDescription });
  const settledRef = useRef<{ kind: 'data' | 'empty'; body: ReactNode } | null>(null);
  if (status === 'data') {
    settledRef.current = { kind: 'data', body: content };
  } else if (status === 'empty') {
    settledRef.current = { kind: 'empty', body: emptyBody };
  }
  const settled = keepPrevious ? settledRef.current : null;

  useEffect(() => {
    if (status === 'error' && isActiveFlag(empty)) {
      asyncDevWarn('empty-chrome-ignored-on-error', 'DG-ST-01: empty slot is ignored while error is set');
    }
  }, [status, empty]);

  let displayStatus: AsyncStatus = status;
  let pending = false;
  let stale = false;
  let body: ReactNode = null;
  let showChrome = status !== 'error';

  if (status === 'error') {
    if (isReactNodeSlot(error)) {
      body = error;
    } else if (settled?.kind === 'data') {
      stale = true;
      displayStatus = 'data';
      showChrome = true;
      const copy = errorCopy(error, errorTitle, errorDescription);
      body = (
        <YStack width="100%" {...knobProps.gap}>
          <Alert
            compact={compact}
            intent="error"
            title={copy.title}
            action={
              onRetry ? (
                <Text
                  fontWeight="400"
                  color="$color12"
                  cursor="pointer"
                  userSelect="none"
                  role="button"
                  tabIndex={0}
                  onPress={onRetry}>
                  {retryLabel}
                </Text>
              ) : undefined
            }>
            {copy.description}
          </Alert>
          {content ?? settled.body}
        </YStack>
      );
    } else {
      body = defaultErrorBody({
        error,
        compact,
        errorTitle,
        errorDescription,
        onRetry,
        retryLabel,
      });
    }
  } else if (status === 'loading') {
    if (settled) {
      pending = true;
      displayStatus = settled.kind;
      showChrome = true;
      const kept = settled.kind === 'data' ? (content ?? settled.body) : settled.body;
      body = (
        <YStack width="100%" {...knobProps.gap}>
          <AsyncPendingBar />
          {kept}
        </YStack>
      );
    } else {
      body = loading !== true && isReactNodeSlot(loading) ? loading : <AsyncSkeleton layout={layout} />;
    }
  } else if (status === 'empty') {
    body = emptyBody;
  } else {
    body = content;
  }

  const hideBadges = displayStatus === 'error';
  const ctx: AsyncBoundaryContextValue = {
    status: displayStatus,
    hideBadges,
    error: error ?? null,
    pending,
    stale,
  };

  return (
    <AsyncBoundaryContext.Provider value={ctx}>
      <YStack
        data-async-status={displayStatus}
        {...(pending ? { 'data-async-pending': 'true' } : {})}
        {...(stale ? { 'data-async-stale': 'true' } : {})}
        width="100%"
        {...(pending || status === 'loading' ? { 'aria-busy': true } : {})}
        {...stackProps}>
        {/* Chrome (toolbars / badges) suppressed on blocking error so counts can't lie */}
        {showChrome ? chrome : null}
        {body}
      </YStack>
    </AsyncBoundaryContext.Provider>
  );
}
