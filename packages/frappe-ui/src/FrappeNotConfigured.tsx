import { EmptyState, ListPageLayout, PageHeader } from '@repo/ui';
import { useTranslation } from 'react-i18next';

export interface FrappeNotConfiguredProps {
  doctype: string;
  /** A routed page keeps the page template, the doctype as its title. */
  page?: boolean;
}

/**
 * What a doctype's list or form shows when neither a bench URL nor a fixture
 * corpus is configured (a host built with Frappe off), in place of the view.
 */
export function FrappeNotConfigured({ doctype, page = false }: FrappeNotConfiguredProps) {
  const { t } = useTranslation();
  const state = (
    <EmptyState
      testID="frappe-not-configured"
      title={t('Frappe is not configured')}
      description={t("{{doctype}} can't load without a Frappe bench URL.", { doctype })}
    />
  );
  if (!page) {
    return state;
  }
  return (
    <ListPageLayout
      scroll={false}
      header={
        <PageHeader
          title={doctype}
          divider={false}
        />
      }>
      {state}
    </ListPageLayout>
  );
}
