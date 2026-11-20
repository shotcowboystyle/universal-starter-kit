import {
  ArrowBendUpLeftIcon,
  ArrowBendUpRightIcon,
  ChatCircleIcon,
  ClockIcon,
  FileTextIcon,
  PaperPlaneTiltIcon,
  PaperclipIcon,
  PencilSimpleIcon,
  UserIcon,
  UserPlusIcon,
} from '@phosphor-icons/react';
import {
  MIN_PRESS_TARGET,
  containerCapProps,
  ensureFocusVisibleRing,
  formatAbsoluteDateTime,
  formatRelativeTimestamp,
  getGroupPosition,
  pressTargetHitSlop,
  pressTargetStyle,
  radiusStopFromToken,
  resolveRadiusClass,
  stackRadiusProps,
  useResolvedKnobs,
} from '@repo/theme';
import type React from 'react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  Button,
  H2,
  H3,
  H4,
  H5,
  H6,
  Spinner,
  Text,
  TextArea,
  XStack,
  YStack,
  getTokenValue,
  isWeb,
  styled,
} from 'tamagui';
import type { YStackProps } from 'tamagui';

import { Avatar } from '../Avatar';
import type { AvatarSize } from '../Avatar';
import { componentColors, sectionHeading } from '../component-colors';
import { useDirection } from '../hooks/use-direction';
import { useTranslation } from '../shared/i18n';
import { bidiIsolate } from '../shared/t';
import { Skeleton } from '../Skeleton';

import { AsyncBoundary, resolveAsyncStatus } from './AsyncBoundary';

const ReplyPressTarget = styled(XStack, { name: 'ReplyPressTarget' });

/** Semantic label level → tamagui heading component (runtime `tag` is not honored). */
const TIMELINE_HEADING_TAGS = { 2: H2, 3: H3, 4: H4, 5: H5, 6: H6 } as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Version change entry
 */
export interface VersionChange {
  field: string;
  fieldLabel?: string;
  old: unknown;
  new: unknown;
}

/**
 * Timeline entry kind. `comment` renders as a conversation entry (avatar,
 * display name, body, Reply); the rest render as compact system/event rows.
 */
export type TimelineEntryType = 'comment' | 'version' | 'attachment' | 'assignment' | 'info';

/**
 * Generic timeline entry.
 */
export interface TimelineEntry {
  /** Unique identifier */
  id: string;
  /** Entry kind: `comment` vs system/event types */
  type: TimelineEntryType;
  /** Text content (comment text, info message, etc.) */
  content?: string;
  /** Author identifier -- display name or email (legacy). Never rendered raw
   * when it is an email: the local part is prettified ("john.doe@x" -> "John Doe"). */
  author: string;
  /** Explicit author display name -- preferred over `author` when present */
  authorName?: string;
  /** Author email */
  authorEmail?: string;
  /** ISO timestamp string */
  timestamp: string;
  /** Parent entry id -- replies nest one level under their thread root */
  parentId?: string;
  /** For version entries, the changes made */
  changes?: VersionChange[];
}

/** A top-level entry with its (flattened, one-level) replies. */
export interface TimelineThread {
  entry: TimelineEntry;
  replies: TimelineEntry[];
}

/** Semantic heading level of the Timeline label. */
export type TimelineHeadingLevel = 2 | 3 | 4 | 5 | 6;

export interface TimelineProps extends Omit<YStackProps, 'children'> {
  /** Timeline entries to display */
  entries: TimelineEntry[];

  /** Label for the timeline section */
  label?: string;
  /**
   * Semantic level of the label heading. Default 2 — catalog
   * section labels sit one step below the page h1 (see `sectionHeading`).
   * Only the tag / aria-level changes; the visual scale stays the same.
   */
  headingLevel?: TimelineHeadingLevel;
  /** Whether interactions are disabled (read-only) */
  disabled?: boolean;

  /** Whether entries are loading — renders a row-shaped skeleton twin */
  isLoading?: boolean;
  /**
   * Failed load (Axiom 6). Wins over the empty chrome so a failed
   * feed never masquerades as "no activity"; the composer and entry count
   * hide while set. Pass a string, Error, custom node, or `true`
   * for the default error UI.
   */
  error?: Error | React.ReactNode;
  /** Retry handler for the default error chrome */
  onRetry?: () => void;

  /** Whether to show the inline comment composer (default true) */
  enableAddComment?: boolean;

  /** Called when a top-level comment is added (legacy -- prefer onCommentSubmit) */
  onCommentAdded?: (content: string) => void;
  /** Called when a comment or reply is submitted */
  onCommentSubmit?: (content: string, options?: { parentId?: string }) => void;
  /** Called when Reply is pressed on a comment. When omitted, an inline reply
   * composer opens under that comment instead. */
  onReply?: (entry: TimelineEntry) => void;
  /** Called when a timeline entry is clicked */
  onEntryClick?: (entry: TimelineEntry) => void;

  /** Controlled composer value */
  commentValue?: string;
  /** Uncontrolled composer initial value */
  defaultCommentValue?: string;
  /** Called when the composer value changes */
  onCommentChange?: (content: string) => void;

  /** Custom empty state renderer */
  renderEmpty?: () => React.ReactNode;
  /** Custom entry renderer */
  renderEntry?: (entry: TimelineEntry, defaultContent: React.ReactNode) => React.ReactNode;

  /** Optional function to format the visible timestamp — the per-use eject
   * for every entry class. When omitted, the content class picks the register
   * comment rows render the relative form ("2h ago"); system events
   * follow the house `timestampStyle` knob (compact absolute by default).
   * The absolute compact timestamp always sits in the tooltip. */
  formatTimestamp?: (timestamp: string) => string;

  /** Compact mode - smaller UI */
  compact?: boolean;

