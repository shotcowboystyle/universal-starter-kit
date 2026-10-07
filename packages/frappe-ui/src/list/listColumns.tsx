import { Avatar, Anchor, Chip, Text, XStack } from '@repo/ui';
import type { ChipColor } from '@repo/ui';
// House control for the like toggle — the icon rides the Button icon slot
// (LC-53 GLYPH-SLOT) and the sub-44 circular size resolves the press floor
// through the house channel (LC-54: 44px box + hitSlop).
import { Button } from '@repo/forms';
import type { DataTableColumn } from '@repo/table';
import { formatAbsoluteDateTime } from '@repo/theme';
import { ChatCircleIcon, HeartIcon } from '@phosphor-icons/react';
// Meta-driven column builder for the doctype list view (desk ListView
// parity): subject-led document rows, not a report grid.
//
// Desk row anatomy (list_view.js):
//   checkbox | subject <a> | indicator pills (filterable) | remaining
//   in_list_view values (filterable) | activity cluster
//     (assignee avatars · relative time · comment count · like)
// Title is a real permalink (middle-click / ⌘-click). Pills and values
// click-to-filter (data-filter) instead of navigating. Like is a sibling
// of the subject link (LC-74). Extra ID / Last Updated columns stay out —
// the timestamp lives in the activity cluster.
import type { ReactNode } from 'react';

import type { DocFieldMeta, DoctypeMeta } from '../formEngine/doctypeMeta';
import type { PermLevelMatrix } from '../formEngine/fieldPermissions';

// Field selection + permlevel pruning live in the pure listFields module
// (node-safe, unit-tested in listFields.spec.ts).
import { listViewFields } from './listFields';
import { formatDateCell, formatTimeAgo, parseUserListField, stripHtmlPreview } from './listFormat';
import { statusPillColors } from './statusColors';

/** Minimal row shape for a doctype list (loose — server owns the schema). */
export interface ListDoc {
  name: string;
  doctype: string;
  [key: string]: unknown;
}

export type ListRow = Partial<ListDoc>;

type Translate = (key: string, fallback: string) => string;

export interface BuildListColumnsArgs {
  meta?: DoctypeMeta;
  t: Translate;
  /** Session user — hearts fill when `_liked_by` contains them. */
  sessionUser?: string;
  /** Toggle like for a document (omit to render hearts read-only). */
  onToggleLike?: (name: string, nextLiked: boolean) => void;
  /** Optimistic like overrides keyed by document name. */
  likeOverrides?: Record<string, boolean>;
  /**
   * Permlevel role matrix (session roles × meta.permissions, built with
   * `buildPermLevelMatrix`). Columns for fields the roles cannot READ at
   * their permlevel are pruned — desk parity with base_list.js
   * `get_fields_in_list_view` (`frappe.perm.has_perm(doctype, df.permlevel,
   * "read")`). Undefined (fixtures / roles unavailable) prunes nothing —
   * the server strips no-read values either way.
   */
  permMatrix?: PermLevelMatrix;
  /** Document form href — subject renders as a real `<a>` when set (C1). */
  getDocHref?: (name: string) => string;
  /**
   * Desk cell click-to-filter (C2). Status/priority pills, dates, and
   * remaining values add (or toggle off) a tuple instead of opening the doc.
   */
  onFilterClick?: (fieldname: string, value: string) => void;
}

const NUMERIC_FIELDTYPES = new Set(['Currency', 'Float', 'Int', 'Percent', 'Duration']);

// Fieldtypes whose stored value is markup — list cells render a stripped
// one-line plain-text preview (desk strip_html parity), never raw HTML.
const RICH_TEXT_FIELDTYPES = new Set([
  'Text Editor',
  'HTML Editor',
  'HTML',
  'Markdown Editor',
  'Long Text',
  'Text',
  'Small Text',
]);

