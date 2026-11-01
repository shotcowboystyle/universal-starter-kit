import { TreeStructureIcon } from '@phosphor-icons/react';
import { formCommonColors } from '@repo/forms';
import { useDocTypeMeta } from '@repo/frappe';
import { useGlyphColor, useResolvedKnobs } from '@repo/theme';
import { AsyncBoundary, EmptyState, TreeView } from '@repo/ui';
import type { TreeNode } from '@repo/ui';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, YStack } from 'tamagui';
import type { YStackProps } from 'tamagui';

import { useFrappeConfig } from './FrappeProvider';
import { FrappeReconnectIndicator } from './FrappeReconnectIndicator';
import { useFrappeRows } from './use-frappe-rows';

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
  filters?: Partial<TDoc> | [keyof TDoc & string, string, unknown][];
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
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- SyncModule options pass through to @repo/frappe untouched
  syncOptions?: Record<string, unknown>;
  loading?: React.ReactNode;
  error?: (error: Error) => React.ReactNode;
}

/** A tree node's payload: the row it stands for, as the generic TreeView carries it. */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- the generic TreeView carries each Frappe row as an open field bag
type TreeNodeData = Record<string, unknown>;

/** A row as node data; a row object is a field bag, so no conversion is needed. */
const nodeData = (doc: { name: string }): TreeNodeData => doc;

/** A row field as text, or undefined when the row leaves it unset. */
const fieldText = (doc: { name: string }, field: string): string | undefined => {
  const raw = nodeData(doc)[field];
  // oxlint-disable-next-line typescript/no-base-to-string -- name / title / parent / path fields are scalars; String() matches the server's text
  return raw == null ? undefined : String(raw);
};

/**
 * Build a TreeNode forest from a flat list of docs keyed by parent field.
 * Orphans (parent missing from the set) surface as roots so filtered
 * subsets remain visible.
 */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- public signature keeps the doc type parameter
