/**
 * The "{base}/[slug]" surface: resolves a router slug to a workspace page
 * or a doctype list at runtime (frappe's slugs are ambiguous by design).
 * Route params stay in the host's route adapter — this screen takes plain
 * props so it mounts outside any navigation container (stories/tests).
 */
import { EmptyState, Spinner, YStack } from '@repo/ui';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import { DoctypeListScreen } from '../list/DoctypeListScreen';
import { useSlugTarget } from '../shared/use-slug-target';
import { WorkspaceScreen } from '../workspace/WorkspaceScreen';

export interface SlugScreenProps {
  /** The raw route slug ("sales-order", "build", …). */
  slug?: string;
  /** The list `?f=` filters passthrough (JSON filter tuples). */
  filtersParam?: string;
  /** The list `?sort=` passthrough (`<fieldname>.<asc|desc>`). */
  sortParam?: string;
}

export const SlugScreen = ({ slug, filtersParam, sortParam }: SlugScreenProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const target = useSlugTarget(slug);

  if (target.status === 'loading') {
    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center">
        <Spinner size="large" />
      </YStack>
    );
  }
  if (target.status === 'not-found') {
    return (
      <EmptyState
        title={t('notFound', 'Not found')}
        description={target.slug}
      />
    );
  }
  if (target.kind === 'workspace') {
    return <WorkspaceScreen workspace={target.workspace} />;
  }
  return (
    <DoctypeListScreen
      doctype={target.doctype}
      filtersParam={filtersParam}
      sortParam={sortParam}
    />
  );
};
