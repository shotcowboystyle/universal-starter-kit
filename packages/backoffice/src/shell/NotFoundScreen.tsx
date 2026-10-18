/**
 * Unmatched-path surface (audit R-2i): any backoffice path that matches no
 * route pattern (deep or malformed links). Same presentation as the
 * SlugScreen unknown-slug state, plus a way back to the default workspace.
 */
import { Button, EmptyState } from '@repo/ui';
import { useTranslation } from 'react-i18next';

import { useBackofficeLocation, useBackofficeNavigator, useBackofficePaths } from '../config/BackofficeProvider';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

export const NotFoundScreen = () => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const navigator = useBackofficeNavigator();
  const paths = useBackofficePaths();
  const location = useBackofficeLocation();

  return (
    <EmptyState
      title={t('notFound', 'Not found')}
      description={location.path || undefined}
      action={
        <Button
          onPress={() => {
            navigator.replace(paths.home());
          }}>
          {t('notFoundGoHome', 'Go to workspaces')}
        </Button>
      }
    />
  );
};
