// Shared header for the alternate doctype views. Desk page-head parity
// (frappe/public/js/frappe/list/list_view.js setup_page_head): doctype as
// the page title, a single primary "New {doctype}" (desk "Add {doctype}"),
// and ListViewSelect as one dropdown — never a segment per view. Catalog
// PageHeader is the same primitive the list screen uses (LC-16).
import { PageHeader, YStack } from '@repo/ui';
import { Button } from '@repo/forms';
import { useDocRights, useFrappeConfig } from '@repo/frappe-ui';
import { useResolvedKnobs } from '@repo/theme';
import { ArrowSquareOutIcon, PlusIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';

import {
  useBackofficeCapabilities,
  useBackofficeConfig,
  useBackofficeNavigator,
  useBackofficePaths,
} from '../config/BackofficeProvider';
import { openInNewTab } from '../form/platformHooks';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import type { BackofficeView } from '../navigation/paths';
import { deskViewUrl } from '../shared/deskLinks';

import { deriveAvailableViews } from './viewAvailability';
import { useViewMeta } from './viewMeta';
import { ViewSwitcherMenu } from './ViewSwitcherMenu';

export { useViewLabels } from './ViewSwitcherMenu';

/**
 * Views this doctype can actually render, derived from meta by
 * `deriveAvailableViews` (viewAvailability.ts documents each view's desk
 * precondition). The provider's `capabilities.views.allow` gates the offer
 * list too. Conditional views stay hidden until meta confirms them;
 * `current` is always included so the switcher stays honest about where you
 * are (e.g. a deep link to /view/tree on a flat doctype, which renders its
 * own unsupported state).
 */
export function useAvailableViews(doctype: string, current?: BackofficeView): BackofficeView[] {
  const { meta } = useViewMeta(doctype);
  const { views } = useBackofficeCapabilities();
  return deriveAvailableViews(meta, { current, allow: views.enabled ? views.allow : [] });
}

export interface ViewHeaderProps {
  /** Proper-cased doctype name (e.g. "ToDo", "Sales Order") */
  doctype: string;
  view: BackofficeView;
}

export function ViewHeader({ doctype, view }: ViewHeaderProps) {
  const navigator = useBackofficeNavigator();
  const paths = useBackofficePaths();
  const { newDoc } = useBackofficeCapabilities();
  const { frappe } = useBackofficeConfig();
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const availableViews = useAvailableViews(doctype, view);
  const { meta } = useViewMeta(doctype);
  const { rights } = useDocRights(useFrappeConfig(), meta);
  // Desk counterpart of this exact view (fixture mode has no desk).
  const deskHref = frappe?.baseURL && !frappe.fixtures ? deskViewUrl(frappe.baseURL, doctype, view) : undefined;

  return (
    <YStack
      {...knobProps.panelPadding}
      paddingBottom={0}>
      <PageHeader
        title={doctype}
        actions={
          <>
            {deskHref ? (
              <Button
                size={knobProps.sizeToken}
                circular
                chromeless
                icon={ArrowSquareOutIcon}
                onPress={() => openInNewTab(deskHref)}
                aria-label={t('views.openInDesk', 'Open in Desk')}
              />
            ) : null}
            <ViewSwitcherMenu
              views={availableViews}
              current={view}
              onViewChange={(next) => {
                navigator.navigate(paths.view(doctype, next));
              }}
            />
            {newDoc.enabled && rights.create ? (
              <Button
                size={knobProps.sizeToken}
                accent
                icon={PlusIcon}
                onPress={() => {
                  navigator.navigate(paths.newDoc(doctype));
                }}
                aria-label={t('views.new', {
                  defaultValue: 'New {{doctype}}',
                  doctype,
                })}>
                {t('views.new', { defaultValue: 'New {{doctype}}', doctype })}
              </Button>
            ) : null}
          </>
        }
      />
    </YStack>
  );
}
