import { AsyncBoundary, EmptyState, TreeView } from '@repo/ui';
import type { TreeNode } from '@repo/ui';
import { formCommonColors } from '@repo/forms';
import { useDocTypeMeta } from '@repo/frappe';
import { useGlyphColor, useResolvedKnobs } from '@repo/theme';
import { TreeStructureIcon } from '@phosphor-icons/react';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, YStack } from 'tamagui';
import type { YStackProps } from 'tamagui';

import { useFrappeConfig } from './FrappeProvider';
import { FrappeReconnectIndicator } from './FrappeReconnectIndicator';
import { useFrappeRows } from './useFrappeRows';

export interface FrappeTreeViewProps<TDoc extends { name: string; doctype: string }> extends Omit<
  YStackProps,
  'children' | 'display'
> {
  doctype: string;
  parentField?: string;
  /**
   * Separator that splits {@link FrappeTreeViewProps.pathField} into levels,
   * e.g. ":" for an account named `Assets:Personal:Bank:Checking`. Setting it
   * switches the tree to path mode: the branches between root and leaf are
   * synthesised from the segments, `parentField` is neither read nor fetched,
   * and the `is_tree` gate is skipped. A doctype whose hierarchy lives in the
   * row's own key has no parent field and the server will never report
   * `is_tree`.
   */
  pathSeparator?: string;
  /**
   * Row field holding the path. Path mode only; defaults to `name`. Path mode
   * fetches `name`, this field, `valueField` and whatever `fields` adds, so a
   * caller who needs more on the `onNodeClick` document asks for it there.
   */
  pathField?: string;
  titleField?: string;
  valueField?: string;
  fields?: readonly (keyof TDoc & string)[];
  filters?: Partial<TDoc> | [keyof TDoc & string, string, any][];
  onNodeClick?: (doc: Partial<TDoc>) => void;
  /**
   * Path-mode selection, fired for synthesised branches as well as documents.
   * `doc` is present only when a document actually sits at that path.
   */
  onPathSelect?: (path: string, doc?: Partial<TDoc>) => void;
  /** Reserved for future DnD reparenting; not wired yet. */
  enableDragDrop?: boolean;
  /** Expand every branch on first paint (passed through to TreeView). */
  expandByDefault?: boolean;
  /** Density for the underlying TreeView chrome. */
  display?: 'default' | 'compressed';
  baseURL?: string;
  auth?: { useToken?: boolean; token?: string; type?: string };
  syncOptions?: Record<string, unknown>;
  loading?: React.ReactNode;
  error?: (error: Error) => React.ReactNode;
}

function isRootParent(value: unknown): boolean {
  return value == null || value === '';
}

/**
 * Build a TreeNode forest from a flat list of docs keyed by parent field.
 * Orphans (parent missing from the set) surface as roots so filtered
 * subsets remain visible.
 */
export function buildTreeNodes<TDoc extends { name: string }>(
  docs: TDoc[],
  parentField: string,
  titleField: string,
): TreeNode<Record<string, unknown>>[] {
  const byName = new Map<string, TDoc>();
  const childrenByParent = new Map<string, TDoc[]>();

  for (const doc of docs) {
    byName.set(doc.name, doc);
  }

  const roots: TDoc[] = [];
  for (const doc of docs) {
    const parentRaw = (doc as Record<string, unknown>)[parentField];
    if (isRootParent(parentRaw)) {
      roots.push(doc);
      continue;
    }
    const parentName = String(parentRaw);
    if (!byName.has(parentName)) {
      roots.push(doc);
      continue;
    }
    const siblings = childrenByParent.get(parentName) ?? [];
    siblings.push(doc);
    childrenByParent.set(parentName, siblings);
  }

  const sortDocs = (items: TDoc[]) => [...items].sort((a, b) => a.name.localeCompare(b.name));

  const buildNode = (doc: TDoc): TreeNode<Record<string, unknown>> => {
    const childDocs = sortDocs(childrenByParent.get(doc.name) ?? []);
    const title = String((doc as Record<string, unknown>)[titleField] ?? doc.name);
    return {
      id: doc.name,
      label: title,
      data: doc as unknown as Record<string, unknown>,
      children: childDocs.length > 0 ? childDocs.map(buildNode) : undefined,
    };
  };

  return sortDocs(roots).map(buildNode);
}

/** One level of the path forest, before it becomes TreeNodes. */
interface PathBucket<TDoc> {
  path: string;
  segment: string;
  doc?: TDoc;
  children: Map<string, PathBucket<TDoc>>;
}

/**
 * Build a TreeNode forest from paths held on the rows themselves, e.g.
 * `Assets:Personal:Bank:Checking` split on ":".
 *
 * The branches between root and leaf are not rows, so they are synthesised:
 * a synthesised node carries no `data` and its `id` is the path prefix it
 * stands for. A row whose path value is empty falls back to a single segment
 * of its own name, so nothing is silently dropped.
 */
