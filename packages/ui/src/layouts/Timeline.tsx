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
import React, { useCallback, useMemo, useState } from 'react';
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
  type YStackProps,
  getTokenValue,
  isWeb,
  styled,
} from 'tamagui';

import { Avatar } from '../Avatar';
import { componentColors, sectionHeading } from '../componentColors';
import { useDirection } from '../hooks/useDirection';
import { useTranslation } from '../shared/i18n';
import { bidiIsolate } from '../shared/t';
import { Skeleton } from '../Skeleton';

import { AsyncBoundary, resolveAsyncStatus } from './AsyncBoundary';

const ReplyPressTarget = styled(XStack, { name: 'ReplyPressTarget' });

/** Semantic label level → tamagui heading component (runtime `tag` is not honored). */
const TIMELINE_HEADING_TAGS = { 2: H2, 3: H3, 4: H4, 5: H5, 6: H6 } as const;

// ---------------------------------------------------------------------------
// Types  (generic -- no Frappe dependency)
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
 * Replaces FrappeComment / FrappeVersion with a framework-agnostic type.
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
  headingLevel?: 2 | 3 | 4 | 5 | 6;
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
  error?: boolean | string | Error | React.ReactNode | null;
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

function getEntryIcon(entry: TimelineEntry, size: number): React.ReactNode {
  switch (entry.type) {
    case 'comment':
      return <ChatCircleIcon size={size} />;
    case 'version':
      return <PencilSimpleIcon size={size} />;
    case 'attachment':
      return <PaperclipIcon size={size} />;
    case 'assignment':
      return <UserPlusIcon size={size} />;
    case 'info':
      return <FileTextIcon size={size} />;
    default:
      return <ClockIcon size={size} />;
  }
}

/**
 * Derive a human display name. Non-emails pass through untouched; emails get
 * their local part split on separators and title-cased ("john.doe@x" -> "John Doe").
 * A raw email is never returned as a display name.
 */
