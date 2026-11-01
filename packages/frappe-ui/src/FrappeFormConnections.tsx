import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { useResolvedKnobs } from '@repo/theme';
import { AsyncBoundary, PageSection } from '@repo/ui';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { YStack } from 'tamagui';

import { connectionFields } from './frappe-connections';
import type { FrappeConnection } from './frappe-connections';
import { isPermissionError } from './live-errors';
import { useFrappeRows } from './use-frappe-rows';
import type { FrappeRowsConnection, UseFrappeRowsOptions } from './use-frappe-rows';

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- a connection row carries whatever fields the linked doctype declares
type ConnectionRow = Record<string, unknown> & { name: string; doctype: string };

const bookkeepingKeys = new Set([
  'name',
  'doctype',
  'owner',
  'creation',
  'modified',
  'modified_by',
  'docstatus',
  'idx',
  'parent',
  'parentfield',
  'parenttype',
  '_user_tags',
  '_comments',
  '_assign',
  '_liked_by',
  '_seen',
]);

/** "poke_type" -> "Poke Type". */
const fieldLabel = (key: string): string =>
  key.replaceAll('_', ' ').replaceAll(/(?<lead>^|\s)\S/gu, (c) => c.toUpperCase());

/**
 * Columns for one connection's rows: its declared fields, else what the rows
 * carry. The link field is left out; every row holds the same record.
 */
const connectionColumns = (
  link: FrappeConnection,
  rows: readonly ConnectionRow[],
): DataTableColumn<ConnectionRow>[] => {
  const declared = (link.fields ?? []).filter((field) => field !== 'name');
  const keys = (
    declared.length > 0 ? declared : Object.keys(rows[0] ?? {}).filter((key) => !bookkeepingKeys.has(key))
  ).filter((key) => key !== link.fieldname);
  return (keys.length > 0 ? keys : ['name']).map((key) => ({
    id: key,
    accessorKey: key,
    header: fieldLabel(key),
  }));
};

export interface FrappeFormConnectionSectionProps {
  connection: FrappeRowsConnection | undefined;
  link: FrappeConnection;
  /** The record whose linked rows to read. */
  name: string;
}

/** One connection of a record: its linked rows, live, with honest states. */
export const FrappeFormConnectionSection = ({ connection, link, name }: FrappeFormConnectionSectionProps) => {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const options = useMemo(
    (): UseFrappeRowsOptions<ConnectionRow> => ({
      fields: connectionFields(link),
      filters: [[link.fieldname, '=', name]],
      limit: link.limit ?? 0,
    }),
    [link, name],
  );
  const { rows, isLoading, error } = useFrappeRows<ConnectionRow>(connection, link.doctype, options);
  const columns = useMemo(() => connectionColumns(link, rows), [link, rows]);
  const title = t(link.label ?? link.doctype);
  return (
    <PageSection
      title={isLoading || error ? title : `${title} (${rows.length})`}
      divider={false}
      testID={`frappe-form-connection-${link.doctype.toLowerCase().replaceAll(/\s+/gu, '-')}`}>
      <YStack {...knobProps.gap}>
        <AsyncBoundary
          layout="table"
          compact
          loading={isLoading}
          error={error}
          errorTitle={
            error && isPermissionError(error)
              ? t('You do not have permission to view {{doctype}}', { doctype: link.doctype })
              : t('Error loading {{doctype}}', { doctype: link.doctype })
          }
          empty={rows.length === 0}
          emptyTitle={t('No {{doctype}} rows', { doctype: link.doctype })}>
          <DataTable<ConnectionRow>
            data={rows}
            columns={columns}
            enableFiltering={false}
            enableGlobalSearch={false}
            enablePagination={false}
            enableColumnVisibility={false}
            enableViews={false}
          />
        </AsyncBoundary>
      </YStack>
    </PageSection>
  );
};

export interface FrappeFormConnectionsProps {
  connection: FrappeRowsConnection | undefined;
  connections: readonly FrappeConnection[];
  name: string;
}

/** The desk's Connections for one record: a section per linked doctype. */
export const FrappeFormConnections = ({ connection, connections, name }: FrappeFormConnectionsProps) => {
  const { knobProps } = useResolvedKnobs();
  return (
    <YStack
      {...knobProps.gapLg}
      testID="frappe-form-connections">
      {connections.map((link) => (
        <FrappeFormConnectionSection
          key={`${link.doctype}:${link.fieldname}`}
          connection={connection}
          link={link}
          name={name}
        />
      ))}
    </YStack>
  );
};