/** Cell-safe one-line preview: rich fieldtypes stripped, newlines collapsed. */
function cellPreview(value: string, fieldtype?: string): string {
  const text = fieldtype && RICH_TEXT_FIELDTYPES.has(fieldtype) ? stripHtmlPreview(value) : value;
  return text.replaceAll(/\s+/g, ' ').trim();
}

function isStatusField(field: DocFieldMeta, meta?: DoctypeMeta): boolean {
  if (field.fieldname === 'status') {
    return true;
  }
  if (field.fieldtype !== 'Select') {
    return false;
  }
  const stateTitles = new Set((meta?.states ?? []).map((state) => (state.title ?? '').trim().toLowerCase()));
  if (stateTitles.size === 0) {
    return false;
  }
  const options = (field.options ?? '').split('\n').map((option) => option.trim().toLowerCase());
  return options.some((option) => option && stateTitles.has(option));
}

/** Desk indicator cells: every Select in the list, plus User.enabled. */
function isIndicatorField(field: DocFieldMeta, meta?: DoctypeMeta): boolean {
  if (field.fieldtype === 'Select') {
    return true;
  }
  if (field.fieldtype === 'Check' && field.fieldname === 'enabled') {
    return true;
  }
  return isStatusField(field, meta);
}

function stopRowPress(event?: { stopPropagation?: () => void }) {
  event?.stopPropagation?.();
}

function chipColorFromStatus(value: string, meta?: DoctypeMeta): ChipColor {
  const ramp = statusPillColors(value, meta).background.replace(/^\$/, '').replace(/\d+$/, '');
  if (ramp === 'pink') {
    return 'purple';
  }
  if (
    ramp === 'red' ||
    ramp === 'green' ||
    ramp === 'blue' ||
    ramp === 'yellow' ||
    ramp === 'orange' ||
    ramp === 'purple' ||
    ramp === 'gray'
  ) {
    return ramp;
  }
  return 'gray';
}

function IndicatorPill({
  value,
  meta,
  fieldname,
  filterValue,
  onFilterClick,
}: {
  value: string;
  meta?: DoctypeMeta;
  fieldname: string;
  /** Wire value when it differs from the label (Check enabled → 1/0). */
  filterValue?: string;
  onFilterClick?: (fieldname: string, value: string) => void;
}) {
  const chipColor = chipColorFromStatus(value, meta);
  const applied = filterValue ?? value;
  return (
    <XStack
      alignSelf="flex-start"
      {...(onFilterClick
        ? {
            'data-filter': `${fieldname},=,${applied}`,
            onPress: (event?: { stopPropagation?: () => void }) => {
              stopRowPress(event);
            },
          }
        : {})}>
      <Chip
        size="$2"
        variant="subtle"
        color={chipColor}
        onPress={
          onFilterClick
            ? () => {
                onFilterClick(fieldname, applied);
              }
            : undefined
        }>
        {value}
      </Chip>
    </XStack>
  );
}

function FilterableText({
  fieldname,
  value,
  children,
  onFilterClick,
}: {
  fieldname: string;
  value: string;
  children: ReactNode;
  onFilterClick?: (fieldname: string, value: string) => void;
}) {
  if (!onFilterClick) {
    return <>{children}</>;
  }
  return (
    <XStack
      role="button"
      cursor="pointer"
      minWidth={0}
      flexShrink={1}
      onPress={(event) => {
        stopRowPress(event);
        onFilterClick(fieldname, value);
      }}
      hoverStyle={{ opacity: 0.8 }}
      {...{ 'data-filter': `${fieldname},=,${value}` }}>
      {children}
    </XStack>
  );
}

function commentCount(doc: ListRow): number {
  const raw = doc._comment_count;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  const comments = doc._comments;
  if (typeof comments === 'string' && comments.trim()) {
    try {
      const parsed = JSON.parse(comments) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.length;
      }
    } catch {
      return 0;
    }
  }
  return 0;
}

