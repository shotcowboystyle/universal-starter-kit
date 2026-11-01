import { PlusIcon } from '@phosphor-icons/react';
import { Button, formCommonColors } from '@repo/forms';
import type { UseFrappeCollectionConfig } from '@repo/frappe';
import { useResolvedKnobs } from '@repo/theme';
import { Kanban, componentColors } from '@repo/ui';
import type { KanbanColumn as GenericKanbanColumn, KanbanProps } from '@repo/ui';
import React, { useMemo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, XStack, YStack } from 'tamagui';

import { FrappeConnectionIndicator } from './FrappeConnectionIndicator';
import { useFrappeConfig } from './FrappeProvider';
import { describeSyncError } from './sync-error';
import { useFrappeRows } from './use-frappe-rows';

/**
 * Configuration for a single Kanban column.
 */
export interface KanbanColumn {
  value: string;
  title: string;
  color?: string;
}

/**
 * Render function for custom card content.
 */
export type KanbanCardRenderer<TDoc> = (card: Partial<TDoc>, defaultContent: React.ReactNode) => React.ReactNode;

export interface FrappeKanbanProps<TDoc extends { name: string; doctype: string }> extends Omit<
  KanbanProps<Partial<TDoc>>,
  // oxlint-disable-next-line sonarjs/max-union-size -- the list of generic Kanban props this wrapper replaces, not a domain union
  'columns' | 'renderCard' | 'onCardMove' | 'error'
> {
  baseURL?: string;
  auth?: { useToken?: boolean; token?: string; type?: string };
  syncOptions?: UseFrappeCollectionConfig['syncOptions'];
  doctype: string;
  fields?: readonly (keyof TDoc & string)[];
  filters?: Partial<TDoc> | [keyof TDoc & string, string, unknown][];
  statusField: keyof TDoc & string;
  columns: KanbanColumn[];
  titleField?: keyof TDoc & string;
  descriptionField?: keyof TDoc & string;
  renderCard?: (item: Partial<TDoc>) => React.ReactNode;
  onCardClick?: (card: Partial<TDoc>) => void;
  onCardMove?: (cardName: string, fromStatus: string, toStatus: string) => void | Promise<void>;
  /** Disable card dragging (the board stays a read-only visualization). */
  readOnly?: boolean;
  enableCardCreation?: boolean;
  onCreateCard?: (status: string) => void;
  loading?: React.ReactNode;
  error?: (error: Error) => React.ReactNode;
}

const UNASSIGNED_COLUMN_ID = '__unassigned__';

/** True when an optional field-name prop is set (an empty name counts as unset). */
const isSetField = <K extends string>(field: K | undefined): field is K => field !== undefined && field !== '';

/**
 * Thin Frappe wrapper around the generic Kanban component.
 *
 * Fetches data via `useFrappeCollection` / `useLiveQuery`, groups cards
 * by `statusField`, and passes the grouped columns to the generic
 * `Kanban` from `@repo/ui`.
 */
