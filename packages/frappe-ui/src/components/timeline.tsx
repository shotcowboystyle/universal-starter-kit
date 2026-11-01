import { FrappeApp, useFrappeCollection, useLiveQuery } from '@repo/frappe';
import { Timeline as BaseTimeline } from '@repo/ui';
import type { TimelineEntry, TimelineProps, VersionChange } from '@repo/ui';
import { useCallback, useMemo, useRef } from 'react';

import { useFrappeCommentActions } from '../comment-actions';
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

const commentTypeToEntryType = (commentType: string): TimelineEntry['type'] => {
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
};

const frappeCommentToEntry = (comment: FrappeComment): TimelineEntry => {
  // Frappe's Comment doctype: comment_by is the "Comment By" full-name field
  // (often populated with the email on older sites), comment_email the email.
  // Map a real full name to authorName so the feed shows names, never emails;
  // when comment_by is itself an email the base Timeline prettifies it.
  const commentBy = comment.comment_by?.trim();
  const authorName = commentBy !== undefined && commentBy !== '' && !commentBy.includes('@') ? commentBy : undefined;
  return {
    id: comment.name,
    type: commentTypeToEntryType(comment.comment_type),
    content: comment.content,
    author: commentBy ?? comment.owner ?? 'unknown',
    authorName,
    authorEmail: comment.comment_email,
    timestamp: comment.creation ?? new Date().toISOString(),
  };
};

const frappeVersionToEntry = (version: FrappeVersion): TimelineEntry => {
  let changes: VersionChange[] | undefined;
  if (version.data !== undefined && version.data !== '') {
    try {
      // SAFETY: Version.data is the JSON diff Frappe writes ({changed, added, removed}); malformed JSON throws into the catch below
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      const parsed = JSON.parse(version.data) as {
        changed?: [string, unknown, unknown][];
        added?: [string, unknown][];
        removed?: [string, unknown][];
      };
      changes = [
        ...(parsed.changed ?? []).map(([field, old, next]) => ({ field, old, new: next })),
        // oxlint-disable-next-line sonarjs/no-undefined-assignment -- an added field has no old value; VersionChange carries it as undefined
        ...(parsed.added ?? []).map(([field, next]) => ({ field, old: undefined, new: next })),
        // oxlint-disable-next-line sonarjs/no-undefined-assignment -- a removed field has no new value; VersionChange carries it as undefined
        ...(parsed.removed ?? []).map(([field, old]) => ({ field, old, new: undefined })),
      ];
    } catch {
      // Safe to continue: malformed version data renders the entry without a change list
    }
  }
  return {
    id: version.name,
    type: 'version',
    author: version.owner ?? 'unknown',
    timestamp: version.creation ?? new Date().toISOString(),
    changes,
  };
};

export const Timeline = ({
  doctype,
  docname,
  onAddComment,
  showComments = true,
  showVersions = true,
  showAttachments = true,
  showAssignments = true,
  ...props
}: FrappeTimelineProps) => {
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
    const hidden = new Set<TimelineEntry['type']>();
    if (!showComments) {
      hidden.add('comment');
    }
    if (!showAttachments) {
      hidden.add('attachment');
    }
    if (!showAssignments) {
      hidden.add('assignment');
    }
    const commentEntries: TimelineEntry[] = [];
    // SAFETY: the query selects whole rows of the Comment Collection<FrappeComment>, so each row is a FrappeComment.
    for (const comment of (commentsData as FrappeComment[] | undefined) ?? []) {
      const entry = frappeCommentToEntry(comment);
      if (!hidden.has(entry.type)) {
        commentEntries.push(entry);
      }
    }
    // SAFETY: the query selects whole rows of the Version Collection<FrappeVersion>, so each row is a FrappeVersion.
    const versionEntries = showVersions
      ? ((versionsData as FrappeVersion[] | undefined) ?? []).map(frappeVersionToEntry)
      : [];
    // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh copy; toSorted is not guaranteed on every Hermes runtime this ships to
    return [...commentEntries, ...versionEntries].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [commentsData, versionsData, showComments, showVersions, showAttachments, showAssignments]);

  // Default write path: comments insert through the sync engine (optimistic
  // paint, desk-RPC transport, rollback on rejection). Previously the
  // composer only forwarded to the onAddComment prop, and consumers that
  // didn't pass one (FrappeForm) dropped the comment silently.
  const { addComment } = useFrappeCommentActions(connectionConfig, doctype, docname);
  // oxlint-disable-next-line unicorn/no-useless-undefined -- React 19's useRef requires its initial value argument
  const sessionUserRef = useRef<string | undefined>(undefined);

  const baseURL = config?.baseURL;
  const fixtures = config?.fixtures;
  const auth = config?.auth;
  const resolveSessionUser = useCallback(async (): Promise<string> => {
    if (sessionUserRef.current !== undefined && sessionUserRef.current !== '') {
      return sessionUserRef.current;
    }
    if (baseURL !== undefined && baseURL !== '' && !fixtures) {
      // SAFETY: the provider's auth carries a subset of FrappeConfig's optional fields; HttpClient reads only those
      // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- see SAFETY above
      const app = new FrappeApp(baseURL, (auth ?? {}) as Record<string, unknown>);
      sessionUserRef.current = await app.auth().getLoggedInUser();
    } else {
      // Fixture/story mode has no session endpoint.
      sessionUserRef.current = 'Administrator';
    }
    return sessionUserRef.current;
  }, [baseURL, fixtures, auth]);

  const handleAddComment = useCallback(
    (content: string) => {
      if (onAddComment) {
        onAddComment(content);
        return;
      }
      void (async () => {
        try {
          const email = await resolveSessionUser();
          await addComment({ content, email });
        } catch {
          // Safe to continue: the rejection already rolled back and landed in the mutation
          // ledger (useFrappePendingMutations / SyncErrorNotice at the surface).
        }
      })();
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
};