export function prettifyAuthorName(raw: string): string {
  const name = (raw ?? '').trim();
  if (!name) {
    return 'Unknown';
  }
  if (!name.includes('@')) {
    return name;
  }
  const local = name.split('@')[0];
  const words = local.split(/[._+\-\d]+/).filter(Boolean);
  if (words.length === 0) {
    return local || 'Unknown';
  }
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/** Display name for an entry: explicit authorName, else prettified author. */
export function getEntryDisplayName(entry: Pick<TimelineEntry, 'author' | 'authorName'>): string {
  return entry.authorName?.trim() || prettifyAuthorName(entry.author);
}

/**
 * Compact absolute timestamp ("Aug 9, 3:30 PM"; adds year when not current).
 * Canonical formatter lives in theme: one register for
 * Timeline, table date cells, and picker display values.
 */
function defaultFormatTimestamp(timestamp: string): string {
  return formatAbsoluteDateTime(timestamp);
}

// Relative register re-exported so existing consumers keep their import path.
export { formatRelativeTimestamp } from '@repo/theme';

/**
 * Group a flat entry list into one-level threads. Top-level order follows the
 * input order of the root entries; replies (including reply-to-reply, which
 * flattens under the thread root) sort oldest-first so threads read downward.
 * Orphaned parentIds (parent missing from the list) fall back to top-level.
 */
export function threadEntries(entries: TimelineEntry[]): TimelineThread[] {
  const byId = new Map(entries.map((e) => [e.id, e]));

  const rootOf = (entry: TimelineEntry): TimelineEntry => {
    let current = entry;
    const seen = new Set<string>([current.id]);
    while (current.parentId) {
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
}

/** Flat feed walk: roots, then one-level replies, then an open reply composer. */
type TimelineFeedItem =
  | { key: string; kind: 'entry'; entry: TimelineEntry; rootId: string; isReply: boolean }
  | { key: string; kind: 'reply-composer'; parent: TimelineEntry; rootId: string };

function flattenFeedItems(
  threads: TimelineThread[],
  entries: TimelineEntry[],
  replyTarget: { rootId: string; parentId: string } | null,
): TimelineFeedItem[] {
  const items: TimelineFeedItem[] = [];
  for (const thread of threads) {
    items.push({
      key: thread.entry.id,
      kind: 'entry',
      entry: thread.entry,
      rootId: thread.entry.id,
      isReply: false,
    });
    for (const reply of thread.replies) {
      items.push({
        key: reply.id,
        kind: 'entry',
        entry: reply,
        rootId: thread.entry.id,
        isReply: true,
      });
    }
    if (replyTarget && replyTarget.rootId === thread.entry.id) {
      items.push({
        key: `reply-composer-${thread.entry.id}`,
        kind: 'reply-composer',
        parent: entries.find((e) => e.id === replyTarget.parentId) ?? thread.entry,
        rootId: thread.entry.id,
      });
    }
  }
  return items;
}

/**
 * GitHub/Primer + Frappe Desk spine: a flat 1px scheme-aware connector through
 * the avatar/badge column. First/last items clip the line to the node center
 * so the rail does not run off the stacked group (Primer `clipSidebar`).
 */
function TimelineSpine({
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
}) {
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
}

function getEntryActionLabel(
  entry: TimelineEntry,
  labels: { madeChanges: string; addedAttachment: string; assigned: string },
): string | undefined {
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
}

/**
 * Skeleton twin of the comment rows: avatar block +
 * name/time line + body line mirror the live entry anatomy. The avatar
 * follows the radius knob like the live Avatar (no hardcoded circle).
 */
function TimelineSkeleton({
  compact = false,
  avatarPx,
  loadingLabel,
}: {
  compact?: boolean;
  avatarPx: number;
  loadingLabel: string;
}) {
  return (
    <YStack gap={compact ? '$3' : '$4'} width="100%" data-async-skeleton="timeline" aria-busy aria-label={loadingLabel}>
      {Array.from({ length: 3 }).map((_, i) => (
        <XStack key={i} gap={compact ? '$2' : '$3'} alignItems="flex-start">
          <Skeleton variant="rounded" width={avatarPx} height={avatarPx} />
          <YStack flex={1} gap="$1.5" paddingTop={2}>
            <Skeleton width="35%" height={compact ? 10 : 12} />
            <Skeleton width="80%" height={compact ? 12 : 14} />
          </YStack>
        </XStack>
      ))}
    </YStack>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Timeline: a mixed activity feed in the GitHub/Frappe Desk mold. Comment
 * entries render as conversation cards (avatar on a spine, display name,
 * relative time, body, Reply, one-level threaded replies); system events
 * (version/attachment/assignment/info) render as compact muted rows on the
 * same spine. Feed rows are ONE stacked group: outer corners only,
 * hairlines between items, hover/press inherit that geometry. An inline
 * composer sits at the top of the feed (Desk communications).
 * Fully data-agnostic -- accepts entries via props and emits callbacks.
 */
export function Timeline({
  entries,
  label,
  headingLevel = 2,
  disabled = false,
  isLoading = false,
  error = null,
  onRetry,
  enableAddComment = true,
  onCommentAdded,
  onCommentSubmit,
  onReply,
  onEntryClick,
  commentValue,
  defaultCommentValue = '',
  onCommentChange,
  renderEmpty,
  renderEntry,
  formatTimestamp,
  compact = false,
  labels = {},
  placeholder: placeholderProp,
  replyPlaceholder: replyPlaceholderProp,
  ...stackProps
}: TimelineProps) {
  const { t } = useTranslation();
  const { knobProps, control } = useResolvedKnobs();
  const LabelTag = TIMELINE_HEADING_TAGS[headingLevel];
  // Reply arrow bends back toward the quoted message — direction-of-travel,
  // so the glyph pair swaps under RTL (Axiom 15 / useDirection pattern).
  const ReplyIcon = useDirection() === 'rtl' ? ArrowBendUpRightIcon : ArrowBendUpLeftIcon;
  const placeholder = placeholderProp ?? t('Add a comment...');
  const replyPlaceholder = replyPlaceholderProp ?? t('Write a reply...');

  const [internalValue, setInternalValue] = useState(defaultCommentValue);
  const [composerFocused, setComposerFocused] = useState(false);
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [replyTarget, setReplyTarget] = useState<{ rootId: string; parentId: string } | null>(null);
  const [replyText, setReplyText] = useState('');

  const composerText = commentValue !== undefined ? commentValue : internalValue;

  const {
    noActivity: noActivityLabel = t('No activity yet'),
    addComment: addCommentLabel = t('Add Comment'),
    cancel: cancelLabel = t('Cancel'),
    comment: commentLabel = t('Comment'),
    sending: sendingLabel = t('Sending...'),
    reply: replyLabel = t('Reply'),
    madeChanges: madeChangesLabel = t('made changes'),
    addedAttachment: addedAttachmentLabel = t('added an attachment'),
    assigned: assignedLabel = t('assigned'),
    entry: entryLabel = t('entry'),
    entries: entriesLabel = t('entries'),
    loadFailed: loadFailedLabel = t("Couldn't load activity"),
  } = labels;

  // Error wins: a failed feed must never look like "no activity".
  const hasError = resolveAsyncStatus({ error }) === 'error';
  const showSkeleton = !hasError && isLoading && entries.length === 0;

  const threads = useMemo(() => threadEntries(entries), [entries]);
  const feedItems = useMemo(() => flattenFeedItems(threads, entries, replyTarget), [threads, entries, replyTarget]);

  const submitComment = useCallback(
    (content: string, parentId?: string) => {
      if (onCommentSubmit) {
        onCommentSubmit(content, parentId ? { parentId } : undefined);
      } else {
        onCommentAdded?.(content);
      }
    },
    [onCommentSubmit, onCommentAdded],
  );

  const canCompose = enableAddComment && !disabled && !!(onCommentSubmit || onCommentAdded);
  const showReplyAction = !disabled && (!!onReply || canCompose);

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
    if (!content || isAddingComment) {
      return;
    }
    setIsAddingComment(true);
    try {
      submitComment(content);
      setComposerText('');
      setComposerFocused(false);
    } finally {
      setIsAddingComment(false);
    }
  }, [composerText, isAddingComment, submitComment, setComposerText]);

  const handleSubmitReply = useCallback(() => {
    const content = replyText.trim();
    if (!content || !replyTarget) {
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

  const sz = knobProps.sizeToken;
  const radiusToken = knobProps.borderRadius.borderRadius;
  const mutedColor = knobProps.textAccentColor === '$color' ? '$color12' : knobProps.textAccentColor;
  const bodyFontSize = compact ? '$2' : sz === '$3' ? '$2' : sz === '$5' ? '$4' : '$3';
  const nameFontSize = compact ? '$2' : sz === '$3' ? '$2' : sz === '$5' ? '$4' : '$3';
  const metaFontSize = compact ? '$1' : '$2';
  const systemFontSize = compact ? '$1' : '$2';
  const avatarSize = compact ? '$1.5' : sz === '$5' ? '$3' : '$2';
  const replyAvatarSize = compact ? '$1' : '$1.5';
  // Twin of the live avatar/badge column — spine centers on this well.
  const columnPx = compact ? 20 : sz === '$5' ? 34 : 24;
  const rowPad = compact ? 8 : sz === '$5' ? 16 : 12;
  // The comment card is a padded content container, so it caps
  // at its own padding, not at the panelPadding knob it does not use.
  const commentPad = compact ? '$2' : '$3';
  const commentPadPx = getTokenValue(commentPad as Parameters<typeof getTokenValue>[0], 'space');
  const commentStop = radiusStopFromToken(radiusToken);
  const commentRadius =
    commentStop && typeof commentPadPx === 'number'
      ? resolveRadiusClass('CONTAINER-CAP', commentStop, { paddingPx: commentPadPx })
      : radiusToken;

  const emptyIconSize = compact ? (sz === '$3' ? 20 : sz === '$5' ? 28 : 24) : sz === '$3' ? 32 : sz === '$5' ? 48 : 40;

  const emptyState = renderEmpty ? (
    renderEmpty()
  ) : (
    <YStack {...(compact ? { padding: '$3' } : knobProps.panelPadding)} alignItems="center" gap="$2" opacity={0.5}>
      <ClockIcon size={emptyIconSize} />
      <Text color={knobProps.textAccentColor} fontSize={compact ? '$2' : sz}>
        {noActivityLabel}
      </Text>
    </YStack>
  );

  // Timestamp register: the content class picks the register.
  // Social/comment rows default to the relative form ("2h ago"); system
  // events follow the house `timestampStyle` knob (compact absolute by
  // default; a house flip to "relative" re-registers events too). A consumer
  // `formatTimestamp` is the eject for every class.
  const formatVisibleTimestamp = (entry: TimelineEntry) => {
    if (formatTimestamp) {
      return formatTimestamp(entry.timestamp);
    }
    if (entry.type === 'comment' || knobProps.timestampStyle === 'relative') {
      return formatRelativeTimestamp(entry.timestamp);
    }
    return defaultFormatTimestamp(entry.timestamp);
  };

  const renderTimestamp = (entry: TimelineEntry, fontSize: string) => (
    <Text
      fontSize={fontSize}
      color={mutedColor}
      // Absolute compact timestamp in the tooltip + accessible name
      {...({ title: defaultFormatTimestamp(entry.timestamp) } as Record<string, unknown>)}
      aria-label={defaultFormatTimestamp(entry.timestamp)}>
      {formatVisibleTimestamp(entry)}
    </Text>
  );

  // R-IDENTITY: the avatar slot inside a feed row is a
  // declared identity shape — a recognized object, not a styled box — so it
  // keeps its circle at every radius value including `none`. This reverses
  // the earlier `circular` eject, which read Avatar as R-SCALE back when the
  // spec table still classed it that way; the table was the wrong half.
  const renderAvatar = (entry: TimelineEntry, size: string) => (
    <Avatar size={size as any} name={getEntryDisplayName(entry)} fallbackBackgroundColor="$accentBackground" />
  );

  const renderVersionChanges = (changes: VersionChange[]) => (
    <YStack gap="$1" marginTop="$1">
      {changes.slice(0, 5).map((change) => (
        <XStack key={change.field} gap="$2" flexWrap="wrap">
          <Text fontSize="$1" color={knobProps.textAccentColor} fontWeight="400">
            {change.fieldLabel || change.field}:
          </Text>
          {change.old !== undefined && (
            <Text fontSize="$1" color={componentColors.semantic.error} textDecorationLine="line-through">
              {String(change.old || '(empty)')}
            </Text>
          )}
          {change.old !== undefined && change.new !== undefined && (
            <Text fontSize="$1" color={knobProps.textAccentColor}>
              →
            </Text>
          )}
          {change.new !== undefined && (
            <Text fontSize="$1" color={componentColors.semantic.success}>
              {String(change.new || '(empty)')}
            </Text>
          )}
        </XStack>
      ))}
      {changes.length > 5 && (
        <Text fontSize="$1" color={knobProps.textAccentColor} fontStyle="italic">
          +{changes.length - 5} more changes
        </Text>
      )}
    </YStack>
  );

  const renderComposerBox = ({
    value,
    onChange,
    onSubmit,
    onCancel,
    placeholder: composerPlaceholder,
    autoFocus,
    expanded,
    onFocus,
    onBlur,
    ariaLabel,
    avatar,
  }: {
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
  }) => (
    <XStack {...knobProps.gap} alignItems="flex-start">
      {avatar}
      <YStack flex={1} gap="$2">
        <TextArea
          value={value}
          onChangeText={onChange}
          placeholder={composerPlaceholder}
          aria-label={ariaLabel}
          size={compact ? '$2' : '$3'}
          minHeight={expanded ? (compact ? 60 : 80) : compact ? 32 : 40}
          backgroundColor={knobProps.inputBackground}
          {...{ borderRadius: radiusToken }}
          autoFocus={autoFocus}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={
            ((e: React.KeyboardEvent) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              } else if (e.key === 'Escape') {
                onCancel();
              }
            }) as unknown as () => void
          }
        />
        {expanded && (
          <XStack {...knobProps.gap} justifyContent="flex-end">
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

  const renderComposer = () => {
    if (!canCompose) {
      return null;
    }
    const expanded = composerFocused || composerText.trim().length > 0;
    return renderComposerBox({
      value: composerText,
      onChange: setComposerText,
      onSubmit: handleAddComment,
      onCancel: () => {
        setComposerText('');
        setComposerFocused(false);
      },
      placeholder,
      expanded,
      onFocus: () => {
        setComposerFocused(true);
      },
      onBlur: () => {
        if (!composerText.trim()) {
          setComposerFocused(false);
        }
      },
      ariaLabel: addCommentLabel,
      avatar: (
        <Avatar size={avatarSize} backgroundColor={componentColors.interactive.hover}>
          <Avatar.Fallback
            backgroundColor={componentColors.interactive.hover}
            alignItems="center"
            justifyContent="center">
            <UserIcon size={compact ? 12 : 14} />
          </Avatar.Fallback>
        </Avatar>
      ),
    });
  };

  const renderReplyComposer = (parentEntry: TimelineEntry) =>
    renderComposerBox({
      value: replyText,
      onChange: setReplyText,
      onSubmit: handleSubmitReply,
      onCancel: () => {
        setReplyText('');
        setReplyTarget(null);
      },
      placeholder: replyPlaceholder,
      autoFocus: true,
      expanded: true,
      ariaLabel: `${replyLabel} ${getEntryDisplayName(parentEntry)}`,
      avatar: (
        <Avatar size={replyAvatarSize} backgroundColor={componentColors.interactive.hover}>
          <Avatar.Fallback
            backgroundColor={componentColors.interactive.hover}
            alignItems="center"
            justifyContent="center">
            <UserIcon size={compact ? 10 : 12} />
          </Avatar.Fallback>
        </Avatar>
      ),
    });

  /** Conversation entry: avatar on the spine + GitHub/Desk comment card. */
  const renderCommentEntry = (entry: TimelineEntry, rootId: string, isReply: boolean) => {
    const displayName = getEntryDisplayName(entry);
    return (
      <XStack
        role="article"
        aria-label={`${displayName}, ${formatVisibleTimestamp(entry)}`}
        gap={compact ? '$2' : '$3'}
        alignItems="flex-start">
        <YStack width={columnPx} minHeight={columnPx} alignItems="center" justifyContent="flex-start" zIndex={1}>
          {renderAvatar(entry, isReply ? replyAvatarSize : avatarSize)}
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
          <XStack gap="$2" alignItems="center" flexWrap="wrap">
            <Text fontSize={nameFontSize} fontWeight="400" color={componentColors.text.primary}>
              {displayName}
            </Text>
            {renderTimestamp(entry, metaFontSize)}
          </XStack>
          {entry.content && (
            <Text
              {...knobProps.body}
              fontSize={bodyFontSize}
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
                  (e as unknown as { stopPropagation?: () => void }).stopPropagation?.();
                  handleReplyPress(entry, rootId);
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
  const renderSystemEntry = (entry: TimelineEntry) => {
    const displayName = getEntryDisplayName(entry);
    const actionLabel = getEntryActionLabel(entry, {
      madeChanges: madeChangesLabel,
      addedAttachment: addedAttachmentLabel,
      assigned: assignedLabel,
    });
    const iconSize = compact ? 12 : 14;
    return (
      <XStack
        role="article"
        aria-label={`${displayName} ${actionLabel ?? entry.content ?? ''}`.trim()}
        gap={compact ? '$2' : '$3'}
        alignItems="flex-start">
        <YStack
          width={columnPx}
          height={columnPx}
          alignItems="center"
          justifyContent="center"
          zIndex={1}
          backgroundColor={componentColors.surface.background}
          {...knobProps.borderRadius}>
          {getEntryIcon(entry, iconSize)}
        </YStack>
        <YStack flex={1} gap="$0.5" paddingTop={2} minWidth={0}>
          <XStack gap="$1.5" alignItems="center" flexWrap="wrap">
            <Text fontSize={systemFontSize} fontWeight="400" color={mutedColor}>
              {displayName}
            </Text>
            {actionLabel && (
              <Text fontSize={systemFontSize} color={mutedColor}>
                {actionLabel}
              </Text>
            )}
            {entry.content && entry.type !== 'info' && (
              <Text fontSize={systemFontSize} color={mutedColor}>
                {entry.content}
              </Text>
            )}
            <Text fontSize={systemFontSize} color={mutedColor} opacity={0.75}>
              ·
            </Text>
            {renderTimestamp(entry, systemFontSize)}
          </XStack>
          {entry.content && entry.type === 'info' && (
            <Text fontSize={systemFontSize} color={mutedColor} fontStyle="italic">
              {entry.content}
            </Text>
          )}
          {entry.type === 'version' && entry.changes && entry.changes.length > 0 && renderVersionChanges(entry.changes)}
        </YStack>
      </XStack>
    );
  };

  const renderEntryNode = (entry: TimelineEntry, rootId: string, isReply: boolean) => {
    const defaultContent =
      entry.type === 'comment' ? renderCommentEntry(entry, rootId, isReply) : renderSystemEntry(entry);
    if (renderEntry) {
      return renderEntry(entry, defaultContent);
    }
    return defaultContent;
  };

  const renderStackedRow = (
    key: string,
    children: React.ReactNode,
    index: number,
    count: number,
    entry?: TimelineEntry,
  ) => {
    const position = getGroupPosition(index, count);
    const corners = stackRadiusProps(position, radiusToken);
    const clickable = !!(entry && onEntryClick);
    return (
      <YStack
        key={key}
        position="relative"
        overflow="hidden"
        {...corners}
        padding={rowPad}
        borderBottomWidth={position === 'last' || position === 'only' ? 0 : 1}
        borderBottomColor={componentColors.divider}
        backgroundColor="transparent"
        hoverStyle={{ ...control.hoverKnobProps, ...corners }}
        pressStyle={clickable ? { ...control.pressKnobProps, ...corners } : undefined}
        onPress={
          clickable && entry
            ? () => {
                onEntryClick?.(entry);
              }
            : undefined
        }
        cursor={clickable ? 'pointer' : 'default'}
        outlineWidth={0}
        focusStyle={{ outlineWidth: 0 }}
        focusVisibleStyle={clickable ? ensureFocusVisibleRing({ outlineOffset: -2 }) : undefined}
        {...{ 'data-group-position': position }}>
        <TimelineSpine
          show={count > 1}
          clipStart={position === 'first'}
          clipEnd={position === 'last'}
          columnPx={columnPx}
          insetStart={rowPad}
        />
        {children}
      </YStack>
    );
  };

  return (
    <YStack {...knobProps.gap} {...stackProps}>
      {label && (
        <XStack alignItems="center" justifyContent="space-between">
          {/* Semantic tag follows headingLevel (default h2); the explicit
              size spreads pin the visual scale at every level. */}
          <LabelTag {...(compact ? { fontSize: '$4', fontWeight: '600' } : sectionHeading)}>{label}</LabelTag>
          {/* Entry count hides on error so the badge can't lie.
              Bidi-isolated so RTL contexts keep "7 entries" in one run. */}
          {entries.length > 0 && !hasError && (
            <Text fontSize="$2" color={knobProps.textAccentColor}>
              {bidiIsolate(`${entries.length} ${entries.length === 1 ? entryLabel : entriesLabel}`)}
            </Text>
          )}
        </XStack>
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
          showSkeleton ? <TimelineSkeleton compact={compact} avatarPx={columnPx} loadingLabel={t('Loading')} /> : false
        }
        empty={!hasError && entries.length === 0 ? emptyState : false}>
        <YStack paddingTop={canCompose ? '$2' : undefined}>
          <YStack role="feed" aria-label={label ?? t('Activity feed')}>
            {feedItems.map((item, index) =>
              item.kind === 'entry'
                ? renderStackedRow(
                    item.key,
                    renderEntryNode(item.entry, item.rootId, item.isReply),
                    index,
                    feedItems.length,
                    item.entry,
                  )
                : renderStackedRow(item.key, renderReplyComposer(item.parent), index, feedItems.length),
            )}
          </YStack>
        </YStack>
      </AsyncBoundary>
    </YStack>
  );
}