  /** Labels for i18n -- consumers pass pre-translated strings */
  labels?: {
    noActivity?: string;
    addComment?: string;
    cancel?: string;
    comment?: string;
    sending?: string;
    reply?: string;
    madeChanges?: string;
    addedAttachment?: string;
    assigned?: string;
    empty?: string;
    entry?: string;
    entries?: string;
    loadFailed?: string;
  };
  /** Placeholder text for new comment input */
  placeholder?: string;
  /** Placeholder text for the inline reply composer */
  replyPlaceholder?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getEntryIcon = (entry: TimelineEntry, size: number): React.ReactNode => {
  switch (entry.type) {
    case 'comment': {
      return <ChatCircleIcon size={size} />;
    }
    case 'version': {
      return <PencilSimpleIcon size={size} />;
    }
    case 'attachment': {
      return <PaperclipIcon size={size} />;
    }
    case 'assignment': {
      return <UserPlusIcon size={size} />;
    }
    case 'info': {
      return <FileTextIcon size={size} />;
    }
    default: {
      return <ClockIcon size={size} />;
    }
  }
};

/**
 * Derive a human display name. Non-emails pass through untouched; emails get
 * their local part split on separators and title-cased ("john.doe@x" -> "John Doe").
 * A raw email is never returned as a display name.
 */
// oxlint-disable-next-line react-doctor/only-export-components -- public helper consumed through this module path (tests, package exports); moving it would change the import path
export const prettifyAuthorName = (raw: string): string => {
  const name = (raw ?? '').trim();
  if (!name) {
    return 'Unknown';
  }
  if (!name.includes('@')) {
    return name;
  }
  const [local] = name.split('@');
  const words = local.split(/[._+\-\d]+/u).filter(Boolean);
  if (words.length === 0) {
    return local === '' ? 'Unknown' : local;
  }
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
};

/** Display name for an entry: explicit authorName, else prettified author. */
// oxlint-disable-next-line react-doctor/only-export-components -- public helper consumed through this module path (tests, package exports); moving it would change the import path
export const getEntryDisplayName = (entry: Pick<TimelineEntry, 'author' | 'authorName'>): string => {
  const explicit = entry.authorName?.trim();
  return explicit === undefined || explicit === '' ? prettifyAuthorName(entry.author) : explicit;
};

/**
 * Compact absolute timestamp ("Aug 9, 3:30 PM"; adds year when not current).
 * Canonical formatter lives in theme: one register for
 * Timeline, table date cells, and picker display values.
 */
const defaultFormatTimestamp = (timestamp: string): string => formatAbsoluteDateTime(timestamp);

// Relative register re-exported so existing consumers keep their import path.
export { formatRelativeTimestamp } from '@repo/theme';

/**
 * Group a flat entry list into one-level threads. Top-level order follows the
 * input order of the root entries; replies (including reply-to-reply, which
 * flattens under the thread root) sort oldest-first so threads read downward.
 * Orphaned parentIds (parent missing from the list) fall back to top-level.
 */
// oxlint-disable-next-line react-doctor/only-export-components -- public helper consumed through this module path (tests, package exports); moving it would change the import path
export const threadEntries = (entries: TimelineEntry[]): TimelineThread[] => {
  const byId = new Map(entries.map((e) => [e.id, e]));

  const rootOf = (entry: TimelineEntry): TimelineEntry => {
    let current = entry;
    const seen = new Set<string>([current.id]);
    while (current.parentId !== undefined && current.parentId !== '') {
      const parent = byId.get(current.parentId);
      if (!parent || seen.has(parent.id)) {
        break;
      }
      seen.add(parent.id);
      current = parent;
    }
    return current;
  };

  const threads: TimelineThread[] = [];
  const threadByRootId = new Map<string, TimelineThread>();
  for (const entry of entries) {
    if (rootOf(entry).id !== entry.id) {
      continue;
    }
    const thread: TimelineThread = { entry, replies: [] };
    threads.push(thread);
    threadByRootId.set(entry.id, thread);
  }
  for (const entry of entries) {
    const root = rootOf(entry);
    if (root.id === entry.id) {
      continue;
    }
    const thread = threadByRootId.get(root.id);
    if (thread) {
      thread.replies.push(entry);
    } else {
      // parentId cycle: no resolvable root — promote to top-level so no
      // entry ever silently disappears from the feed
      const fallback: TimelineThread = { entry, replies: [] };
      threads.push(fallback);
      threadByRootId.set(entry.id, fallback);
    }
  }
  const time = (e: TimelineEntry) => {
    const t = new Date(e.timestamp).getTime();
    return Number.isNaN(t) ? 0 : t;
  };
  for (const thread of threads) {
    thread.replies.sort((a, b) => time(a) - time(b));
  }
  return threads;
};

/** Flat feed walk: roots, then one-level replies, then an open reply composer. */
type TimelineFeedItem =
  | { key: string; kind: 'entry'; entry: TimelineEntry; rootId: string; isReply: boolean }
  | { key: string; kind: 'reply-composer'; parent: TimelineEntry; rootId: string };

const flattenFeedItems = (
  threads: TimelineThread[],
  entries: TimelineEntry[],
  replyTarget: { rootId: string; parentId: string } | null,
): TimelineFeedItem[] => {
  const items: TimelineFeedItem[] = [];
  // First match wins, like Array#find, when ids repeat.
  const entryById = new Map<string, TimelineEntry>();
  for (const entry of entries) {
    if (!entryById.has(entry.id)) {
      entryById.set(entry.id, entry);
    }
  }
  for (const thread of threads) {
    const rootId = thread.entry.id;
    items.push({
      key: rootId,
      kind: 'entry',
      entry: thread.entry,
      rootId,
      isReply: false,
    });
    for (const reply of thread.replies) {
      items.push({
        key: reply.id,
        kind: 'entry',
        entry: reply,
        rootId,
        isReply: true,
      });
    }
    if (replyTarget && replyTarget.rootId === rootId) {
      items.push({
        key: `reply-composer-${rootId}`,
        kind: 'reply-composer',
        parent: entryById.get(replyTarget.parentId) ?? thread.entry,
        rootId,
      });
    }
  }
  return items;
};

/**
 * GitHub/Primer spine: a flat 1px scheme-aware connector through
 * the avatar/badge column. First/last items clip the line to the node center
 * so the rail does not run off the stacked group (Primer `clipSidebar`).
 */
const TimelineSpine = ({
  show,
  clipStart,
  clipEnd,
  columnPx,
  insetStart,
}: {
  show: boolean;
  clipStart: boolean;
  clipEnd: boolean;
  columnPx: number;
  insetStart: number;
}) => {
  if (!show) {
    return null;
  }
  const nodeCenter = insetStart + columnPx / 2;
  return (
    <YStack
      position="absolute"
      width={1}
      top={clipStart ? nodeCenter : 0}
      bottom={clipEnd ? nodeCenter : 0}
      backgroundColor={componentColors.divider}
      pointerEvents="none"
      zIndex={0}
      {...(isWeb ? { insetInlineStart: nodeCenter } : { start: nodeCenter })}
    />
  );
};

const getEntryActionLabel = (
  entry: TimelineEntry,
  labels: { madeChanges: string; addedAttachment: string; assigned: string },
): string | undefined => {
  if (entry.type === 'version') {
    return labels.madeChanges;
  }
  if (entry.type === 'attachment') {
    return labels.addedAttachment;
  }
  if (entry.type === 'assignment') {
    return labels.assigned;
  }
  return undefined;
};

/**
 * Skeleton twin of the comment rows: avatar block +
 * name/time line + body line mirror the live entry anatomy. The avatar
 * follows the radius knob like the live Avatar (no hardcoded circle).
 */
const TimelineSkeleton = ({
  compact = false,
  avatarPx,
  loadingLabel,
}: {
  compact?: boolean;
  avatarPx: number;
  loadingLabel: string;
}) => (
  <YStack
    gap={compact ? '$3' : '$4'}
    width="100%"
    data-async-skeleton="timeline"
    aria-busy
    aria-label={loadingLabel}>
    {Array.from({ length: 3 }).map((_, i) => (
      <XStack
        key={i}
        gap={compact ? '$2' : '$3'}
        alignItems="flex-start">
        <Skeleton
          variant="rounded"
          width={avatarPx}
          height={avatarPx}
        />
        <YStack
          flex={1}
          gap="$1.5"
          paddingTop={2}>
          <Skeleton
            width="35%"
            height={compact ? 10 : 12}
          />
          <Skeleton
            width="80%"
            height={compact ? 12 : 14}
          />
        </YStack>
      </XStack>
    ))}
  </YStack>
);

// ---------------------------------------------------------------------------
// View model shared by the feed sub-components
// ---------------------------------------------------------------------------

type ResolvedKnobs = ReturnType<typeof useResolvedKnobs>;
type ResolvedKnobProps = ResolvedKnobs['knobProps'];
type ResolvedControl = ResolvedKnobs['control'];
type RadiusToken = ResolvedKnobProps['borderRadius']['borderRadius'];
type TranslateFn = ReturnType<typeof useTranslation>['t'];
type TimelineLabels = NonNullable<TimelineProps['labels']>;
type CommentPad = '$2' | '$3';

const NO_LABELS: TimelineLabels = {};
const EMPTY_VALUE_LABEL = '(empty)';
const MAX_VISIBLE_CHANGES = 5;

const resolveMutedColor = (textAccentColor: string): string =>
  textAccentColor === '$color' ? '$color12' : textAccentColor;

const hasText = (value: string | undefined): value is string => value !== undefined && value !== '';

const resolveTimelineLabels = (labels: TimelineLabels, t: TranslateFn) => ({
  noActivityLabel: labels.noActivity ?? t('No activity yet'),
  addCommentLabel: labels.addComment ?? t('Add Comment'),
  cancelLabel: labels.cancel ?? t('Cancel'),
  commentLabel: labels.comment ?? t('Comment'),
  sendingLabel: labels.sending ?? t('Sending...'),
  replyLabel: labels.reply ?? t('Reply'),
  madeChangesLabel: labels.madeChanges ?? t('made changes'),
  addedAttachmentLabel: labels.addedAttachment ?? t('added an attachment'),
  assignedLabel: labels.assigned ?? t('assigned'),
  entryLabel: labels.entry ?? t('entry'),
  entriesLabel: labels.entries ?? t('entries'),
  loadFailedLabel: labels.loadFailed ?? t("Couldn't load activity"),
});

const bySize = <T extends number | string>(sizeToken: string, small: T, medium: T, large: T): T => {
  if (sizeToken === '$3') {
    return small;
  }
  if (sizeToken === '$5') {
    return large;
  }
  return medium;
};

const computeTimelineMetrics = (compact: boolean, sizeToken: string) => ({
  bodyFontSize: compact ? ('$2' as const) : bySize(sizeToken, '$2', '$3', '$4'),
  nameFontSize: compact ? ('$2' as const) : bySize(sizeToken, '$2', '$3', '$4'),
  metaFontSize: compact ? ('$1' as const) : ('$2' as const),
  systemFontSize: compact ? ('$1' as const) : ('$2' as const),
  avatarSize: compact ? ('$1.5' as const) : bySize(sizeToken, '$2', '$2', '$3'),
  replyAvatarSize: compact ? ('$1' as const) : ('$1.5' as const),
  // Twin of the live avatar/badge column — spine centers on this well.
  columnPx: compact ? 20 : bySize(sizeToken, 24, 24, 34),
  rowPad: compact ? 8 : bySize(sizeToken, 12, 12, 16),
  emptyIconSize: compact ? bySize(sizeToken, 20, 24, 28) : bySize(sizeToken, 32, 40, 48),
});

type TimelineMetrics = ReturnType<typeof computeTimelineMetrics>;

const resolveCommentPaddingPx = (commentPad: CommentPad): number | undefined => {
  // SAFETY: '$2' and '$3' are space tokens in the Tamagui config; getTokenValue's Token union omits specific tokens.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the config's specific space tokens are absent from getTokenValue's Token type, so the literal needs the cast
  const px: unknown = getTokenValue(commentPad as Parameters<typeof getTokenValue>[0], 'space');
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- getTokenValue is typed `any`; space tokens resolve to a number, anything else must not feed the radius cap
  return typeof px === 'number' ? px : undefined;
};

const resolveCommentRadius = (radiusToken: RadiusToken, commentPad: CommentPad) => {
  const commentStop = radiusStopFromToken(radiusToken);
  const paddingPx = resolveCommentPaddingPx(commentPad);
  return commentStop && paddingPx !== undefined
    ? resolveRadiusClass('CONTAINER-CAP', commentStop, { paddingPx })
    : radiusToken;
};

// Timestamp register: the content class picks the register.
// Social/comment rows default to the relative form ("2h ago"); system
// events follow the house `timestampStyle` knob (compact absolute by
// default; a house flip to "relative" re-registers events too). A consumer
// `formatTimestamp` is the eject for every class.
const formatVisibleTimestamp = (
  entry: TimelineEntry,
  formatTimestamp: TimelineProps['formatTimestamp'],
  timestampStyle: ResolvedKnobProps['timestampStyle'],
): string => {
  if (formatTimestamp) {
    return formatTimestamp(entry.timestamp);
  }
  if (entry.type === 'comment' || timestampStyle === 'relative') {
    return formatRelativeTimestamp(entry.timestamp);
  }
  return defaultFormatTimestamp(entry.timestamp);
};

// Every value the old `value || '(empty)'` truthiness check treated as empty
// (Set membership matches NaN via SameValueZero).
const EMPTY_CHANGE_VALUES = new Set<unknown>([undefined, null, '', 0, false, 0n, Number.NaN]);

const formatChangeValue = (value: VersionChange['old']): string => {
  if (EMPTY_CHANGE_VALUES.has(value)) {
    return EMPTY_VALUE_LABEL;
  }
  return String(value);
};

interface TimelineViewInput extends Omit<TimelineView, 'mutedColor' | 'formatVisible'> {
  formatTimestamp: TimelineProps['formatTimestamp'];
}

const buildTimelineView = ({ formatTimestamp, ...base }: TimelineViewInput): TimelineView => ({
  ...base,
  mutedColor: resolveMutedColor(base.knobProps.textAccentColor),
  formatVisible: (entry) => formatVisibleTimestamp(entry, formatTimestamp, base.knobProps.timestampStyle),
});

interface TimelineView {
  compact: boolean;
  knobProps: ResolvedKnobProps;
  control: ResolvedControl;
  radiusToken: RadiusToken;
  metrics: TimelineMetrics;
  commentPad: CommentPad;
  commentRadius: ReturnType<typeof resolveCommentRadius>;
  mutedColor: string;
  formatVisible: (entry: TimelineEntry) => string;
  replyLabel: string;
  actionLabels: { madeChanges: string; addedAttachment: string; assigned: string };
  showReplyAction: boolean;
  onReplyPress: (entry: TimelineEntry, rootId: string) => void;
  ReplyIcon: typeof ArrowBendUpLeftIcon;
}

const TimelineViewContext = createContext<TimelineView | null>(null);

const useTimelineView = (): TimelineView => {
  const view = useContext(TimelineViewContext);
  if (view === null) {
    throw new Error('Timeline sub-components must render inside <Timeline>');
  }
  return view;
};

// ---------------------------------------------------------------------------
// Feed sub-components
// ---------------------------------------------------------------------------

const TimelineTimestamp = ({ entry, fontSize }: { entry: TimelineEntry; fontSize: string }) => {
  const { mutedColor, formatVisible } = useTimelineView();
  const absolute = defaultFormatTimestamp(entry.timestamp);
  // Absolute compact timestamp in the tooltip + accessible name; `title` is
  // outside the RN-flavored Text prop type, so it rides an index-signature spread.
  const titleProps = { title: absolute };
  return (
    <Text
      fontSize={fontSize}
      color={mutedColor}
      {...titleProps}
      aria-label={absolute}>
      {formatVisible(entry)}
    </Text>
  );
};

// R-IDENTITY: the avatar slot inside a feed row is a
// declared identity shape — a recognized object, not a styled box — so it
// keeps its circle at every radius value including `none`. This reverses
// the earlier `circular` eject, which read Avatar as R-SCALE back when the
// spec table still classed it that way; the table was the wrong half.
const EntryAvatar = ({ entry, size }: { entry: TimelineEntry; size: AvatarSize }) => (
  <Avatar
    size={size}
    name={getEntryDisplayName(entry)}
    fallbackBackgroundColor="$accentBackground"
  />
);

const VersionChanges = ({ changes }: { changes: VersionChange[] }) => {
  const { knobProps } = useTimelineView();
  return (
    <YStack
      gap="$1"
      marginTop="$1">
      {changes.slice(0, MAX_VISIBLE_CHANGES).map((change) => (
        <XStack
          key={change.field}
          gap="$2"
          flexWrap="wrap">
          <Text
            fontSize="$1"
            color={knobProps.textAccentColor}
            fontWeight="400">
            {hasText(change.fieldLabel) ? change.fieldLabel : change.field}:
          </Text>
          {change.old !== undefined && (
            <Text
              fontSize="$1"
              color={componentColors.semantic.error}
              textDecorationLine="line-through">
              {formatChangeValue(change.old)}
            </Text>
          )}
          {change.old !== undefined && change.new !== undefined && (
            <Text
              fontSize="$1"
              color={knobProps.textAccentColor}>
              →
            </Text>
          )}
          {change.new !== undefined && (
            <Text
              fontSize="$1"
              color={componentColors.semantic.success}>
              {formatChangeValue(change.new)}
            </Text>
          )}
        </XStack>
      ))}
      {changes.length > MAX_VISIBLE_CHANGES && (
        <Text
          fontSize="$1"
          color={knobProps.textAccentColor}
          fontStyle="italic">
          +{changes.length - MAX_VISIBLE_CHANGES} more changes
        </Text>
      )}
    </YStack>
  );
};

/** Conversation entry: avatar on the spine + GitHub/Desk comment card. */
const TimelineCommentEntry = ({
  entry,
  rootId,
  isReply,
}: {
  entry: TimelineEntry;
  rootId: string;
  isReply: boolean;
}) => {
  const {
    compact,
    knobProps,
    radiusToken,
    metrics,
    commentPad,
    commentRadius,
    formatVisible,
    replyLabel,
    showReplyAction,
    onReplyPress,
    ReplyIcon,
  } = useTimelineView();
  const displayName = getEntryDisplayName(entry);
  return (
    <XStack
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui XStack feed row; the feed is a Tamagui role="feed" stack, not native <article> markup
      role="article"
      aria-label={`${displayName}, ${formatVisible(entry)}`}
      gap={compact ? '$2' : '$3'}
      alignItems="flex-start">
      <YStack
        width={metrics.columnPx}
        minHeight={metrics.columnPx}
        alignItems="center"
        justifyContent="flex-start"
        zIndex={1}>
        <EntryAvatar
          entry={entry}
          size={isReply ? metrics.replyAvatarSize : metrics.avatarSize}
        />
      </YStack>
      <YStack
        flex={1}
        minWidth={0}
        gap="$1"
        backgroundColor={componentColors.surface.background}
        {...knobProps.borderRadius}
        borderRadius={commentRadius}
        {...containerCapProps('OwnInset', radiusToken, knobProps.space)}
        padding={commentPad}>
        <XStack
          gap="$2"
          alignItems="center"
          flexWrap="wrap">
          <Text
            fontSize={metrics.nameFontSize}
            fontWeight="400"
            color={componentColors.text.primary}>
            {displayName}
          </Text>
          <TimelineTimestamp
            entry={entry}
            fontSize={metrics.metaFontSize}
          />
        </XStack>
        {hasText(entry.content) && (
          <Text
            {...knobProps.body}
            fontSize={metrics.bodyFontSize}
            color={componentColors.text.primary}
            whiteSpace="pre-wrap">
            {entry.content}
          </Text>
        )}
        {showReplyAction && (
          <ReplyPressTarget
            marginInlineStart={-8}
            marginVertical={-Math.ceil((MIN_PRESS_TARGET - (compact ? 20 : 28)) / 2)}>
            {/* Press-floor: the chromeless pill paints at
                the $1/$2 token (20/28px) but the press box is floored at 44
                via the house pressTarget* channel (grown transparent box +
                this slot's negative outset + hitSlop) — layout height stays
                token-sized.
                The grown box NEVER paints —
                the Button's default hover/press fills would spread across
                the whole 44px floor and cover the comment text above via
                the negative outset, so the consumer eject pins them to
                transparent and feedback rides subtree opacity instead. */}
            <Button
              chromeless
              size={compact ? '$1' : '$2'}
              {...pressTargetStyle()}
              hitSlop={pressTargetHitSlop(compact ? 20 : 28)}
              borderRadius={radiusToken}
              opacity={0.8}
              hoverStyle={{ backgroundColor: 'transparent', opacity: 1 }}
              pressStyle={{ backgroundColor: 'transparent', opacity: 0.9 }}
              icon=<ReplyIcon size={compact ? 10 : 12} />
              aria-label={`${replyLabel} ${displayName}`}
              onPress={(e) => {
                e.stopPropagation?.();
                onReplyPress(entry, rootId);
              }}>
              {replyLabel}
            </Button>
          </ReplyPressTarget>
        )}
      </YStack>
    </XStack>
  );
};

/** System/event entry: compact, muted, badge-on-spine single-line row. */
const TimelineSystemEntry = ({ entry }: { entry: TimelineEntry }) => {
  const { compact, knobProps, metrics, mutedColor, actionLabels } = useTimelineView();
  const displayName = getEntryDisplayName(entry);
  const actionLabel = getEntryActionLabel(entry, actionLabels);
  const iconSize = compact ? 12 : 14;
  const { changes } = entry;
  const { systemFontSize } = metrics;
  return (
    <XStack
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui XStack feed row; the feed is a Tamagui role="feed" stack, not native <article> markup
      role="article"
      aria-label={`${displayName} ${actionLabel ?? entry.content ?? ''}`.trim()}
      gap={compact ? '$2' : '$3'}
      alignItems="flex-start">
      <YStack
        width={metrics.columnPx}
        height={metrics.columnPx}
        alignItems="center"
        justifyContent="center"
        zIndex={1}
        backgroundColor={componentColors.surface.background}
        {...knobProps.borderRadius}>
        {getEntryIcon(entry, iconSize)}
      </YStack>
      <YStack
        flex={1}
        gap="$0.5"
        paddingTop={2}
        minWidth={0}>
        <XStack
          gap="$1.5"
          alignItems="center"
          flexWrap="wrap">
          <Text
            fontSize={systemFontSize}
            fontWeight="400"
            color={mutedColor}>
            {displayName}
          </Text>
          {hasText(actionLabel) && (
            <Text
              fontSize={systemFontSize}
              color={mutedColor}>
              {actionLabel}
            </Text>
          )}
          {hasText(entry.content) && entry.type !== 'info' && (
            <Text
              fontSize={systemFontSize}
              color={mutedColor}>
              {entry.content}
            </Text>
          )}
          <Text
            fontSize={systemFontSize}
            color={mutedColor}
            opacity={0.75}>
            ·
          </Text>
          <TimelineTimestamp
            entry={entry}
            fontSize={systemFontSize}
          />
        </XStack>
        {hasText(entry.content) && entry.type === 'info' && (
          <Text
            fontSize={systemFontSize}
            color={mutedColor}
            fontStyle="italic">
            {entry.content}
          </Text>
        )}
        {entry.type === 'version' && changes !== undefined && changes.length > 0 && (
          <VersionChanges changes={changes} />
        )}
      </YStack>
    </XStack>
  );
};

interface TimelineStackedRowProps {
  index: number;
  count: number;
  entry?: TimelineEntry;
  onEntryClick?: (entry: TimelineEntry) => void;
  children: React.ReactNode;
}

const TimelineStackedRow = ({ index, count, entry, onEntryClick, children }: TimelineStackedRowProps) => {
  const { control, radiusToken, metrics } = useTimelineView();
  const position = getGroupPosition(index, count);
  const corners = stackRadiusProps(position, radiusToken);
  const handleClick =
    entry !== undefined && onEntryClick != null
      ? () => {
          onEntryClick(entry);
        }
      : undefined;
  const clickable = handleClick !== undefined;
  return (
    <YStack
      position="relative"
      overflow="hidden"
      {...corners}
      padding={metrics.rowPad}
      borderBottomWidth={position === 'last' || position === 'only' ? 0 : 1}
      borderBottomColor={componentColors.divider}
      backgroundColor="transparent"
      hoverStyle={{ ...control.hoverKnobProps, ...corners }}
      pressStyle={clickable ? { ...control.pressKnobProps, ...corners } : undefined}
      onPress={handleClick}
      cursor={clickable ? 'pointer' : 'default'}
      outlineWidth={0}
      focusStyle={{ outlineWidth: 0 }}
      focusVisibleStyle={clickable ? ensureFocusVisibleRing({ outlineOffset: -2 }) : undefined}
      {...{ 'data-group-position': position }}>
      <TimelineSpine
        show={count > 1}
        clipStart={position === 'first'}
        clipEnd={position === 'last'}
        columnPx={metrics.columnPx}
        insetStart={metrics.rowPad}
      />
      {children}
    </YStack>
  );
};

interface TimelineFeedProps {
  items: TimelineFeedItem[];
  feedLabel: string;
  renderEntry?: TimelineProps['renderEntry'];
  onEntryClick?: (entry: TimelineEntry) => void;
  renderReplyComposer: (parent: TimelineEntry) => React.ReactNode;
}

const TimelineFeed = ({ items, feedLabel, renderEntry, onEntryClick, renderReplyComposer }: TimelineFeedProps) => (
  <YStack
    role="feed"
    aria-label={feedLabel}>
    {items.map((item, index) => {
      if (item.kind === 'reply-composer') {
        return (
          <TimelineStackedRow
            key={item.key}
            index={index}
            count={items.length}>
            {renderReplyComposer(item.parent)}
          </TimelineStackedRow>
        );
      }
      const defaultContent =
        item.entry.type === 'comment' ? (
          <TimelineCommentEntry
            entry={item.entry}
            rootId={item.rootId}
            isReply={item.isReply}
          />
        ) : (
          <TimelineSystemEntry entry={item.entry} />
        );
      return (
        <TimelineStackedRow
          key={item.key}
          index={index}
          count={items.length}
          entry={item.entry}
          onEntryClick={onEntryClick}>
          {renderEntry ? renderEntry(item.entry, defaultContent) : defaultContent}
        </TimelineStackedRow>
      );
    })}
  </YStack>
);

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

const composerMinHeight = (expanded: boolean, compact: boolean): number => {
  if (expanded) {
    return compact ? 60 : 80;
  }
  return compact ? 32 : 40;
};

const ComposerAvatar = ({ size, iconPx }: { size: AvatarSize; iconPx: number }) => (
  <Avatar
    size={size}
    backgroundColor={componentColors.interactive.hover}>
    <Avatar.Fallback
      backgroundColor={componentColors.interactive.hover}
      alignItems="center"
      justifyContent="center">
      <UserIcon size={iconPx} />
    </Avatar.Fallback>
  </Avatar>
);

interface ComposerBoxProps {
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  placeholder: string;
  autoFocus?: boolean;
  expanded: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  ariaLabel: string;
  avatar: React.ReactNode;
  isAddingComment: boolean;
  cancelLabel: string;
  commentLabel: string;
  sendingLabel: string;
}

const ComposerBox = ({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  autoFocus,
  expanded,
  onFocus,
  onBlur,
  ariaLabel,
  avatar,
  isAddingComment,
  cancelLabel,
  commentLabel,
  sendingLabel,
}: ComposerBoxProps) => {
  const { compact, knobProps, radiusToken } = useTimelineView();
  return (
    <XStack
      {...knobProps.gap}
      alignItems="flex-start">
      {avatar}
      <YStack
        flex={1}
        gap="$2">
        <TextArea
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          aria-label={ariaLabel}
          size={compact ? '$2' : '$3'}
          minHeight={composerMinHeight(expanded, compact)}
          backgroundColor={knobProps.inputBackground}
          {...{ borderRadius: radiusToken }}
          autoFocus={autoFocus}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            } else if (e.key === 'Escape') {
              onCancel();
            }
          }}
        />
        {expanded && (
          <XStack
            {...knobProps.gap}
            justifyContent="flex-end">
            <Button
              size={compact ? '$2' : '$3'}
              variant="outlined"
              borderRadius={radiusToken}
              onPress={onCancel}
              disabled={isAddingComment}>
              {cancelLabel}
            </Button>
            <Button
              size={compact ? '$2' : '$3'}
              borderRadius={radiusToken}
              icon={isAddingComment ? <Spinner size="small" /> : <PaperPlaneTiltIcon size={14} />}
              onPress={onSubmit}
              disabled={!value.trim() || isAddingComment}>
              {isAddingComment ? sendingLabel : commentLabel}
            </Button>
          </XStack>
        )}
      </YStack>
    </XStack>
  );
};

