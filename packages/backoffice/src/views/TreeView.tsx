// Desk "tree" view parity: only meaningful when the doctype is a tree
// (nested set: lft/rgt + parent_<doctype> fields — surfaced by meta.is_tree).
// FrappeTreeView fetches the full list itself (realtime-backed) and builds
// the forest from the parent field; node click opens the form.

import { FrappeTreeView } from '@repo/frappe-ui';
import type { FrappeTreeViewProps } from '@repo/frappe-ui';
import { YStack } from '@repo/ui';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackofficeNavigator, useBackofficePaths } from '../config/BackofficeProvider';
import { useDeskScope } from '../desk/scope';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

import { useViewMeta } from './view-meta';
import type { AnyDoc } from './view-meta';
import { ViewError, ViewLoading, ViewUnsupported } from './ViewStates';

// The `one` compiler breaks explicit JSX generics — instantiate once.
// SAFETY: FrappeTreeView is generic over its doc type; this pins that parameter to AnyDoc.
const TreeOfDoc = FrappeTreeView as (props: FrappeTreeViewProps<AnyDoc>) => ReactElement;

export interface TreeViewProps {
  /** Proper-cased doctype name (e.g. "Note", "Sales Order") */
  doctype: string;
}

export const TreeView = ({ doctype }: TreeViewProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const deskScope = useDeskScope();
  const navigator = useBackofficeNavigator();
  const paths = useBackofficePaths();
  const { meta, isLoading: isMetaLoading, error: metaError } = useViewMeta(doctype);

  if (isMetaLoading) {
    return <ViewLoading />;
  }
  if (metaError && !meta) {
    return (
      <ViewError
        doctype={doctype}
        error={metaError}
      />
    );
  }

  if (meta && (meta.is_tree ?? 0) === 0) {
    return (
      <ViewUnsupported
        doctype={doctype}
        title={t('views.treeUnsupported', 'Tree not available')}
        description={t(
          'views.treeUnsupportedDetail',
          '{{doctype}} is not a tree doctype — try the list view instead.',
          { doctype },
        )}
      />
    );
  }

  return (
    <YStack flex={1}>
      <TreeOfDoc
        doctype={doctype}
        {...(deskScope.length > 0 && { filters: deskScope })}
        titleField={meta?.title_field}
        onNodeClick={(doc) => {
          const { name } = doc;
          if (name != null && name !== '') {
            navigator.navigate(paths.form(doctype, name));
          }
        }}
        // oxlint-disable-next-line react/no-unstable-nested-components -- render callback FrappeTreeView calls with the error, not a component type
        error={(err) => (
          <ViewError
            doctype={doctype}
            error={err}
          />
        )}
        flex={1}
      />
    </YStack>
  );
};
