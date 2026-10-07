/**
 * Workspace number card block — renders a Number Card doc by name.
 *
 * "Document Type" cards (the default) map cleanly onto the live aggregate
 * widget: `function` (Count/Sum/Average/Minimum/Maximum) +
 * `aggregate_function_based_on` + `filters_json` become a FrappeKPICard
 * data source, so the value is realtime like desk. "Report" and "Custom"
 * cards need server-side evaluation
 * (`frappe.desk.doctype.number_card.number_card.get_result`) and are
 * rendered as an informational card for now (documented gap).
 */
import { Card, Skeleton, Text, YStack } from '@repo/ui';
import { FrappeKPICard } from '@repo/frappe-ui';
import type { FrappeAggregateOperation, FrappeKPIDataSource } from '@repo/frappe-ui';
import { useResolvedKnobs } from '@repo/theme';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

import { parseFrappeFilters } from './parseContent';
import type { WorkspaceNumberCardRow } from './types';
import { useFrappeDoc } from './useWorkspaceDoc';

export interface NumberCardDoc {
  name: string;
  doctype: string;
  label?: string;
  /** "Document Type" | "Report" | "Custom" */
  type?: string;
  document_type?: string;
  /** "Count" | "Sum" | "Average" | "Minimum" | "Maximum" */
  function?: string;
  aggregate_function_based_on?: string;
  filters_json?: string;
  [key: string]: unknown;
}

const FUNCTION_MAP: Record<string, FrappeAggregateOperation> = {
  Count: 'count',
  Sum: 'sum',
  Average: 'avg',
  Minimum: 'min',
  Maximum: 'max',
};

export interface WorkspaceNumberCardProps {
  row: WorkspaceNumberCardRow;
}

export function WorkspaceNumberCard({ row }: WorkspaceNumberCardProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const { doc, isLoading, error } = useFrappeDoc<NumberCardDoc>('Number Card', row.number_card_name);

  const title = row.label ?? doc?.label ?? row.number_card_name;

  const dataSource = useMemo<FrappeKPIDataSource | undefined>(() => {
    if (!doc?.document_type) {
      return;
    }
    if (doc.type && doc.type !== 'Document Type') {
      return;
    }
    const aggregate = FUNCTION_MAP[doc.function ?? 'Count'] ?? 'count';
    return {
      doctype: doc.document_type,
      aggregate,
      field: aggregate === 'count' ? undefined : doc.aggregate_function_based_on,
      filters: parseFrappeFilters(doc.filters_json),
    };
  }, [doc]);

  if (isLoading) {
    return (
      <Card
        flexGrow={1}
        aria-busy
        aria-label={t('loading', 'Loading')}>
        <YStack
          {...knobProps.panelPadding}
          {...knobProps.gap}>
          <Skeleton width="60%" />
          <Skeleton
            width="40%"
            height="$2"
          />
        </YStack>
      </Card>
    );
  }

  if (error || !doc) {
    return (
      <Card flexGrow={1}>
        <YStack
          {...knobProps.panelPadding}
          {...knobProps.gap}>
          <Text
            {...knobProps.heading}
            fontWeight="400">
            {title}
          </Text>
          <Text
            {...knobProps.label}
            fontWeight="400"
            color="$color10">
            {t('workspaceNumberCardError', "Couldn't load number card")}
          </Text>
        </YStack>
      </Card>
    );
  }

  if (!dataSource) {
    // Report / Custom cards need server-side evaluation — not wired yet.
    return (
      <Card flexGrow={1}>
        <YStack
          {...knobProps.panelPadding}
          {...knobProps.gap}>
          <Text
            {...knobProps.heading}
            fontWeight="400">
            {title}
          </Text>
          <Text
            {...knobProps.label}
            fontWeight="400"
            color="$color10">
            {t('workspaceNumberCardUnsupported', 'This card type is only available in desk')}
          </Text>
        </YStack>
      </Card>
    );
  }

  return (
    <FrappeKPICard
      config={{ id: `workspace-number-card-${row.name}`, title, value: '—' }}
      dataSource={dataSource}
      flexGrow={1}
    />
  );
}