interface TimelineComposerArgs {
  commentValue?: string;
  defaultCommentValue: string;
  onCommentChange?: (content: string) => void;
  onCommentSubmit?: TimelineProps['onCommentSubmit'];
  onCommentAdded?: (content: string) => void;
  onReply?: (entry: TimelineEntry) => void;
  enableAddComment: boolean;
  disabled: boolean;
}

const useTimelineComposer = ({
  commentValue,
  defaultCommentValue,
  onCommentChange,
  onCommentSubmit,
  onCommentAdded,
  onReply,
  enableAddComment,
  disabled,
}: TimelineComposerArgs) => {
  const [internalValue, setInternalValue] = useState(defaultCommentValue);
  const [composerFocused, setComposerFocused] = useState(false);
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [replyTarget, setReplyTarget] = useState<{ rootId: string; parentId: string } | null>(null);
  const [replyText, setReplyText] = useState('');

  const composerText = commentValue ?? internalValue;

  const submitComment = useCallback(
    (content: string, parentId?: string) => {
      if (onCommentSubmit) {
        onCommentSubmit(content, hasText(parentId) ? { parentId } : undefined);
      } else {
        onCommentAdded?.(content);
      }
    },
    [onCommentSubmit, onCommentAdded],
  );

  const canCompose = enableAddComment && !disabled && (onCommentSubmit ?? onCommentAdded) != null;
  const showReplyAction = !disabled && (onReply != null || canCompose);

  const setComposerText = useCallback(
    (text: string) => {
      if (commentValue === undefined) {
        setInternalValue(text);
      }
      onCommentChange?.(text);
    },
    [commentValue, onCommentChange],
  );

  const handleAddComment = useCallback(() => {
    const content = composerText.trim();
    if (content === '' || isAddingComment) {
      return;
    }
    setIsAddingComment(true);
    try {
      submitComment(content);
      setComposerText('');
      setComposerFocused(false);
    } catch (error) {
      setIsAddingComment(false);
      throw error;
    }
    setIsAddingComment(false);
  }, [composerText, isAddingComment, submitComment, setComposerText]);

  const handleSubmitReply = useCallback(() => {
    const content = replyText.trim();
    if (content === '' || replyTarget === null) {
      return;
    }
    submitComment(content, replyTarget.parentId);
    setReplyText('');
    setReplyTarget(null);
  }, [replyText, replyTarget, submitComment]);

  const handleReplyPress = useCallback(
    (entry: TimelineEntry, rootId: string) => {
      if (onReply) {
        onReply(entry);
        return;
      }
      if (!canCompose) {
        return;
      }
      setReplyTarget({ rootId, parentId: entry.id });
      setReplyText('');
    },
    [onReply, canCompose],
  );

  return {
    composerText,
    setComposerText,
    composerFocused,
    setComposerFocused,
    isAddingComment,
    replyTarget,
    setReplyTarget,
    replyText,
    setReplyText,
    canCompose,
    showReplyAction,
    handleAddComment,
    handleSubmitReply,
    handleReplyPress,
  };
};

