import { FrappeApp, useFrappeCollection, useLiveQuery } from '@repo/frappe';
import { Timeline as BaseTimeline } from '@repo/ui';
import type { TimelineEntry, TimelineProps, VersionChange } from '@repo/ui';
import { useCallback, useMemo, useRef } from 'react';

import { useFrappeCommentActions } from '../commentActions';
import { useFrappeConfig } from '../FrappeProvider';

export interface FrappeComment {
  name: string;
  doctype: string;
  comment_type: string;
  content?: string;
  comment_by?: string;
  comment_email?: string;
  reference_doctype?: string;
  reference_name?: string;
  creation?: string;
  modified?: string;
  owner?: string;
}

export interface FrappeVersion {
  name: string;
  doctype: string;
  docname?: string;
  ref_doctype?: string;
  data?: string;
  creation?: string;
  modified?: string;
  owner?: string;
}

export interface FrappeTimelineProps extends Omit<TimelineProps, 'entries'> {
  doctype: string;
  docname: string;
  onAddComment?: (content: string) => void;
  /** Filter entry types shown in the timeline (default: true) */
  showComments?: boolean;
  showVersions?: boolean;
  showAttachments?: boolean;
  showAssignments?: boolean;
}

function commentTypeToEntryType(commentType: string): TimelineEntry['type'] {
  switch (commentType) {
    case 'Comment': {
      return 'comment';
    }
    case 'Attachment': {
      return 'attachment';
    }
    case 'Assignment': {
      return 'assignment';
    }
    case 'Info': {
      return 'info';
    }
    default: {
      return 'comment';
    }
  }
}

function frappeCommentToEntry(comment: FrappeComment): TimelineEntry {
  // Frappe's Comment doctype: comment_by is the "Comment By" full-name field
  // (often populated with the email on older sites), comment_email the email.
  // Map a real full name to authorName so the feed shows names, never emails;
  // when comment_by is itself an email the base Timeline prettifies it.
  const commentBy = comment.comment_by?.trim();
  const authorName = commentBy && !commentBy.includes('@') ? commentBy : undefined;
  return {
    id: comment.name,
    type: commentTypeToEntryType(comment.comment_type),
    content: comment.content,
    author: commentBy ?? comment.owner ?? 'unknown',
    authorName,
    authorEmail: comment.comment_email,
    timestamp: comment.creation ?? new Date().toISOString(),
  };
}

function frappeVersionToEntry(version: FrappeVersion): TimelineEntry {
  let changes: VersionChange[] | undefined;
  if (version.data) {
    try {
      const parsed = JSON.parse(version.data) as {
        changed?: [string, unknown, unknown][];
        added?: [string, unknown][];
        removed?: [string, unknown][];
      };
      changes = [
        ...(parsed.changed ?? []).map(([field, old, next]) => ({ field, old, new: next })),
        ...(parsed.added ?? []).map(([field, next]) => ({ field, old: undefined, new: next })),
        ...(parsed.removed ?? []).map(([field, old]) => ({ field, old, new: undefined })),
      ];
    } catch {
      // ignore malformed data
    }
  }
  return {
    id: version.name,
    type: 'version',
    author: version.owner ?? 'unknown',
    timestamp: version.creation ?? new Date().toISOString(),
    changes,
  };
}

