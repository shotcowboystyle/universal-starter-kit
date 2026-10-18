// Shared honest-state chrome for the alternate views: loading, error, and
// "this view is not supported for this doctype" — each with a way back to
// the list view (desk parity: unsupported views bounce you to list).

import { ListBulletsIcon } from '@phosphor-icons/react';
import { Button } from '@repo/forms';
import { EmptyState, Spinner, YStack } from '@repo/ui';
import { useTranslation } from 'react-i18next';

import { useBackofficeNavigator, useBackofficePaths } from '../config/BackofficeProvider';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

export const ViewLoading = () => (
  <YStack
    flex={1}
    alignItems="center"
    justifyContent="center">
    <Spinner size="large" />
  </YStack>
);

export const BackToListButton = ({ doctype }: { doctype: string }) => {
  const navigator = useBackofficeNavigator();
  const paths = useBackofficePaths();
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  return (
    <Button
      size="$3"
      icon={ListBulletsIcon}
      onPress={() => {
        navigator.navigate(paths.list(doctype));
      }}>
      {t('views.backToList', 'Back to list')}
    </Button>
  );
};

export interface ViewUnsupportedProps {
  doctype: string;
  title: string;
  description?: string;
}

/** Graceful "view not supported for this doctype" empty state. */
export const ViewUnsupported = ({ doctype, title, description }: ViewUnsupportedProps) => (
  <EmptyState
    title={title}
    description={description}
    action={<BackToListButton doctype={doctype} />}
  />
);

export interface ViewErrorProps {
  doctype: string;
  error: Error;
}

export const ViewError = ({ doctype, error }: ViewErrorProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  return (
    <EmptyState
      intent="error"
      title={t('views.loadFailed', "Couldn't load this view")}
      description={error.message}
      action={<BackToListButton doctype={doctype} />}
    />
  );
};