interface TimelineHeaderProps {
  label: string;
  headingLevel: TimelineHeadingLevel;
  compact: boolean;
  entryCount: number;
  hasError: boolean;
  entryLabel: string;
  entriesLabel: string;
  textAccentColor: ResolvedKnobProps['textAccentColor'];
}

const TimelineHeader = ({
  label,
  headingLevel,
  compact,
  entryCount,
  hasError,
  entryLabel,
  entriesLabel,
  textAccentColor,
}: TimelineHeaderProps) => {
  const LabelTag = TIMELINE_HEADING_TAGS[headingLevel];
  return (
    <XStack
      alignItems="center"
      justifyContent="space-between">
      {/* Semantic tag follows headingLevel (default h2); the explicit
          size spreads pin the visual scale at every level. */}
      <LabelTag {...(compact ? { fontSize: '$4', fontWeight: '600' } : sectionHeading)}>{label}</LabelTag>
      {/* Entry count hides on error so the badge can't lie.
          Bidi-isolated so RTL contexts keep "7 entries" in one run. */}
      {entryCount > 0 && !hasError && (
        <Text
          fontSize="$2"
          color={textAccentColor}>
          {bidiIsolate(`${entryCount} ${entryCount === 1 ? entryLabel : entriesLabel}`)}
        </Text>
      )}
    </XStack>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TimelineEmptyStateProps {
  compact: boolean;
  iconSize: number;
  sizeToken: string;
  label: string;
  knobProps: ResolvedKnobProps;
}

const TimelineEmptyState = ({ compact, iconSize, sizeToken, label, knobProps }: TimelineEmptyStateProps) => (
  <YStack
    {...(compact ? { padding: '$3' } : knobProps.panelPadding)}
    alignItems="center"
    gap="$2"
    opacity={0.5}>
    <ClockIcon size={iconSize} />
    <Text
      color={knobProps.textAccentColor}
      fontSize={compact ? '$2' : sizeToken}>
      {label}
    </Text>
  </YStack>
);

type DefaultedTimelineProp =
  | 'headingLevel'
  | 'disabled'
  | 'isLoading'
  | 'error'
  | 'enableAddComment'
  | 'defaultCommentValue'
  | 'compact'
  | 'labels';

type ResolvedTimelineProps = Omit<TimelineProps, DefaultedTimelineProp> &
  Required<Pick<TimelineProps, DefaultedTimelineProp>>;

/** Error wins: a failed feed must never look like "no activity". */
const deriveFeedStatus = (error: TimelineProps['error'], isLoading: boolean, entryCount: number) => {
  const hasError = resolveAsyncStatus({ error }) === 'error';
  return {
    hasError,
    showSkeleton: !hasError && isLoading && entryCount === 0,
    showEmpty: !hasError && entryCount === 0,
  };
};

const TimelineContent = ({
  entries,
  label,
  headingLevel,
  disabled,
  isLoading,
  error,
  onRetry,
  enableAddComment,
  onCommentAdded,
  onCommentSubmit,
  onReply,
  onEntryClick,
  commentValue,
  defaultCommentValue,
  onCommentChange,
  renderEmpty,
  renderEntry,
  formatTimestamp,
  compact,
  labels,
  placeholder: placeholderProp,
  replyPlaceholder: replyPlaceholderProp,
  ...stackProps
}: ResolvedTimelineProps) => {
  const { t } = useTranslation();
  const { knobProps, control } = useResolvedKnobs();
  // Reply arrow bends back toward the quoted message — direction-of-travel,
  // so the glyph pair swaps under RTL (Axiom 15 / useDirection pattern).
  const ReplyIcon = useDirection() === 'rtl' ? ArrowBendUpRightIcon : ArrowBendUpLeftIcon;
  const placeholder = placeholderProp ?? t('Add a comment...');
  const replyPlaceholder = replyPlaceholderProp ?? t('Write a reply...');

  const {
    noActivityLabel,
    addCommentLabel,
    cancelLabel,
    commentLabel,
    sendingLabel,
    replyLabel,
    madeChangesLabel,
    addedAttachmentLabel,
    assignedLabel,
    entryLabel,
    entriesLabel,
    loadFailedLabel,
  } = resolveTimelineLabels(labels, t);

  const composer = useTimelineComposer({
    commentValue,
    defaultCommentValue,
    onCommentChange,
    onCommentSubmit,
    onCommentAdded,
    onReply,
    enableAddComment,
    disabled,
  });
  const {
    composerText,
    setComposerText,
    setComposerFocused,
    isAddingComment,
    replyTarget,
    replyText,
    setReplyText,
    setReplyTarget,
    canCompose,
    handleAddComment,
    handleSubmitReply,
  } = composer;

  const { hasError, showSkeleton, showEmpty } = deriveFeedStatus(error, isLoading, entries.length);

  const threads = useMemo(() => threadEntries(entries), [entries]);
  const feedItems = useMemo(() => flattenFeedItems(threads, entries, replyTarget), [threads, entries, replyTarget]);

  const sz = knobProps.sizeToken;
  const radiusToken = knobProps.borderRadius.borderRadius;
  const metrics = computeTimelineMetrics(compact, sz);
  // The comment card is a padded content container, so it caps
  // at its own padding, not at the panelPadding knob it does not use.
  const commentPad: CommentPad = compact ? '$2' : '$3';
  const commentRadius = resolveCommentRadius(radiusToken, commentPad);

  const view = buildTimelineView({
    compact,
    knobProps,
    control,
    radiusToken,
    metrics,
    commentPad,
    commentRadius,
    formatTimestamp,
    replyLabel,
    actionLabels: { madeChanges: madeChangesLabel, addedAttachment: addedAttachmentLabel, assigned: assignedLabel },
    showReplyAction: composer.showReplyAction,
    onReplyPress: composer.handleReplyPress,
    ReplyIcon,
  });

  const composerLabels = { isAddingComment, cancelLabel, commentLabel, sendingLabel };

  const emptyState = renderEmpty ? (
    renderEmpty()
  ) : (
    <TimelineEmptyState
      compact={compact}
      iconSize={metrics.emptyIconSize}
      sizeToken={sz}
      label={noActivityLabel}
      knobProps={knobProps}
    />
  );

  const renderComposer = () => {
    if (!canCompose) {
      return null;
    }
    const expanded = composer.composerFocused || composerText.trim().length > 0;
    return (
      <ComposerBox
        {...composerLabels}
        value={composerText}
        onChange={setComposerText}
        onSubmit={handleAddComment}
        onCancel={() => {
          setComposerText('');
          setComposerFocused(false);
        }}
        placeholder={placeholder}
        expanded={expanded}
        onFocus={() => {
          setComposerFocused(true);
        }}
        onBlur={() => {
          if (!composerText.trim()) {
            setComposerFocused(false);
          }
        }}
        ariaLabel={addCommentLabel}
        avatar={
          <ComposerAvatar
            size={metrics.avatarSize}
            iconPx={compact ? 12 : 14}
          />
        }
      />
    );
  };

  const renderReplyComposer = (parentEntry: TimelineEntry) => (
    <ComposerBox
      {...composerLabels}
      value={replyText}
      onChange={setReplyText}
      onSubmit={handleSubmitReply}
      onCancel={() => {
        setReplyText('');
        setReplyTarget(null);
      }}
      placeholder={replyPlaceholder}
      autoFocus
      expanded
      ariaLabel={`${replyLabel} ${getEntryDisplayName(parentEntry)}`}
      avatar={
        <ComposerAvatar
          size={metrics.replyAvatarSize}
          iconPx={compact ? 10 : 12}
        />
      }
    />
  );

  return (
    <TimelineViewContext.Provider value={view}>
      <YStack
        {...knobProps.gap}
        {...stackProps}>
        {hasText(label) && (
          <TimelineHeader
            label={label}
            headingLevel={headingLevel}
            compact={compact}
            entryCount={entries.length}
            hasError={hasError}
            entryLabel={entryLabel}
            entriesLabel={entriesLabel}
            textAccentColor={knobProps.textAccentColor}
          />
        )}

        {/* Composer hides on error: commenting into a feed that failed to load
            would silently drop context */}
        {!hasError && renderComposer()}

        {/* Exactly one of: error → loading skeleton → empty → feed */}
        <AsyncBoundary
          compact
          error={error}
          onRetry={onRetry}
          errorTitle={loadFailedLabel}
          loading={
            showSkeleton ? (
              <TimelineSkeleton
                compact={compact}
                avatarPx={metrics.columnPx}
                loadingLabel={t('Loading')}
              />
            ) : (
              false
            )
          }
          empty={showEmpty ? emptyState : false}>
          <YStack paddingTop={canCompose ? '$2' : undefined}>
            <TimelineFeed
              items={feedItems}
              feedLabel={label ?? t('Activity feed')}
              renderEntry={renderEntry}
              onEntryClick={onEntryClick}
              renderReplyComposer={renderReplyComposer}
            />
          </YStack>
        </AsyncBoundary>
      </YStack>
    </TimelineViewContext.Provider>
  );
};

/**
 * Timeline: a mixed activity feed in the GitHub mold. Comment
 * entries render as conversation cards (avatar on a spine, display name,
 * relative time, body, Reply, one-level threaded replies); system events
 * (version/attachment/assignment/info) render as compact muted rows on the
 * same spine. Feed rows are ONE stacked group: outer corners only,
 * hairlines between items, hover/press inherit that geometry. An inline
 * composer sits at the top of the feed (Desk communications).
 * Fully data-agnostic -- accepts entries via props and emits callbacks.
 */
export const Timeline = ({
  headingLevel = 2,
  disabled = false,
  isLoading = false,
  error = null,
  enableAddComment = true,
  defaultCommentValue = '',
  compact = false,
  labels = NO_LABELS,
  ...rest
}: TimelineProps) => (
  <TimelineContent
    {...rest}
    headingLevel={headingLevel}
    disabled={disabled}
    isLoading={isLoading}
    error={error}
    enableAddComment={enableAddComment}
    defaultCommentValue={defaultCommentValue}
    compact={compact}
    labels={labels}
  />
);
