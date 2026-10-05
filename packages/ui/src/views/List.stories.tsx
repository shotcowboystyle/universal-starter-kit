import { FileCodeIcon, FilePdfIcon, FileTextIcon, ListChecksIcon } from '@phosphor-icons/react';
import { action } from '@repo/storybook';
import type { Meta } from '@storybook/react-native-web-vite';
import type { ReactNode } from 'react';

import { componentColors } from '../componentColors';

import { List, ListRow, ListRowMeta } from './List';

interface DocumentRow {
  id: string;
  title: string;
  subtitle: string;
  modified: string;
  size: string;
  kind: string;
  status: string;
  statusTone?: 'success' | 'warning';
  icon: ReactNode;
}

const documents: DocumentRow[] = [
  {
    id: '1',
    title: 'Q3 Vendor Contract',
    subtitle: 'Legal · Shared with Finance',
    modified: 'Yesterday',
    size: '124 KB',
    kind: 'PDF',
    status: 'Open',
    icon: <FilePdfIcon />,
  },
  {
    id: '2',
    title: 'Onboarding Checklist',
    subtitle: 'People · Template',
    modified: 'Tue',
    size: '18 KB',
    kind: 'Doc',
    status: 'Open',
    icon: <ListChecksIcon />,
  },
  {
    id: '3',
    title: 'Invoice 1842',
    subtitle: 'Finance · Acme Corp',
    modified: '12 Aug',
    size: '56 KB',
    kind: 'PDF',
    status: 'Paid',
    statusTone: 'success',
    icon: <FilePdfIcon />,
  },
  {
    id: '4',
    title: 'Brand Guidelines',
    subtitle: 'Design · Internal',
    modified: '3 Aug',
    size: '2.4 MB',
    kind: 'PDF',
    status: 'Open',
    icon: <FileTextIcon />,
  },
  {
    id: '5',
    title: 'Architecture RFC',
    subtitle: 'Engineering · Draft for review',
    modified: '28 Jul',
    size: '41 KB',
    kind: 'MD',
    status: 'Draft',
    statusTone: 'warning',
    icon: <FileCodeIcon />,
  },
];

function DocumentItem({ item }: { item: DocumentRow }) {
  const statusColor =
    item.statusTone === 'success'
      ? componentColors.semantic.success
      : item.statusTone === 'warning'
        ? componentColors.badge.orange
        : undefined;
  return (
    <ListRow
      icon={item.icon}
      title={item.title}
      subtitle={item.subtitle}
      meta={
        <>
          <ListRowMeta width={80}>{item.modified}</ListRowMeta>
          <ListRowMeta width={56}>{item.size}</ListRowMeta>
          <ListRowMeta width={40}>{item.kind}</ListRowMeta>
          <ListRowMeta width={48} color={statusColor}>
            {item.status}
          </ListRowMeta>
        </>
      }
    />
  );
}

const meta: Meta = {
  title: 'Components/List',
  parameters: {
    status: { type: 'stable' },
  },
};

export default meta;

export const Default = {
  name: 'Main',
  render: () => (
    <List<DocumentRow>
      items={documents}
      aria-label="Documents"
      defaultSelectedIndex={2}
      renderItem={(item) => <DocumentItem item={item} />}
      onItemClick={action('onItemClick')}
      estimateSize={60}
    />
  ),
};

export const Loading = {
  render: () => (
    <List<DocumentRow> items={[]} renderItem={(item) => <DocumentItem item={item} />} isLoading height={280} />
  ),
};

/** No items, no filters, no failure — the neutral empty state (Axiom 6: empty ≠ error). */
export const Empty = {
  render: () => (
    <List<DocumentRow>
      items={[]}
      renderItem={(item) => <DocumentItem item={item} />}
      emptyMessage="No documents yet"
      height={280}
    />
  ),
};

/** Failed load wins over empty — error chrome with retry, never empty chrome. */
export const Error = {
  render: () => (
    <List<DocumentRow>
      items={[]}
      renderItem={(item) => <DocumentItem item={item} />}
      error="The server did not respond."
      onRetry={action('onRetry')}
      height={280}
    />
  ),
};

/**
 * Data exists upstream but the active search/filter matches nothing —
 * no-results ≠ empty (Axiom 6 HONEST STATE). List carries no filter state of
 * its own, so the consumer names the filter in `emptyMessage`.
 */
export const NoResults = {
  render: () => (
    <List<DocumentRow>
      items={[]}
      renderItem={(item) => <DocumentItem item={item} />}
      emptyMessage='No documents match "deployment"'
      height={280}
    />
  ),
};