// oxlint-disable-next-line eslint/complexity -- most of the count is prop defaults and optional-callback guards; each branch is a flat early return
export const FrappeKanban = <TDoc extends { name: string; doctype: string }>({
  baseURL,
  auth,
  syncOptions,
  doctype,
  fields,
  filters,
  statusField,
  columns,
  titleField,
  descriptionField,
  renderCard,
  onCardClick,
  onCardMove,
  readOnly = false,
  enableCardCreation = false,
  onCreateCard,
  loading,
  error: renderError,
  renderColumnActions,
  ...kanbanProps
}: FrappeKanbanProps<TDoc>) => {
  const config = useFrappeConfig();
  const { knobProps } = useResolvedKnobs();
  const { t } = useTranslation();
  const [actionError, setActionError] = useState<Error | null>(null);

  const finalBaseURL = baseURL ?? config?.baseURL;
  const finalAuth = auth ?? config?.auth;
  const finalSyncOptions = syncOptions ?? config?.syncOptions;

  if ((finalBaseURL === undefined || finalBaseURL === '') && !config?.fixtures) {
    throw new Error('FrappeKanban requires baseURL prop or FrappeProvider with baseURL or fixtures');
  }

  // Ensure required fields are fetched
  const effectiveFields = useMemo(() => {
    if (fields === undefined) {
      return fields;
    }
    const fieldSet = new Set<keyof TDoc & string>(fields);
    fieldSet.add(statusField);
    fieldSet.add('name');
    if (isSetField(titleField)) {
      fieldSet.add(titleField);
    }
    if (isSetField(descriptionField)) {
      fieldSet.add(descriptionField);
    }
    return [...fieldSet];
  }, [fields, statusField, titleField, descriptionField]);

  const connectionConfig = useMemo(
    () => ({
      baseURL: finalBaseURL,
      socketPort: config?.socketPort,
      siteName: config?.siteName,
      socketBaseURL: config?.socketBaseURL,
      auth: finalAuth,
      syncOptions: finalSyncOptions,
      socketOptions: config?.socketOptions,
      realtime: config?.realtime,
      fixtures: config?.fixtures,
    }),
    [
      finalBaseURL,
      config?.socketPort,
      config?.siteName,
      config?.socketBaseURL,
      config?.realtime,
      finalAuth,
      finalSyncOptions,
      config?.socketOptions,
      config?.fixtures,
    ],
  );

  // The shared doctype read (MPO-251). `mapError` keeps this board's own
  // error copy (describeSyncError) rather than the hook's default shape, and
  // `limit: null` keeps the bench's own page length.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- mapError receives whatever the sync layer threw; describeSyncError does the narrowing
  const mapSyncError = useCallback((err: unknown) => new Error(describeSyncError(err, doctype, t)), [doctype, t]);
  const {
    rows: cards,
    isQueryLoading: isLoading,
    isError,
    syncError,
    collection,
  } = useFrappeRows<TDoc>(connectionConfig, doctype, {
    fields: effectiveFields,
    filters,
    limit: null,
    mapError: mapSyncError,
  });

  // Group cards by status into generic KanbanColumn format.
  // Cards with an unknown status land in an "Unassigned" column so they
  // remain visible instead of disappearing from the board.
  const genericColumns = useMemo((): GenericKanbanColumn<Partial<TDoc>>[] => {
    const grouped = new Map<string, Partial<TDoc>[]>();
    for (const column of columns) {
      grouped.set(column.value, []);
    }
    const unknown: Partial<TDoc>[] = [];
    for (const card of cards) {
      const status = String(card[statusField] ?? '');
      const bucket = status === '' ? undefined : grouped.get(status);
      if (bucket) {
        bucket.push(card);
      } else {
        unknown.push(card);
      }
    }
    const result = columns.map((col) => ({
      id: col.value,
      title: col.title,
      items: grouped.get(col.value) ?? [],
      color: col.color,
    }));
    if (unknown.length > 0) {
      result.push({
        id: UNASSIGNED_COLUMN_ID,
        title: t('Unassigned'),
        items: unknown,
        color: componentColors.text.subtle,
      });
    }
    return result;
  }, [cards, columns, statusField, t]);

  // Default card renderer. The generic Kanban already wraps every card in
  // its own Card chrome (radius, elevation, lift shadow) — render bare
  // content here so cards don't get a double border.
  const effectiveRenderCard =
    renderCard ??
    ((item: Partial<TDoc>) => {
      const title = isSetField(titleField) ? item[titleField] : item.name;
      const desc = isSetField(descriptionField) ? item[descriptionField] : undefined;
      return (
        <YStack
          {...knobProps.panelPadding}
          {...knobProps.gap}>
          <Text
            {...knobProps.label}
            {...knobProps.textWeight}>
            {
              // SAFETY: title fields hold Data/Select strings, which React renders as text
              // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
              (title as React.ReactNode) ?? item.name
            }
          </Text>
          {desc != null && desc !== '' && (
            <Text
              color={formCommonColors.muted}
              {...knobProps.body}>
              {String(desc)}
            </Text>
          )}
        </YStack>
      );
    });

  // Human-readable card label for screen-reader drag announcements.
  const getItemLabel = useCallback(
    (item: Partial<TDoc>) => {
      const title = isSetField(titleField) ? item[titleField] : undefined;
      return String(title ?? item.name ?? t('Card'));
    },
    [titleField, t],
  );

  // Persist status via the live collection, then notify the consumer.
  const handleCardMove = useCallback(
    async (item: Partial<TDoc>, fromColumn: string, toColumn: string) => {
      if (item.name === undefined || item.name === '' || toColumn === UNASSIGNED_COLUMN_ID) {
        return;
      }
      setActionError(null);
      try {
        if (collection) {
          const tx = collection.update(item.name, (draft) => {
            // SAFETY: the draft is the live doc object; the status field is written by name
            // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- doc fields are doctype-defined
            (draft as Record<string, unknown>)[statusField] = toColumn;
          });
          await tx.isPersisted.promise;
        }
        await onCardMove?.(item.name, fromColumn, toColumn);
      } catch (error) {
        setActionError(error instanceof Error ? error : new Error(String(error)));
      }
    },
    [collection, onCardMove, statusField],
  );

  // Bridge onCardSelect to onCardClick
  const handleCardSelect = useCallback(
    (item: Partial<TDoc>, _columnId: string) => {
      onCardClick?.(item);
    },
    [onCardClick],
  );

  // Desk parity: the quick-add "+" is anchored IN its column header (never a
  // detached button strip) and names its column in the accessible label. The
  // synthetic "Unassigned" bucket has no field value to prefill, so it gets
  // no add affordance. Consumer-provided column actions compose after it.
  const effectiveRenderColumnActions = useMemo(() => {
    const canQuickAdd = enableCardCreation && Boolean(onCreateCard);
    if (!canQuickAdd && !renderColumnActions) {
      // Nothing to render: hand the Kanban no actions slot (renderColumnActions is undefined here).
      return renderColumnActions;
    }
    const renderActions = (column: GenericKanbanColumn<Partial<TDoc>>) => (
      <XStack
        alignItems="center"
        gap="$1">
        {canQuickAdd && column.id !== UNASSIGNED_COLUMN_ID && (
          <Button
            size="$2"
            circular
            chromeless
            icon={PlusIcon}
            aria-label={t('Add card to {{column}}', { column: column.title })}
            onPress={() => {
              setActionError(null);
              try {
                onCreateCard?.(column.id);
              } catch (error) {
                setActionError(error instanceof Error ? error : new Error(String(error)));
              }
            }}
          />
        )}
        {renderColumnActions?.(column)}
      </XStack>
    );
    return renderActions;
  }, [enableCardCreation, onCreateCard, renderColumnActions, t]);

  // Custom loading slot only — default path keeps empty columns visible so
  // fixture-less demos still render the board (Kanban owns isLoading chrome).
  if (isLoading && cards.length === 0 && Boolean(loading)) {
    // oxlint-disable-next-line react/jsx-no-useless-fragment -- returning the bare ReactNode would widen the component's return type to include Promise
    return <>{loading}</>;
  }

  // Real subscription failure (permission-error, network, bad doctype)
  // reported by the collection via onSyncError — honest error UI instead of
  // an empty board. The `error` render prop stays the consumer override.
  const boardError = syncError ? syncError.message : null;
  if (syncError && renderError) {
    return <>{renderError(syncError)}</>;
  }

  // Opt-in query error panel via `error` prop. Empty/fixture-less collections
  // often report isError without a real failure — don't blank the board.
  if (isError && renderError && !isLoading && cards.length === 0) {
    return <>{renderError(new Error(t('Failed to load {{doctype}}', { doctype })))}</>;
  }

  return (
    <YStack
      flex={1}
      {...knobProps.gap}>
      <FrappeConnectionIndicator config={connectionConfig} />
      {actionError && (
        <YStack
          {...knobProps.panelPadding}
          {...knobProps.containerRadius}
          backgroundColor="$red2"
          borderColor="$red7"
          borderWidth={1}>
          <Text color={formCommonColors.error}>{t('Action failed')}</Text>
          <Text
            color={formCommonColors.muted}
            {...knobProps.body}>
            {actionError.message}
          </Text>
        </YStack>
      )}
      <Kanban
        {...knobProps.gap}
        columns={genericColumns}
        renderCard={effectiveRenderCard}
        // The generic Kanban enables drag when a move handler exists —
        // readOnly withholds it so the board stays a visualization.
        // oxlint-disable-next-line typescript/no-misused-promises -- awaitable handler, never rejects (errors land in actionError)
        onCardMove={readOnly ? undefined : handleCardMove}
        onCardSelect={handleCardSelect}
        renderColumnActions={effectiveRenderColumnActions}
        isLoading={isLoading}
        error={boardError}
        getItemKey={(item, index) => item.name ?? index}
        getItemLabel={getItemLabel}
        {...kanbanProps}
      />
    </YStack>
  );
};