function LikeControl({
  doc,
  t,
  sessionUser,
  onToggleLike,
  likeOverrides,
}: {
  doc: ListRow;
  t: Translate;
  sessionUser?: string;
  onToggleLike?: (name: string, nextLiked: boolean) => void;
  likeOverrides?: Record<string, boolean>;
}) {
  const name = doc.name ?? '';
  const likedBy = parseUserListField(doc._liked_by);
  const liked = likeOverrides?.[name] ?? (sessionUser ? likedBy.includes(sessionUser) : false);
  const likeLabel = liked ? t('list.unlike', 'Remove from liked') : t('list.like', 'Add to liked');
  if (!onToggleLike || !name) {
    return (
      <Text
        fontSize="$4"
        color={liked ? '$red10' : '$color8'}
        role="img"
        aria-label={likeLabel}>
        {liked ? '♥' : '♡'}
      </Text>
    );
  }
  return (
    <Button
      circular
      chromeless
      size="$2"
      col={(liked ? '$red10' : '$color8') as never}
      icon={
        <HeartIcon
          size={16}
          weight={liked ? 'fill' : 'regular'}
        />
      }
      aria-label={likeLabel}
      aria-pressed={liked}
      onPress={(event) => {
        stopRowPress(event);
        onToggleLike(name, !liked);
      }}
    />
  );
}

function ActivityCluster({
  doc,
  t,
  sessionUser,
  onToggleLike,
  likeOverrides,
}: {
  doc: ListRow;
  t: Translate;
  sessionUser?: string;
  onToggleLike?: (name: string, nextLiked: boolean) => void;
  likeOverrides?: Record<string, boolean>;
}) {
  const assignees = parseUserListField(doc._assign);
  const comments = commentCount(doc);
  const modified = doc.modified ? String(doc.modified) : '';
  const absolute = modified ? formatAbsoluteDateTime(modified) : '';
  return (
    <XStack
      alignItems="center"
      justifyContent="flex-end"
      gap="$2"
      minWidth={0}
      testID="list-activity">
      {assignees.slice(0, 3).map((user) => (
        <Avatar
          key={user}
          name={user}
          size={20}
          circular
          aria-label={user}
        />
      ))}
      {modified ? (
        <Text
          fontSize="$2"
          color="$color9"
          {...({ title: absolute || undefined } as Record<string, unknown>)}>
          {formatTimeAgo(modified)}
        </Text>
      ) : null}
      <XStack
        alignItems="center"
        gap="$1"
        {...({ 'aria-label': t('list.comments', 'Comments') } as Record<string, unknown>)}>
        <ChatCircleIcon size={14} />
        <Text
          fontSize="$2"
          color="$color9">
          {comments}
        </Text>
      </XStack>
      <LikeControl
        doc={doc}
        t={t}
        sessionUser={sessionUser}
        onToggleLike={onToggleLike}
        likeOverrides={likeOverrides}
      />
    </XStack>
  );
}

function fieldCell(
  field: DocFieldMeta,
  meta: DoctypeMeta | undefined,
  onFilterClick?: (fieldname: string, value: string) => void,
) {
  return ({ getValue }: { getValue: () => unknown }) => {
    const raw = getValue();
    if (raw === null || raw === undefined || raw === '') {
      return (
        <Text
          fontSize="$3"
          color="$color8">
          —
        </Text>
      );
    }
    if (field.fieldtype === 'Check' && field.fieldname === 'enabled') {
      const on = raw === true || raw === 1 || raw === '1';
      return (
        <IndicatorPill
          value={on ? 'Active' : 'Disabled'}
          meta={meta}
          fieldname={field.fieldname}
          filterValue={on ? '1' : '0'}
          onFilterClick={onFilterClick}
        />
      );
    }
    const value = String(raw);
    if (isIndicatorField(field, meta)) {
      return (
        <IndicatorPill
          value={value}
          meta={meta}
          fieldname={field.fieldname}
          onFilterClick={onFilterClick}
        />
      );
    }
    switch (field.fieldtype) {
      case 'Check': {
        return (
          <Text
            fontSize="$3"
            color={raw ? '$green11' : '$color8'}>
            {raw ? '✓' : '—'}
          </Text>
        );
      }
      case 'Date':
      case 'Datetime': {
        const display = formatDateCell(value);
        return (
          <FilterableText
            fieldname={field.fieldname}
            value={value}
            onFilterClick={onFilterClick}>
            <Text
              fontSize="$3"
              color="$color11">
              {display}
            </Text>
          </FilterableText>
        );
      }
      case 'Currency':
      case 'Float':
      case 'Int':
      case 'Percent': {
        return (
          <Text
            fontSize="$3"
            color="$color12"
            textAlign="right">
            {value}
          </Text>
        );
      }
      case 'Link': {
        return (
          <FilterableText
            fieldname={field.fieldname}
            value={value}
            onFilterClick={onFilterClick}>
            <Text
              fontSize="$3"
              color="$color11"
              numberOfLines={1}
              flexShrink={1}
              minWidth={0}>
              {value}
            </Text>
          </FilterableText>
        );
      }
      default: {
        return (
          <Text
            fontSize="$3"
            color="$color11"
            numberOfLines={1}
            flexShrink={1}
            minWidth={0}>
            {cellPreview(value, field.fieldtype)}
          </Text>
        );
      }
    }
  };
}

