/**
 * Lands the user on their default workspace (desk parity): first private
 * workspace, else the first public workspace by sequence order. Rendered by
 * the backoffice home route ("{base}").
 */
import { EmptyState, Paragraph, Spinner, YStack } from '@repo/ui';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackofficeNavigator, useBackofficePaths } from '../config/BackofficeProvider';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

import { useDefaultWorkspace } from './useWorkspaces';

export function HomeRedirect() {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const navigator = useBackofficeNavigator();
  const paths = useBackofficePaths();
  const { workspace, isLoading } = useDefaultWorkspace();

  useEffect(() => {
    if (!workspace) {
      return;
    }
    const target = paths.workspace(workspace);
    // Host routers (one's included) can silently no-op a replace that fires
    // before their navigation container mounts — routine on warm reloads
    // where the cached workspace list resolves first, which stranded the
    // home route on its spinner (audit R-2ii). Retry until the location
    // actually moves off the path we started on; success normally unmounts
    // this screen, which clears the interval either way.
    const startPath = navigator.getLocation().path;
    const attempt = () => {
      if (navigator.getLocation().path !== startPath) {
        return;
      }
      try {
        navigator.replace(target);
      } catch {
        // navigation not ready yet — the interval retries
      }
    };
    attempt();
    const retry = setInterval(() => {
      if (navigator.getLocation().path !== startPath) {
        clearInterval(retry);
        return;
      }
      attempt();
    }, 250);
    return () => {
      clearInterval(retry);
    };
  }, [workspace, navigator, paths]);

  if (!isLoading && !workspace) {
    return (
      <EmptyState
        title={t('noWorkspacesTitle', 'No workspaces')}
        description={t('noWorkspacesDescription', 'No workspaces are visible for this account.')}
      />
    );
  }

  return (
    <YStack
      flex={1}
      alignItems="center"
      justifyContent="center"
      gap="$3">
      <Spinner size="large" />
      <Paragraph color="$color10">{t('loadingWorkspaces', 'Loading workspaces…')}</Paragraph>
    </YStack>
  );
}