export function buildPathTreeNodes<TDoc extends { name: string }>(
  docs: TDoc[],
  pathField: string,
  separator: string,
): TreeNode<Record<string, unknown>>[] {
  const roots = new Map<string, PathBucket<TDoc>>();

  const splitPath = (doc: TDoc): string[] => {
    const raw = (doc as Record<string, unknown>)[pathField];
    const value = raw == null ? '' : String(raw);
    // An empty separator would split the value into single characters.
    const segments = separator ? value.split(separator) : [value];
    const cleaned = segments.map((segment) => segment.trim()).filter((segment) => segment !== '');
    return cleaned.length > 0 ? cleaned : [doc.name];
  };

  for (const doc of docs) {
    let level = roots;
    let prefix = '';
    let bucket: PathBucket<TDoc> | undefined;
    for (const segment of splitPath(doc)) {
      prefix = prefix ? `${prefix}${separator}${segment}` : segment;
      bucket = level.get(segment);
      if (!bucket) {
        bucket = { path: prefix, segment, children: new Map() };
        level.set(segment, bucket);
      }
      level = bucket.children;
    }
    // Two rows on one path: the first keeps the node rather than the last
    // row the live query happened to deliver.
    if (bucket && !bucket.doc) {
      bucket.doc = doc;
    }
  }

  const toNodes = (level: Map<string, PathBucket<TDoc>>): TreeNode<Record<string, unknown>>[] =>
    [...level.values()]
      .sort((a, b) => a.segment.localeCompare(b.segment))
      .map((bucket) => {
        const children = toNodes(bucket.children);
        return {
          id: bucket.path,
          label: bucket.segment,
          data: bucket.doc as unknown as Record<string, unknown> | undefined,
          children: children.length > 0 ? children : undefined,
        };
      });

  return toNodes(roots);
}

/**
 * Thin Frappe wrapper around the generic TreeView component.
 *
 * Fetches the full DocType list via `useFrappeCollection` / `useLiveQuery`
 * (realtime-backed), then builds a `TreeNode` forest from the parent field.
 *
 * Pass `pathSeparator` instead when the hierarchy lives in the row's own key
 * (`Assets:Personal:Bank:Checking`). The branches are synthesised client-side,
 * so no parent field and no `is_tree` are needed.
 */