/** Build the DataTable columns for a doctype list from its meta. */
export function buildListColumns({
  meta,
  t,
  sessionUser,
  onToggleLike,
  likeOverrides,
  permMatrix,
  getDocHref,
  onFilterClick,
}: BuildListColumnsArgs): DataTableColumn<ListRow>[] {
  const titleField = meta?.title_field ?? 'name';
  const columns: DataTableColumn<ListRow>[] = [];

  const titleMeta = meta?.fields?.find((field) => field.fieldname === titleField);
  columns.push({
    id: titleField,
    header: titleField === 'name' ? t('list.idColumn', 'ID') : (titleMeta?.label ?? t('list.titleColumn', 'Title')),
    accessorKey: titleField,
    minWidth: 180,
    meta: { role: 'title' },
    cell: ({ row, getValue }) => {
      const raw = getValue();
      const name = row.original.name ?? '';
      const value = raw === null || raw === undefined || raw === '' ? name : String(raw);
      const href = name && getDocHref ? getDocHref(name) : undefined;
      const label = cellPreview(value, titleMeta?.fieldtype);
      const subject = (
        <Text
          fontSize="$3"
          fontWeight="400"
          color="$color12"
          numberOfLines={1}
          flexShrink={1}
          minWidth={0}>
          {label}
        </Text>
      );
      if (!href) {
        return subject;
      }
      return (
        <Anchor
          href={href}
          textDecorationLine="none"
          minWidth={0}
          flexShrink={1}
          onPress={stopRowPress}>
          {subject}
        </Anchor>
      );
    },
  });

  for (const field of listViewFields(meta, titleField, permMatrix)) {
    columns.push({
      id: field.fieldname,
      header: field.label ?? field.fieldname,
      accessorKey: field.fieldname,
      ...(NUMERIC_FIELDTYPES.has(field.fieldtype) ? { align: 'right' as const } : {}),
      cell: fieldCell(field, meta, onFilterClick),
    });
  }

  columns.push({
    id: '_activity',
    header: t('list.activity', 'Activity'),
    meta: { role: 'actions', label: t('list.activity', 'Activity') },
    sortable: false,
    filterable: false,
    cell: ({ row }) => (
      <ActivityCluster
        doc={row.original}
        t={t}
        sessionUser={sessionUser}
        onToggleLike={onToggleLike}
        likeOverrides={likeOverrides}
      />
    ),
  });

  // Hidden sort key — desk default is Last Updated On. The timestamp paints
  // in the activity cluster; the column exists so TanStack can sort on it
  // without a second visible "Last Updated" slot.
  columns.push({
    id: 'modified',
    accessorKey: 'modified',
    header: t('list.lastUpdated', 'Last Updated On'),
    enableHiding: true,
  });

  return columns;
}
