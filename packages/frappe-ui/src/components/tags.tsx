import { Tags as BaseTags } from '@repo/ui';
import type { TagItem, TagsProps } from '@repo/ui';
import { useFrappeCollection, useLiveQuery } from '@repo/frappe';
import { useCallback, useMemo } from 'react';

import { useFrappeConfig } from '../FrappeProvider';

export interface FrappeTag {
  name: string;
  doctype: string;
  creation?: string;
  modified?: string;
}

export interface FrappeTagLink {
  name: string;
  doctype: string;
  tag: string;
  document_type: string;
  document_name: string;
  creation?: string;
  modified?: string;
}

export interface FrappeTagsProps extends Omit<TagsProps, 'tags' | 'suggestions'> {
  doctype: string;
  docname: string;
}

export function Tags({ doctype, docname, onAdd, onRemove, enableAdd, ...props }: FrappeTagsProps) {
  const config = useFrappeConfig();

  // Forward the full socket target + engine options: the SyncModule cache
  // keys on baseURL + socketPort/socketBaseURL/siteName, so dropping them
  // here would split Tags onto a second SyncModule (own socket, own cache)
  // whenever the provider sets them.
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

  const tagLinkFilters = useMemo<[string, string, unknown][]>(
    () => [
      ['document_type', '=', doctype],
      ['document_name', '=', docname],
    ],
    [doctype, docname],
  );

  const tagLinkCollection = useFrappeCollection<FrappeTagLink>(connectionConfig, 'Tag Link', {
    filters: tagLinkFilters,
    fields: ['name', 'tag', 'document_type', 'document_name', 'creation', 'modified'],
  });

  const tagCollection = useFrappeCollection<FrappeTag>(connectionConfig, 'Tag', {
    fields: ['name', 'creation', 'modified'],
  });

  const { data: tagLinksData } = useLiveQuery(
    (q) => (tagLinkCollection ? q.from({ _list: tagLinkCollection }) : null),
    [tagLinkCollection],
  );

  const { data: allTagsData } = useLiveQuery(
    (q) => (tagCollection ? q.from({ _list: tagCollection }) : null),
    [tagCollection],
  );

  const tags = useMemo<TagItem[]>(
    () =>
      ((tagLinksData as FrappeTagLink[] | undefined) ?? []).map((link) => ({
        id: link.name,
        label: link.tag,
      })),
    [tagLinksData],
  );

  const suggestions = useMemo<TagItem[]>(
    () =>
      ((allTagsData as FrappeTag[] | undefined) ?? []).map((tag) => ({
        id: tag.name,
        label: tag.name,
      })),
    [allTagsData],
  );

  const handleAdd = useCallback(
    (tagName: string) => {
      onAdd?.(tagName);
    },
    [onAdd],
  );

  const handleRemove = useCallback(
    (tag: TagItem) => {
      onRemove?.(tag);
    },
    [onRemove],
  );

  // Always provide onAdd when enableAdd is requested so the button renders.
  // handleAdd calls onAdd if provided, or is a no-op otherwise.
  const effectiveEnableAdd = enableAdd !== false;

  return (
    <BaseTags
      tags={tags}
      suggestions={suggestions}
      onAdd={effectiveEnableAdd ? handleAdd : undefined}
      onRemove={onRemove ? handleRemove : undefined}
      enableAdd={effectiveEnableAdd}
      {...props}
    />
  );
}