export function FrappeTreeView<TDoc extends { name: string; doctype: string }>({
  doctype,
  parentField: parentFieldProp,
  pathSeparator,
  pathField,
  titleField: titleFieldProp,
  valueField,
  fields,
  filters,
  onNodeClick,
  onPathSelect,
  enableDragDrop: _enableDragDrop = false,
  expandByDefault = false,
  display = 'default',
  baseURL,
  auth,
  syncOptions,
  loading,
  error,
  ...stackProps
}: FrappeTreeViewProps<TDoc>) {
  void _enableDragDrop;

  const config = useFrappeConfig();
  const { knobProps } = useResolvedKnobs();
  const emptyIconColor = useGlyphColor(formCommonColors.muted);
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | undefined>();

  const finalBaseURL = baseURL ?? config?.baseURL;
  const finalAuth = auth ?? config?.auth;
  const finalSyncOptions = syncOptions ?? config?.syncOptions;

  if (!finalBaseURL && !config?.fixtures) {
    throw new Error('FrappeTreeView requires baseURL prop or FrappeProvider with baseURL or fixtures');
  }

  const appConfig = useMemo(
    () => ({
      baseURL: finalBaseURL,
      socketPort: config?.socketPort,
      siteName: config?.siteName,
      socketBaseURL: config?.socketBaseURL,
      auth: finalAuth,
      syncOptions: finalSyncOptions,
      realtime: config?.realtime,
      fixtures: config?.fixtures,
    }),
    [
      finalBaseURL,
      config?.socketPort,
      config?.siteName,
      config?.socketBaseURL,
      config?.realtime,
      finalAuth,
      finalSyncOptions,
      config?.fixtures,
    ],
  );

  const { meta, isLoading: isMetaLoading, error: metaError } = useDocTypeMeta(appConfig, doctype);

  const isPathMode = !!pathSeparator;
  const effectivePathField = pathField ?? 'name';
  const effectiveTitleField = titleFieldProp ?? meta?.title_field ?? 'name';
  const effectiveParentField = parentFieldProp ?? `parent_${doctype.toLowerCase().replaceAll(' ', '_')}`;

  // Wait for meta before deciding. If meta fails, an explicit parentField
  // lets callers continue (Guest peek / offline). Successful meta always
  // wins for the is_tree gate — including rejecting flat DocTypes that
  // happened to pass parentField.
  //
  // Path mode is the exception: the hierarchy comes from the row's own key,
  // so there is nothing for is_tree to be right about.
  const isKnownNotTree = !isPathMode && !!meta && !meta.is_tree;
  const canProceed = isPathMode || !!meta?.is_tree || (!!metaError && !meta && !!parentFieldProp);

  const effectiveFields = useMemo(() => {
    const fieldSet = new Set<string>(fields as string[] | undefined);
    fieldSet.add('name');
    if (isPathMode) {
      // The parent field does not exist on a path-shaped doctype; asking for
      // it would fail the read on a live bench.
      fieldSet.add(effectivePathField);
    } else {
      fieldSet.add(effectiveTitleField);
      fieldSet.add(effectiveParentField);
    }
    if (valueField) {
      fieldSet.add(valueField);
    }
    return [...fieldSet] as (keyof TDoc & string)[];
  }, [fields, isPathMode, effectivePathField, effectiveTitleField, effectiveParentField, valueField]);

  // The shared doctype read (MPO-251): collection + live query + the honest
  // error surface a bare collection swallows — without it a 403 or a network
  // failure renders as an empty tree. `limit: null` keeps the tree on the
  // bench's own page length, as it was before the hook existed.
  const rowsMessages = useMemo(
    () => ({
      permission: t('You do not have permission to view {{doctype}}', { doctype }),
      generic: t('Failed to load {{doctype}} tree', { doctype }),
    }),
    [doctype, t],
  );
  const {
    rows: docs,
    isQueryLoading: isDataLoading,
    error: queryError,
  } = useFrappeRows<TDoc>(appConfig, doctype, {
    fields: effectiveFields,
    filters,
    limit: null,
    enabled: canProceed && !isKnownNotTree,
    messages: rowsMessages,
  });

  const treeNodes = useMemo(
    () =>
      pathSeparator
        ? buildPathTreeNodes(docs, effectivePathField, pathSeparator)
        : buildTreeNodes(docs, effectiveParentField, effectiveTitleField),
    [docs, pathSeparator, effectivePathField, effectiveParentField, effectiveTitleField],
  );

  const handleNodeSelect = useCallback(
    (node: TreeNode<Record<string, unknown>>) => {
      setSelectedId(node.id);
      if (isPathMode) {
        onPathSelect?.(node.id, node.data as Partial<TDoc> | undefined);
      }
      // A synthesised branch is not a document, so onNodeClick stays silent
      // rather than handing a caller a name that would 404 on open.
      if (!node.data) {
        return;
      }
      onNodeClick?.(node.data as Partial<TDoc>);
    },
    [isPathMode, onNodeClick, onPathSelect],
  );

  if (isMetaLoading) {
    if (loading) {
      return <>{loading}</>;
    }
    return (
      <AsyncBoundary
        layout="list"
        loading
        {...stackProps}
      />
    );
  }

  if (metaError && !meta && !parentFieldProp && !isPathMode) {
    if (error) {
      return <>{error(metaError)}</>;
    }
    return (
      <AsyncBoundary
        layout="list"
        error={metaError}
        errorTitle={t('Failed to load {{doctype}} schema', { doctype })}
        {...stackProps}
      />
    );
  }

  if (isKnownNotTree) {
    const iconSize = Number(knobProps.controlIcon?.width) || 16;
    return (
      <EmptyState
        title={t('This DocType does not support tree view')}
        description={t(
          'Pass pathSeparator and pathField to build the hierarchy from a path-shaped value on each row. parentField alone does not, because a flat DocType has no parent field.',
        )}
        icon={
          <TreeStructureIcon
            size={iconSize * 2}
            color={emptyIconColor}
          />
        }
        {...stackProps}
      />
    );
  }

  // Error beats loading (DG-ST-01): a failed initial sync must not hide
  // behind a perpetual skeleton or an empty tree.
  if (queryError) {
    if (error) {
      return <>{error(queryError)}</>;
    }
    return (
      <AsyncBoundary
        layout="list"
        error={queryError}
        errorTitle={t('Failed to load {{doctype}} tree', { doctype })}
        {...stackProps}
      />
    );
  }

  if (isDataLoading) {
    if (loading) {
      return <>{loading}</>;
    }
    return (
      <AsyncBoundary
        layout="list"
        loading
        {...stackProps}
      />
    );
  }

  return (
    <YStack
      {...knobProps.gap}
      flex={1}
      {...stackProps}>
      <FrappeReconnectIndicator config={appConfig} />
      <TreeView
        {...knobProps.containerRadius}
        nodes={treeNodes}
        ariaLabel={t('{{doctype}} tree', { doctype })}
        expandByDefault={expandByDefault}
        display={display}
        showExpansionArrows
        selectedId={selectedId}
        renderNode={(node) => (
          <Text
            {...knobProps.label}
            numberOfLines={1}>
            {node.label}
            {valueField && node.data && node.data[valueField] != null && (
              <Text
                color={formCommonColors.muted}
                {...knobProps.label}
                paddingInlineStart="$2">
                {String(node.data[valueField])}
              </Text>
            )}
          </Text>
        )}
        onNodeSelect={handleNodeSelect}
        emptyMessage={t('No items found')}
      />
    </YStack>
  );
}
