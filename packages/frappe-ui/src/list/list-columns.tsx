import { ChatCircleIcon, HeartIcon } from '@phosphor-icons/react';
// House control for the like toggle — the icon rides the Button icon slot
// (LC-53 GLYPH-SLOT) and the sub-44 circular size resolves the press floor
// through the house channel (LC-54: 44px box + hitSlop).
import { Button } from '@repo/forms';
import type { DataTableColumn } from '@repo/table';
import { formatAbsoluteDateTime } from '@repo/theme';
import { Avatar, Anchor, Chip, Text, XStack } from '@repo/ui';
import type { ChipColor } from '@repo/ui';
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
import type { ReactElement, ReactNode } from 'react';

import type { DocFieldMeta, DoctypeMeta } from '../formEngine/doctype-meta';
import type { PermLevelMatrix } from '../formEngine/field-permissions';

// Field selection + permlevel pruning live in the pure listFields module
// (node-safe, unit-tested in listFields.spec.ts).
import { listViewFields } from './list-fields';
import { formatDateCell, formatTimeAgo, parseUserListField, stripHtmlPreview } from './list-format';
import { statusPillColors } from './status-colors';

/** Minimal row shape for a doctype list (loose — server owns the schema). */
export interface ListDoc {
  name: string;
  doctype: string;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- server-owned doctype row; its field set comes from meta at runtime, so values stay unknown until a cell reads them
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
const cellPreview = (value: string, fieldtype?: string): string => {
  const text = fieldtype !== undefined && RICH_TEXT_FIELDTYPES.has(fieldtype) ? stripHtmlPreview(value) : value;
  return text.replaceAll(/\s+/gu, ' ').trim();
};

const isStatusField = (field: DocFieldMeta, meta?: DoctypeMeta): boolean => {
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
  return options.some((option) => option !== '' && stateTitles.has(option));
};

/** Desk indicator cells: every Select in the list, plus User.enabled. */
const isIndicatorField = (field: DocFieldMeta, meta?: DoctypeMeta): boolean => {
  if (field.fieldtype === 'Select') {
    return true;
  }
  if (field.fieldtype === 'Check' && field.fieldname === 'enabled') {
    return true;
  }
  return isStatusField(field, meta);
};

const stopRowPress = (event?: { stopPropagation?: () => void }) => {
  event?.stopPropagation?.();
};

const CHIP_COLORS: ReadonlySet<string> = new Set<ChipColor>([
  'red',
  'green',
  'blue',
  'yellow',
  'orange',
  'purple',
  'gray',
]);

const isChipColor = (ramp: string): ramp is ChipColor => CHIP_COLORS.has(ramp);

const chipColorFromStatus = (value: string, meta?: DoctypeMeta): ChipColor => {
  // oxlint-disable-next-line sonarjs/super-linear-regex -- input is a short theme token (`$red9`); the trailing-digit run is a few characters
  const ramp = statusPillColors(value, meta).background.replace(/^\$/u, '').replace(/\d+$/u, '');
  if (ramp === 'pink') {
    return 'purple';
  }
  return isChipColor(ramp) ? ramp : 'gray';
};

const IndicatorPill = ({
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
}) => {
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
};

const FilterableText = ({
  fieldname,
  value,
  children,
  onFilterClick,
}: {
  fieldname: string;
  value: string;
  children: ReactNode;
  onFilterClick?: (fieldname: string, value: string) => void;
}) => {
  if (!onFilterClick) {
    // oxlint-disable-next-line react/jsx-no-useless-fragment -- wraps the ReactNode children in an element so the component never returns a bare node (ReactNode includes promises)
    return <>{children}</>;
  }
  return (
    <XStack
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- cross-platform Tamagui stack wrapping the cell text (no <button> on native); onPress handles activation
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
};

const commentCount = (doc: ListRow): number => {
  const raw = doc._comment_count;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- `_comment_count` is an untyped server row value probed at the list's read boundary
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- see above: the count may arrive as a numeric string
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  const comments = doc._comments;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- `_comments` is the raw server JSON string, probed at the read boundary
  if (typeof comments === 'string' && comments.trim()) {
    try {
      const parsed: unknown = JSON.parse(comments);
      if (Array.isArray(parsed)) {
        return parsed.length;
      }
    } catch {
      return 0;
    }
  }
  return 0;
};

const LikeControl = ({
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
}) => {
  const name = doc.name ?? '';
  const likedBy = parseUserListField(doc._liked_by);
  const liked =
    likeOverrides?.[name] ?? (sessionUser !== undefined && sessionUser !== '' ? likedBy.includes(sessionUser) : false);
  const likeLabel = liked ? t('list.unlike', 'Remove from liked') : t('list.like', 'Add to liked');
  if (!onToggleLike || !name) {
    return (
      <Text
        fontSize="$4"
        color={liked ? '$red10' : '$color8'}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a glyph in a cross-platform Tamagui Text (no <img> on native), labeled via aria-label
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
      // SAFETY: both values are theme color tokens; the house Button's `col` prop is typed narrower than Tamagui's color token union.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
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
};

const ActivityCluster = ({
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
}) => {
  const assignees = parseUserListField(doc._assign);
  const comments = commentCount(doc);
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- `modified` is an untyped server row value; only a timestamp string paints
  const modified = typeof doc.modified === 'string' ? doc.modified : '';
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
          {...{ title: absolute === '' ? undefined : absolute }}>
          {formatTimeAgo(modified)}
        </Text>
      ) : null}
      <XStack
        alignItems="center"
        gap="$1"
        aria-label={t('list.comments', 'Comments')}>
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
};

/** Cell for a value already known non-empty and not an indicator. */
const typedCell = (
  field: DocFieldMeta,
  raw: NonNullable<unknown>,
  value: string,
  onFilterClick?: (fieldname: string, value: string) => void,
): ReactElement => {
  // oxlint-disable-next-line typescript/switch-exhaustiveness-check -- the default arm deliberately renders every other fieldtype as a one-line text preview
  switch (field.fieldtype) {
    case 'Check': {
      const checked = Boolean(raw);
      return (
        <Text
          fontSize="$3"
          color={checked ? '$green11' : '$color8'}>
          {checked ? '✓' : '—'}
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

const fieldCell = (
  field: DocFieldMeta,
  meta: DoctypeMeta | undefined,
  onFilterClick?: (fieldname: string, value: string) => void,
) =>
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- TanStack's cell context types getValue as unknown for a meta-driven accessorKey; the cell narrows it below
  function FieldCell({ getValue }: { getValue: () => unknown }) {
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
    // oxlint-disable-next-line typescript/no-base-to-string -- list cell values are scalar wire values (string / number / boolean)
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
    return typedCell(field, raw, value, onFilterClick);
  };

/** Build the DataTable columns for a doctype list from its meta. */
export const buildListColumns = ({
  meta,
  t,
  sessionUser,
  onToggleLike,
  likeOverrides,
  permMatrix,
  getDocHref,
  onFilterClick,
}: BuildListColumnsArgs): DataTableColumn<ListRow>[] => {
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
      // oxlint-disable-next-line typescript/no-base-to-string -- the title field holds a scalar wire value (string / number)
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
      if (href === undefined || href === '') {
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
    const column: DataTableColumn<ListRow> = {
      id: field.fieldname,
      header: field.label ?? field.fieldname,
      accessorKey: field.fieldname,
      cell: fieldCell(field, meta, onFilterClick),
    };
    if (NUMERIC_FIELDTYPES.has(field.fieldtype)) {
      column.align = 'right';
    }
    columns.push(column);
  }

  columns.push(
    {
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
    },
    // Hidden sort key — desk default is Last Updated On. The timestamp paints
    // in the activity cluster; the column exists so TanStack can sort on it
    // without a second visible "Last Updated" slot.
    {
      id: 'modified',
      accessorKey: 'modified',
      header: t('list.lastUpdated', 'Last Updated On'),
      enableHiding: true,
    },
  );

  return columns;
};