export function Timeline({
  doctype,
  docname,
  onAddComment,
  showComments = true,
  showVersions = true,
  showAttachments = true,
  showAssignments = true,
  ...props
}: FrappeTimelineProps) {
  const config = useFrappeConfig();

  // Forward socketPort + engine options: the SyncModule is shared per
  // baseURL and the first consumer's config wins, so dropping syncOptions
  // here would strip persistKey/cdcInterval for the whole app whenever the
  // timeline constructs the engine first (e.g. a direct form deep link).
  const connectionConfig = config
    ? {
        baseURL: config.baseURL,
        socketPort: config.socketPort,
        siteName: config.siteName,
        socketBaseURL: config.socketBaseURL,
        auth: config.auth,
        syncOptions: config.syncOptions,
        socketOptions: config.socketOptions,
        realtime: config.realtime,
        fixtures: config.fixtures,
      }
    : undefined;

  const commentFilters = useMemo<[string, string, unknown][]>(
    () => [
      ['reference_doctype', '=', doctype],
      ['reference_name', '=', docname],
    ],
    [doctype, docname],
  );

  const versionFilters = useMemo<[string, string, unknown][]>(
    () => [
      ['ref_doctype', '=', doctype],
      ['docname', '=', docname],
    ],
    [doctype, docname],
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

  const versionCollection = useFrappeCollection<FrappeVersion>(connectionConfig, 'Version', {
    filters: versionFilters,
    fields: ['name', 'docname', 'ref_doctype', 'data', 'creation', 'modified', 'owner'],
  });

  const { data: commentsData } = useLiveQuery(
    (q) => (commentCollection ? q.from({ _list: commentCollection }) : null),
    [commentCollection],
  );

  const { data: versionsData } = useLiveQuery(
    (q) => (versionCollection ? q.from({ _list: versionCollection }) : null),
    [versionCollection],
  );

  const entries = useMemo<TimelineEntry[]>(() => {
    const commentEntries = ((commentsData as FrappeComment[] | undefined) ?? [])
      .map(frappeCommentToEntry)
      .filter((e) => {
        if (e.type === 'comment' && !showComments) {
          return false;
        }
        if (e.type === 'attachment' && !showAttachments) {
          return false;
        }
        if (e.type === 'assignment' && !showAssignments) {
          return false;
        }
        return true;
      });
    const versionEntries = showVersions
      ? ((versionsData as FrappeVersion[] | undefined) ?? []).map(frappeVersionToEntry)
      : [];
    return [...commentEntries, ...versionEntries].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [commentsData, versionsData, showComments, showVersions, showAttachments, showAssignments]);

  // Default write path: comments insert through the sync engine (optimistic
  // paint, desk-RPC transport, rollback on rejection). Previously the
  // composer only forwarded to the onAddComment prop, and consumers that
  // didn't pass one (FrappeForm) dropped the comment silently.
  const { addComment } = useFrappeCommentActions(connectionConfig, doctype, docname);
  const sessionUserRef = useRef<string | undefined>(undefined);

  const resolveSessionUser = useCallback(async (): Promise<string> => {
    if (sessionUserRef.current) {
      return sessionUserRef.current;
    }
    if (config?.baseURL && !config.fixtures) {
      const app = new FrappeApp(config.baseURL, (config.auth ?? {}) as Record<string, unknown>);
      sessionUserRef.current = await app.auth().getLoggedInUser();
    } else {
      // Fixture/story mode has no session endpoint.
      sessionUserRef.current = 'Administrator';
    }
    return sessionUserRef.current;
  }, [config?.baseURL, config?.fixtures]);

  const handleAddComment = useCallback(
    (content: string) => {
      if (onAddComment) {
        onAddComment(content);
        return;
      }
      void (async () => {
        const email = await resolveSessionUser();
        await addComment({ content, email });
      })().catch(() => {
        // Rejection already rolled back and landed in the mutation ledger
        // (useFrappePendingMutations / SyncErrorNotice at the surface).
      });
    },
    [onAddComment, addComment, resolveSessionUser],
  );

  // The base Timeline follows the `timestampStyle` house knob (default
  // "absolute" compact register; the tooltip always carries the absolute
  // form), so no formatTimestamp default is injected here anymore.
  const { enableAddComment, ...restProps } = props;

  // Always provide onCommentAdded when comment input is enabled so the composer renders
  const effectiveEnableAddComment = enableAddComment !== false;

  return (
    <BaseTimeline
      entries={entries}
      onCommentAdded={effectiveEnableAddComment ? handleAddComment : undefined}
      enableAddComment={effectiveEnableAddComment}
      {...restProps}
    />
  );
}