export const buildTreeNodes = <TDoc extends { name: string }>(
  docs: TDoc[],
  parentField: string,
  titleField: string,
): TreeNode<TreeNodeData>[] => {
  const byName = new Map<string, TDoc>();
  const childrenByParent = new Map<string, TDoc[]>();

  for (const doc of docs) {
    byName.set(doc.name, doc);
  }

  const roots: TDoc[] = [];
  for (const doc of docs) {
    const parentName = fieldText(doc, parentField);
    if (parentName === undefined || parentName === '' || !byName.has(parentName)) {
      roots.push(doc);
    } else {
      const siblings = childrenByParent.get(parentName) ?? [];
      siblings.push(doc);
      childrenByParent.set(parentName, siblings);
    }
  }

  const sortDocs = (items: TDoc[]) => items.toSorted((a, b) => a.name.localeCompare(b.name));

  const buildNode = (doc: TDoc): TreeNode<TreeNodeData> => {
    const childDocs = sortDocs(childrenByParent.get(doc.name) ?? []);
    return {
      id: doc.name,
      label: fieldText(doc, titleField) ?? doc.name,
      data: nodeData(doc),
      children: childDocs.length > 0 ? childDocs.map(buildNode) : undefined,
    };
  };

  return sortDocs(roots).map(buildNode);
};

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
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- public signature keeps the doc type parameter
export const buildPathTreeNodes = <TDoc extends { name: string }>(
  docs: TDoc[],
  pathField: string,
  separator: string,
): TreeNode<TreeNodeData>[] => {
  const roots = new Map<string, PathBucket<TDoc>>();

  const splitPath = (doc: TDoc): string[] => {
    const value = fieldText(doc, pathField) ?? '';
    // An empty separator would split the value into single characters.
    const segments = separator ? value.split(separator) : [value];
    const cleaned: string[] = [];
    for (const segment of segments) {
      const trimmed = segment.trim();
      if (trimmed !== '') {
        cleaned.push(trimmed);
      }
    }
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

  const toNodes = (level: Map<string, PathBucket<TDoc>>): TreeNode<TreeNodeData>[] =>
    [...level.values()]
      .toSorted((a, b) => a.segment.localeCompare(b.segment))
      .map((bucket) => {
        const children = toNodes(bucket.children);
        return {
          id: bucket.path,
          label: bucket.segment,
          data: bucket.doc === undefined ? undefined : nodeData(bucket.doc),
          children: children.length > 0 ? children : undefined,
        };
      });

  return toNodes(roots);
};

/** The connection the tree reads through, from the props or the FrappeProvider above. */
const useTreeAppConfig = (
  baseURL: string | undefined,
  auth: FrappeTreeViewProps<{ name: string; doctype: string }>['auth'],
  syncOptions: FrappeTreeViewProps<{ name: string; doctype: string }>['syncOptions'],
) => {
  const config = useFrappeConfig();
  const finalBaseURL = baseURL ?? config?.baseURL;
  const finalAuth = auth ?? config?.auth;
  const finalSyncOptions = syncOptions ?? config?.syncOptions;

  if ((finalBaseURL === undefined || finalBaseURL === '') && !config?.fixtures) {
    throw new Error('FrappeTreeView requires baseURL prop or FrappeProvider with baseURL or fixtures');
  }

  return useMemo(
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
};

/** The fields the tree reads: the caller's, plus whatever the hierarchy needs. */
const treeFieldNames = (
  fields: readonly string[] | undefined,
  hierarchyFields: readonly string[],
  valueField: string | undefined,
): string[] => {
  const fieldSet = new Set<string>(fields);
  fieldSet.add('name');
  for (const field of hierarchyFields) {
    fieldSet.add(field);
  }
  if (valueField !== undefined && valueField !== '') {
    fieldSet.add(valueField);
  }
  return [...fieldSet];
};

/** The muted value a node shows beside its label, when `valueField` names one. */
const nodeValueText = (node: TreeNode<TreeNodeData>, valueField: string | undefined): string | undefined => {
  if (valueField === undefined || valueField === '' || !node.data) {
    return undefined;
  }
  const value = node.data[valueField];
  // oxlint-disable-next-line typescript/no-base-to-string -- tree value fields are scalars; String() renders them as the list does
  return value == null ? undefined : String(value);
};

// oxlint-disable-next-line typescript/promise-function-async -- ReactNode's type admits a Promise; this returns the caller's loading node or an element
const TreeLoading = ({ loading, ...stackProps }: YStackProps & { loading: React.ReactNode }) => {
  const hasCustomLoading = Boolean(loading);
  if (hasCustomLoading) {
    return loading;
  }
  return (
    <AsyncBoundary
      layout="list"
      loading
      {...stackProps}
    />
  );
};

// oxlint-disable-next-line typescript/promise-function-async -- ReactNode's type admits a Promise; this returns the caller's error node or an element
const TreeError = ({
  error,
  renderError,
  title,
  ...stackProps
}: YStackProps & { error: Error; renderError?: (error: Error) => React.ReactNode; title: string }) => {
  if (renderError) {
    return renderError(error);
  }
  return (
    <AsyncBoundary
      layout="list"
      error={error}
      errorTitle={title}
      {...stackProps}
    />
  );
};

const NotTreeState = (stackProps: YStackProps) => {
  const { knobProps } = useResolvedKnobs();
  const emptyIconColor = useGlyphColor(formCommonColors.muted);
  const { t } = useTranslation();
  const iconWidth = knobProps.controlIcon?.width;
  const iconSize = iconWidth !== 0 && !Number.isNaN(iconWidth) ? iconWidth : 16;
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
};

interface TreeHierarchyInput {
  doctype: string;
  meta: ReturnType<typeof useDocTypeMeta>['meta'];
  metaError: ReturnType<typeof useDocTypeMeta>['error'];
  pathSeparator: string | undefined;
  pathField: string | undefined;
  titleFieldProp: string | undefined;
  parentFieldProp: string | undefined;
}

/** Which hierarchy the tree builds, and whether the doctype can be read as one. */
const resolveTreeHierarchy = ({
  doctype,
  meta,
  metaError,
  pathSeparator,
  pathField,
  titleFieldProp,
  parentFieldProp,
}: TreeHierarchyInput) => {
  const isPathMode = pathSeparator !== undefined && pathSeparator !== '';
  const hasParentField = parentFieldProp !== undefined && parentFieldProp !== '';
  // Wait for meta before deciding. If meta fails, an explicit parentField
  // lets callers continue (Guest peek / offline). Successful meta always
  // wins for the is_tree gate — including rejecting flat DocTypes that
  // happened to pass parentField.
  //
  // Path mode is the exception: the hierarchy comes from the row's own key,
  // so there is nothing for is_tree to be right about.
  const isTreeDoctype = meta?.is_tree !== undefined && meta.is_tree !== 0;
  const metaFailed = !!metaError && !meta;
  return {
    isPathMode,
    hasParentField,
    effectivePathField: pathField ?? 'name',
    effectiveTitleField: titleFieldProp ?? meta?.title_field ?? 'name',
    effectiveParentField: parentFieldProp ?? `parent_${doctype.toLowerCase().replaceAll(' ', '_')}`,
    isKnownNotTree: !isPathMode && !!meta && !isTreeDoctype,
    metaFailed,
    canProceed: isPathMode || isTreeDoctype || (metaFailed && hasParentField),
  };
};

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
export const FrappeTreeView = <TDoc extends { name: string; doctype: string }>({
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
}: FrappeTreeViewProps<TDoc>) => {
  void _enableDragDrop;

  const { knobProps } = useResolvedKnobs();
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const appConfig = useTreeAppConfig(baseURL, auth, syncOptions);

  const { meta, isLoading: isMetaLoading, error: metaError } = useDocTypeMeta(appConfig, doctype);

  const {
    isPathMode,
    hasParentField,
    effectivePathField,
    effectiveTitleField,
    effectiveParentField,
    isKnownNotTree,
    metaFailed,
    canProceed,
  } = resolveTreeHierarchy({ doctype, meta, metaError, pathSeparator, pathField, titleFieldProp, parentFieldProp });

  const effectiveFields = useMemo(
    () =>
      // SAFETY: the extra names are the doctype's own name/title/parent/path/value fields, which TDoc rows carry
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      treeFieldNames(
        fields,
        // The parent field does not exist on a path-shaped doctype; asking for
        // it would fail the read on a live bench.
        isPathMode ? [effectivePathField] : [effectiveTitleField, effectiveParentField],
        valueField,
      ) as (keyof TDoc & string)[],
    [fields, isPathMode, effectivePathField, effectiveTitleField, effectiveParentField, valueField],
  );

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
      pathSeparator !== undefined && pathSeparator !== ''
        ? buildPathTreeNodes(docs, effectivePathField, pathSeparator)
        : buildTreeNodes(docs, effectiveParentField, effectiveTitleField),
    [docs, pathSeparator, effectivePathField, effectiveParentField, effectiveTitleField],
  );

  const handleNodeSelect = useCallback(
    (node: TreeNode<TreeNodeData>) => {
      setSelectedId(node.id);
      // SAFETY: node data is the TDoc row buildTreeNodes / buildPathTreeNodes stored on it
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      const doc = node.data as Partial<TDoc> | undefined;
      if (isPathMode) {
        onPathSelect?.(node.id, doc);
      }
      // A synthesised branch is not a document, so onNodeClick stays silent
      // rather than handing a caller a name that would 404 on open.
      if (!doc) {
        return;
      }
      onNodeClick?.(doc);
    },
    [isPathMode, onNodeClick, onPathSelect],
  );

  if (isMetaLoading) {
    return (
      <TreeLoading
        loading={loading}
        {...stackProps}
      />
    );
  }

  if (metaError && metaFailed && !hasParentField && !isPathMode) {
    return (
      <TreeError
        error={metaError}
        renderError={error}
        title={t('Failed to load {{doctype}} schema', { doctype })}
        {...stackProps}
      />
    );
  }

  if (isKnownNotTree) {
    return <NotTreeState {...stackProps} />;
  }

  // Error beats loading (DG-ST-01): a failed initial sync must not hide
  // behind a perpetual skeleton or an empty tree.
  if (queryError) {
    return (
      <TreeError
        error={queryError}
        renderError={error}
        title={t('Failed to load {{doctype}} tree', { doctype })}
        {...stackProps}
      />
    );
  }

  if (isDataLoading) {
    return (
      <TreeLoading
        loading={loading}
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
        renderNode={(node) => {
          const valueText = nodeValueText(node, valueField);
          return (
            <Text
              {...knobProps.label}
              numberOfLines={1}>
              {node.label}
              {valueText !== undefined && (
                <Text
                  color={formCommonColors.muted}
                  {...knobProps.label}
                  paddingInlineStart="$2">
                  {valueText}
                </Text>
              )}
            </Text>
          );
        }}
        onNodeSelect={handleNodeSelect}
        emptyMessage={t('No items found')}
      />
    </YStack>
  );
};
