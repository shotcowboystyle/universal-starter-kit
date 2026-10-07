// Contract: activity feed under the form — new-comment box, comments,
// versions/edits, communications, assignment/attachment/like logs (desk
// parity). Self-contained: fetches docinfo via shared/useDocinfo. Keep
// props stable — form-core imports this.
//
// Composition: the generic Timeline from @repo/ui
// supplies the composer + feed shell; every entry renders through a
// renderEntry override for desk parity (own-comment edit/delete, version
// "changed value of…" gray rows, communication blocks, one-line logs).
//
// Comments are OPTIMISTIC: they render from a live Comment collection (the
// sync engine's in-memory store) and write through engine mutations that
// keep the probed desk RPCs as transport (see frappe-ui's
// useFrappeCommentActions for the parity ruling):
//   frappe.desk.form.utils.add_comment    { reference_doctype,
//     reference_name, content, comment_email, comment_by } (all required)
//   frappe.desk.form.utils.update_comment { name, content }
//   frappe.client.delete                  { doctype: "Comment", name }
// A new comment paints immediately under a local: identity, remaps to the
// server name on ack, and rolls back with a SyncErrorNotice on rejection.
// Non-comment feed kinds (versions, communications, logs) still come from
// docinfo. Without a FrappeProvider config (plain docInfo-prop stories)
// the legacy blocking RPC path is kept.
import {
  Avatar,
  Button,
  H4,
  Spinner,
  Tabs,
  Text,
  Timeline,
  XStack,
  YStack,
  notify,
} from '@repo/ui';
import type { TabsItem, TimelineEntry } from '@repo/ui';
import { TextArea } from '@repo/forms';
import {
  runOptimisticRpc,
  useFrappeCollection,
  useFrappePendingMutations,
  useLiveQuery,
} from '@repo/frappe';
import { SyncErrorNotice, useFrappeCommentActions, useFrappeConfig } from '@repo/frappe-ui';
import type { FrappeComment } from '@repo/frappe-ui';
import { formatAbsoluteDateTime, useResolvedKnobs } from '@repo/theme';
import {
  EnvelopeSimpleIcon,
  HeartIcon,
  InfoIcon,
  PaperclipIcon,
  PencilSimpleIcon,
  RobotIcon,
  TrashIcon,
  UserPlusIcon,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import {
  addDocinfoOverlay,
  invalidateDocinfo,
  patchDocinfoBase,
  removeDocinfoOverlay,
  useDocinfo,
} from '../shared/useDocinfo';
import type { DocInfo, DocInfoComment } from '../shared/useDocinfo';
import { useFrappeApp } from '../shared/useFrappeApp';

import { buildTimelineFeed, filterTimelineFeed, versionSummary } from './timeline-entries';
import type { TimelineDocinfoLike, TimelineFeedEntry, TimelineFilterValue } from './timeline-entries';
import { formatRelativeTime, htmlToText, textToCommentHtml, truncateText, useSessionUser } from './timeline-utils';

/** Feed entries shown before the "Load older" collapse kicks in. */
const PAGE_SIZE = 20;

export interface FormTimelineProps {
  doctype: string;
  name: string;
  /**
   * Prefetched docinfo from the composing form screen (or a story fixture).
   * When the composer owns docinfo (this or `refreshDocInfo` is provided)
   * the timeline renders it and skips its own fetch.
   */
  docInfo?: TimelineDocinfoLike;
  /** Composer-owned docinfo refresh, called after comment mutations. */
  refreshDocInfo?: () => void;
  /** Session user when already known (skips the get_logged_user lookup). */
  currentUser?: string;
  /** Frappe connection; `baseURL` resolves relative avatar image paths. */
  connection?: { baseURL?: string };
}

interface EditingState {
  /** Comment docname being edited */
  docname: string;
  text: string;
}

export function FormTimeline({ doctype, name, docInfo, refreshDocInfo, currentUser, connection }: FormTimelineProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const app = useFrappeApp();
  const config = useFrappeConfig();
  const { knobProps } = useResolvedKnobs();
  const iconSize = Number(knobProps.controlIcon?.width) || 14;
  const radiusToken = knobProps.borderRadius.borderRadius;

  // Composed mode: the form screen (or story fixture) owns docinfo. The
  // timeline stays self-contained otherwise via shared/useDocinfo.
  const composed = docInfo !== undefined || refreshDocInfo !== undefined;
  const {
    docinfo: fetched,
    loading,
    error,
    reload,
  } = useDocinfo(composed ? undefined : doctype, composed ? undefined : name);
  const docinfo: TimelineDocinfoLike | undefined = docInfo ?? fetched;
  const fetchedSessionUser = useSessionUser(!currentUser);
  const sessionUser = currentUser ?? fetchedSessionUser;

  const [filter, setFilter] = useState<TimelineFilterValue>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [busyDocname, setBusyDocname] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | undefined>();

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setEditing(null);
    setConfirmingDelete(null);
    setActionError(undefined);
  }, [doctype, name]);

  const refresh = useCallback(() => {
    // Keep the shared docinfo cache honest for sibling panels, then refresh
    // whichever pipeline owns this timeline's data.
    invalidateDocinfo(doctype, name);
    if (refreshDocInfo) {
      refreshDocInfo();
    } else {
      reload();
    }
  }, [doctype, name, refreshDocInfo, reload]);

  const reportActionError = useCallback((err: unknown, fallback: string) => {
    const message = err instanceof Error && err.message ? String(err.message) : '';
    const readable = htmlToText(message);
    setActionError(readable ? truncateText(readable, 200) : fallback);
  }, []);

  // ── live comment collection (optimistic read path) ───────────────────────

  // Forward the full connection config (see frappe-ui Timeline: the shared
  // SyncModule is keyed by baseURL and the first consumer's options win).
  const connectionConfig = useMemo(
    () =>
      config
        ? {
            baseURL: config.baseURL,
            socketPort: config.socketPort,
            siteName: config.siteName,
            socketBaseURL: config.socketBaseURL,
            auth: config.auth,
            syncOptions: config.syncOptions,
            socketOptions: config.socketOptions,
            fixtures: config.fixtures,
          }
        : undefined,
    [config],
  );

  const commentFilters = useMemo<[string, string, unknown][]>(
    () => [
      ['reference_doctype', '=', doctype],
      ['reference_name', '=', name],
    ],
    [doctype, name],
  );

  const commentCollection = useFrappeCollection<FrappeComment>(connectionConfig, 'Comment', {
    filters: commentFilters,
    fields: [
      'name',
      'comment_type',
      'content',
      'comment_by',
      'comment_email',
      'reference_doctype',
      'reference_name',
      'creation',
      'modified',
      'owner',
    ],
  });

  const { data: liveCommentsData } = useLiveQuery(
    (q) => (commentCollection ? q.from({ _list: commentCollection }) : null),
    [commentCollection],
  );

  const commentActions = useFrappeCommentActions(connectionConfig, doctype, name);
  // Rejected engine writes surface here (rollback already ran) — rendered
  // as SyncErrorNotice rows with retry/dismiss.
  const commentLedger = useFrappePendingMutations(connectionConfig, 'Comment');

  // Comments render from the live collection once it is ready (stale
  // docinfo comments otherwise — never blank while the first sync runs).
  // Other feed kinds (versions, communications, logs) still come from
  // docinfo: the Comment doctype also stores those log rows under other
  // comment_types, so only comment_type === "Comment" rows are replaced.
  const effectiveDocinfo = useMemo<TimelineDocinfoLike | undefined>(() => {
    if (!docinfo || !commentCollection) {
      return docinfo;
    }
    if ((commentCollection as { status?: string }).status !== 'ready') {
      return docinfo;
    }
    const rows = ((liveCommentsData as FrappeComment[] | undefined) ?? [])
      .filter((row) => (row.comment_type ?? 'Comment') === 'Comment')
      .map((row) => ({
        name: row.name,
        creation: row.creation,
        content: row.content,
        owner: row.owner,
        comment_type: row.comment_type ?? 'Comment',
        comment_email: row.comment_email,
        comment_by: row.comment_by,
      }));
    return { ...docinfo, comments: rows };
  }, [docinfo, commentCollection, liveCommentsData]);

  const baseURL = connection?.baseURL ?? config?.baseURL;
  const entries = useMemo(
    () => buildTimelineFeed(effectiveDocinfo, { userInfo: docinfo?.user_info, baseURL }),
    [effectiveDocinfo, docinfo, baseURL],
  );
  const filtered = useMemo(() => filterTimelineFeed(entries, filter), [entries, filter]);
  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hiddenCount = Math.max(0, filtered.length - visible.length);

  const handleFilterChange = useCallback((value: string) => {
    setFilter(value as TimelineFilterValue);
    setVisibleCount(PAGE_SIZE);
  }, []);

  // ── mutations ────────────────────────────────────────────────────────────

  // Composed/fixture mode keeps the composer visible; without an app the
  // handlers no-op (stories demo the UI, mutations need a bench).
  const canComment = Boolean(sessionUser && (app || composed));
  // Engine mode: writes go through sync-engine mutations (optimistic paint,
  // rollback + ledger on rejection). Falls back to the legacy blocking RPCs
  // only when there is no FrappeProvider config (docInfo-prop stories).
  const engineMode = Boolean(connectionConfig && commentCollection);

  const handleAddComment = useCallback(
    (content: string) => {
      const text = content.trim();
      if (!sessionUser || !text || !(engineMode || app)) {
        return;
      }
      const rawFullname = docinfo?.user_info?.[sessionUser]?.fullname;
      const fullname = typeof rawFullname === 'string' && rawFullname ? rawFullname : sessionUser;
      setActionError(undefined);
      if (engineMode) {
        // Optimistic: the row is already painted from the store; the ack
        // (or rollback + SyncErrorNotice) happens in the background. The
        // docinfo refresh keeps sibling panels honest without gating paint.
        commentActions
          .addComment({ content: textToCommentHtml(text), email: sessionUser, fullname })
          .then(() => {
            refresh();
          })
          .catch(() => {});
        return;
      }
      if (!app) {
        return;
      }
      const html = textToCommentHtml(text);
      // Fallback (no live collection): the ONE pattern docinfo arm —
      // local overlay apply → pending render → reconcile the ack into
      // the base → rollback + visible error on failure.
      const creation = new Date().toISOString().slice(0, 19).replace('T', ' ');
      let overlayId: string | undefined;
      runOptimisticRpc<{ payload?: { message?: DocInfoComment } }>({
        apply: (ctx) => {
          overlayId = addDocinfoOverlay(doctype, name, (info: DocInfo) => ({
            ...info,
            comments: [
              ...(info.comments ?? []),
              {
                name: ctx.tempId,
                comment_type: 'Comment',
                content: html,
                owner: sessionUser,
                comment_email: sessionUser,
                comment_by: fullname,
                creation,
                __optimistic: true,
              },
            ],
          }));
          return () => {
            if (overlayId) {
              removeDocinfoOverlay(overlayId);
            }
          };
        },
        send: async () =>
          await app.call().post<{ message?: DocInfoComment }>('frappe.desk.form.utils.add_comment', {
            reference_doctype: doctype,
            reference_name: name,
            content: html,
            comment_email: sessionUser,
            comment_by: fullname,
          }),
        reconcile: (ack) => {
          const acked = ack?.payload?.message;
          if (acked && typeof acked.name === 'string' && acked.name) {
            patchDocinfoBase(doctype, name, (info: DocInfo) => ({
              ...info,
              comments: [...(info.comments ?? []).filter((comment) => comment.name !== acked.name), acked],
            }));
          } else {
            refresh();
          }
          if (overlayId) {
            removeDocinfoOverlay(overlayId);
          }
        },
        onError: (err) => {
          const body = t('timeline.addFailed', 'Could not add comment');
          reportActionError(err, body);
          notify({ severity: 'error', scope: 'page', body });
        },
      }).catch(() => {
        // Rollback + error surfaces already ran in onError.
      });
    },
    [app, engineMode, commentActions, sessionUser, docinfo, doctype, name, refresh, reportActionError, t],
  );

  const handleSaveEdit = useCallback(() => {
    if (!editing) {
      return;
    }
    const text = editing.text.trim();
    if (!text || !(engineMode || app)) {
      setEditing(null);
      return;
    }
    const target = editing.docname;
    setActionError(undefined);
    if (engineMode) {
      // Optimistic: close the editor immediately — the store already shows
      // the new content; rejection rolls back and lands in the ledger.
      setEditing(null);
      commentActions
        .updateComment(target, textToCommentHtml(text))
        .then(() => {
          refresh();
        })
        .catch(() => {});
      return;
    }
    if (!app) {
      return;
    }
    setBusyDocname(target);
    app
      .call()
      .post('frappe.desk.form.utils.update_comment', {
        name: target,
        content: textToCommentHtml(text),
      })
      .then(() => {
        setEditing(null);
        refresh();
      })
      .catch((error: unknown) => {
        reportActionError(error, t('timeline.updateFailed', 'Could not update comment'));
      })
      .finally(() => {
        setBusyDocname(null);
      });
  }, [app, engineMode, commentActions, editing, refresh, reportActionError, t]);

  const handleDeleteComment = useCallback(
    (docname: string) => {
      if (!(engineMode || app)) {
        setConfirmingDelete(null);
        return;
      }
      setActionError(undefined);
      if (engineMode) {
        // Optimistic: the row is evicted from the store immediately.
        setConfirmingDelete(null);
        commentActions
          .deleteComment(docname)
          .then(() => {
            refresh();
          })
          .catch(() => {});
        return;
      }
      if (!app) {
        return;
      }
      setBusyDocname(docname);
      app
        .call()
        .post('frappe.client.delete', { doctype: 'Comment', name: docname })
        .then(() => {
          refresh();
        })
        .catch((error: unknown) => {
          reportActionError(error, t('timeline.deleteFailed', 'Could not delete comment'));
        })
        .finally(() => {
          setBusyDocname(null);
          setConfirmingDelete(null);
        });
    },
    [app, engineMode, commentActions, refresh, reportActionError, t],
  );

  // ── entry renderers (desk parity) ────────────────────────────────────────

  const renderTimestamp = (entry: TimelineFeedEntry, fontSize = '$2') => {
    const absolute = formatAbsoluteDateTime(entry.timestamp);
    return (
      <Text
        fontSize={fontSize}
        color="$color10"
        {...({ title: absolute } as Record<string, unknown>)}
        aria-label={absolute}>
        {formatRelativeTime(entry.timestamp)}
      </Text>
    );
  };

  const displayNameOf = (entry: TimelineFeedEntry) => entry.authorName?.trim() ?? entry.author;

  const renderCommentRow = (entry: TimelineFeedEntry) => {
    const displayName = displayNameOf(entry);
    // Pending rows (optimistic, awaiting ack) render visible but distinct
    // (Axiom 6 HONEST STATE): dimmed, "Sending…" in the timestamp slot, and
    // edit/delete withheld until the identity is the server's. Two marks:
    // `__optimistic` overlay rows (`entry.pending`) and engine `local:` ids.
    const pending = entry.pending === true || entry.docname.startsWith('local:');
    const own = Boolean(sessionUser && entry.ownerId === sessionUser) && !pending;
    const isEditing = editing?.docname === entry.docname;
    const isConfirming = confirmingDelete === entry.docname;
    const isBusy = busyDocname === entry.docname;
    return (
      <XStack
        role="article"
        aria-label={
          pending
            ? `${displayName}, ${t('timeline.sending', 'Sending…')}`
            : `${displayName}, ${formatRelativeTime(entry.timestamp)}`
        }
        aria-busy={pending || undefined}
        opacity={pending ? 0.6 : 1}
        gap="$3"
        alignItems="flex-start">
        <Avatar
          circular={false}
          borderRadius={radiusToken}
          size="$2"
          name={displayName}
          src={entry.image}
          fallbackBackgroundColor="$accentBackground"
        />
        <YStack
          flex={1}
          gap="$1">
          <XStack
            gap="$2"
            alignItems="center">
            <XStack
              flex={1}
              gap="$2"
              alignItems="center"
              flexWrap="wrap">
              <Text
                fontSize="$3"
                fontWeight="400">
                {displayName}
              </Text>
              {pending ? (
                <Text
                  fontSize="$2"
                  color="$color10"
                  fontStyle="italic">
                  {t('timeline.sending', 'Sending…')}
                </Text>
              ) : (
                renderTimestamp(entry)
              )}
            </XStack>
            {own && !isEditing && !isConfirming && (
              <XStack gap="$1">
                <Button
                  chromeless
                  size="$1"
                  borderRadius={radiusToken}
                  icon={<PencilSimpleIcon size={iconSize} />}
                  aria-label={t('timeline.editComment', 'Edit comment')}
                  disabled={isBusy}
                  onPress={() => {
                    setConfirmingDelete(null);
                    setEditing({
                      docname: entry.docname,
                      text: htmlToText(entry.html ?? entry.content ?? ''),
                    });
                  }}
                />
                <Button
                  chromeless
                  size="$1"
                  borderRadius={radiusToken}
                  icon={<TrashIcon size={iconSize} />}
                  aria-label={t('timeline.deleteComment', 'Delete comment')}
                  disabled={isBusy}
                  onPress={() => {
                    setEditing(null);
                    setConfirmingDelete(entry.docname);
                  }}
                />
              </XStack>
            )}
          </XStack>
          {isEditing ? (
            <YStack gap="$2">
              <TextArea
                value={editing?.text ?? ''}
                onChangeText={(text) => {
                  setEditing((prev) => (prev ? { ...prev, text } : prev));
                }}
                size="$3"
                minRows={2}
                textAreaProps={{
                  'aria-label': t('timeline.editComment', 'Edit comment'),
                  autoFocus: true,
                }}
              />
              <XStack
                gap="$2"
                justifyContent="flex-end">
                <Button
                  size="$2"
                  variant="outlined"
                  borderRadius={radiusToken}
                  disabled={isBusy}
                  onPress={() => {
                    setEditing(null);
                  }}>
                  {t('timeline.cancel', 'Cancel')}
                </Button>
                <Button
                  size="$2"
                  borderRadius={radiusToken}
                  disabled={!(editing?.text ?? '').trim() || isBusy}
                  icon={isBusy ? <Spinner size="small" /> : undefined}
                  onPress={handleSaveEdit}>
                  {t('timeline.save', 'Save')}
                </Button>
              </XStack>
            </YStack>
          ) : entry.content ? (
            <Text
              fontSize="$3"
              whiteSpace="pre-wrap">
              {entry.content}
            </Text>
          ) : null}
          {isConfirming && !isEditing && (
            <XStack
              gap="$2"
              alignItems="center"
              flexWrap="wrap">
              <Text
                fontSize="$2"
                color="$color10">
                {t('timeline.deleteConfirm', 'Delete this comment?')}
              </Text>
              <Button
                size="$2"
                theme="error"
                borderRadius={radiusToken}
                disabled={isBusy}
                icon={isBusy ? <Spinner size="small" /> : undefined}
                onPress={() => {
                  handleDeleteComment(entry.docname);
                }}>
                {t('timeline.delete', 'Delete')}
              </Button>
              <Button
                chromeless
                size="$2"
                borderRadius={radiusToken}
                disabled={isBusy}
                onPress={() => {
                  setConfirmingDelete(null);
                }}>
                {t('timeline.cancel', 'Cancel')}
              </Button>
            </XStack>
          )}
        </YStack>
      </XStack>
    );
  };

  const renderSystemRow = (entry: TimelineFeedEntry, icon: ReactNode, text: string) => {
    const displayName = displayNameOf(entry);
    return (
      <XStack
        role="article"
        aria-label={`${displayName} ${text}`.trim()}
        gap="$3"
        alignItems="flex-start">
        <YStack
          width="$1.5"
          height="$1.5"
          alignItems="center"
          justifyContent="center"
          opacity={0.6}>
          {icon}
        </YStack>
        <XStack
          flex={1}
          gap="$1.5"
          alignItems="center"
          flexWrap="wrap"
          paddingTop={2}>
          <Text
            fontSize="$2"
            fontWeight="400"
            color="$color10">
            {displayName}
          </Text>
          {text ? (
            <Text
              fontSize="$2"
              color="$color10">
              {text}
            </Text>
          ) : null}
          <Text
            fontSize="$2"
            color="$color10"
            opacity={0.75}>
            ·
          </Text>
          {renderTimestamp(entry)}
        </XStack>
      </XStack>
    );
  };

  const renderCommunicationRow = (entry: TimelineFeedEntry) => {
    const displayName = displayNameOf(entry);
    const icon = entry.kind === 'automated' ? <RobotIcon size={iconSize} /> : <EnvelopeSimpleIcon size={iconSize} />;
    return (
      <XStack
        role="article"
        aria-label={`${displayName}, ${entry.subject ?? ''}`.trim()}
        gap="$3"
        alignItems="flex-start">
        <YStack
          width="$1.5"
          height="$1.5"
          alignItems="center"
          justifyContent="center"
          opacity={0.6}>
          {icon}
        </YStack>
        <YStack
          flex={1}
          gap="$1"
          borderWidth={1}
          borderColor="$borderColor"
          borderRadius={radiusToken}
          padding="$3">
          <XStack
            gap="$2"
            alignItems="center"
            flexWrap="wrap">
            <Text
              fontSize="$3"
              fontWeight="400">
              {displayName}
            </Text>
            {entry.author !== displayName && (
              <Text
                fontSize="$2"
                color="$color10">
                {entry.author}
              </Text>
            )}
            {renderTimestamp(entry)}
          </XStack>
          {entry.subject ? (
            <Text
              fontSize="$3"
              fontWeight="400">
              {entry.subject}
            </Text>
          ) : null}
          {entry.content ? (
            <Text
              fontSize="$2"
              color="$color11"
              numberOfLines={3}>
              {entry.content}
            </Text>
          ) : null}
        </YStack>
      </XStack>
    );
  };

  const renderFeedEntry = (raw: TimelineEntry): ReactNode => {
    const entry = raw as TimelineFeedEntry;
    switch (entry.kind) {
      case 'comment': {
        return renderCommentRow(entry);
      }
      case 'version': {
        return renderSystemRow(
          entry,
          <PencilSimpleIcon size={iconSize} />,
          entry.version
            ? versionSummary(entry.version, (key, options) => t(key, options))
            : t('timeline.madeChanges', 'made changes'),
        );
      }
      case 'communication':
      case 'automated': {
        return renderCommunicationRow(entry);
      }
      case 'assignment': {
        return renderSystemRow(entry, <UserPlusIcon size={iconSize} />, entry.content ?? '');
      }
      case 'attachment': {
        return renderSystemRow(entry, <PaperclipIcon size={iconSize} />, entry.content ?? '');
      }
      case 'like': {
        return renderSystemRow(entry, <HeartIcon size={iconSize} />, entry.content ?? '');
      }
      default: {
        return renderSystemRow(entry, <InfoIcon size={iconSize} />, entry.content ?? '');
      }
    }
  };

  // ── layout ───────────────────────────────────────────────────────────────

  const tabItems = useMemo<TabsItem[]>(
    () => [
      { value: 'all', label: t('timeline.filterAll', 'All') },
      { value: 'comments', label: t('timeline.filterComments', 'Comments') },
      { value: 'edits', label: t('timeline.filterEdits', 'Edits') },
    ],
    [t],
  );

  const emptyLabel =
    filter === 'comments'
      ? t('timeline.noComments', 'No comments yet')
      : filter === 'edits'
        ? t('timeline.noEdits', 'No edits yet')
        : t('timeline.noActivity', 'No activity yet');

  if (!docinfo) {
    if (!composed && error && !loading) {
      return (
        <YStack gap="$3">
          <H4>{t('timeline.activity', 'Activity')}</H4>
          <YStack
            gap="$2"
            alignItems="flex-start">
            <Text
              fontSize="$2"
              color="$red10">
              {t('timeline.loadFailed', 'Could not load activity')}
            </Text>
            <Button
              size="$2"
              borderRadius={radiusToken}
              onPress={refresh}>
              {t('timeline.retry', 'Retry')}
            </Button>
          </YStack>
        </YStack>
      );
    }
    // Self-fetch in flight, or composed mode waiting on the parent's docinfo
    return (
      <YStack gap="$3">
        <H4>{t('timeline.activity', 'Activity')}</H4>
        <XStack
          gap="$2"
          alignItems="center"
          justifyContent="center"
          padding="$4">
          <Spinner size="small" />
          <Text
            fontSize="$2"
            color="$color10">
            {t('timeline.loading', 'Loading activity…')}
          </Text>
        </XStack>
      </YStack>
    );
  }

  return (
    <YStack gap="$3">
      <H4>{t('timeline.activity', 'Activity')}</H4>
      <Tabs
        items={tabItems}
        value={filter}
        onChange={handleFilterChange}
      />
      {actionError ? (
        <Text
          fontSize="$2"
          color="$red10"
          role="alert">
          {actionError}
        </Text>
      ) : null}
      {commentLedger.failed.map((entry) => (
        <SyncErrorNotice
          key={entry.id}
          message={entry.error ?? t('timeline.writeFailed', 'Could not save comment')}
          onRetry={() => void commentLedger.retry()}
          onDismiss={() => {
            commentLedger.dismiss(entry.id);
          }}
        />
      ))}
      <Timeline
        entries={visible}
        enableAddComment={canComment}
        onCommentAdded={canComment ? handleAddComment : undefined}
        renderEntry={(entry) => renderFeedEntry(entry)}
        placeholder={t('timeline.addCommentPlaceholder', 'Add a comment…')}
        labels={{
          noActivity: emptyLabel,
          addComment: t('timeline.addComment', 'Add Comment'),
          cancel: t('timeline.cancel', 'Cancel'),
          comment: t('timeline.comment', 'Comment'),
          sending: t('timeline.sending', 'Sending…'),
        }}
      />
      {hiddenCount > 0 && (
        <XStack justifyContent="center">
          <Button
            chromeless
            size="$2"
            borderRadius={radiusToken}
            onPress={() => {
              setVisibleCount((count) => count + PAGE_SIZE);
            }}>
            {t('timeline.loadOlder', {
              defaultValue: 'Load older ({{hidden}} more)',
              hidden: hiddenCount,
            })}
          </Button>
        </XStack>
      )}
    </YStack>
  );
}
