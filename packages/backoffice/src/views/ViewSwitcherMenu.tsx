// Compact view-switcher menu for list + alternate-view headers.
//
// Desk's ListViewSelect (frappe/public/js/frappe/list/list_view_select.js)
// is a dropdown with a lucide icon per view — never a fused ToggleGroup of
// every offered view. The catalog ViewSwitcher is fine for 2–3 options
// (calendar month/week/day, Pokemon image/list); seven doctype views as
// segments dominated the toolbar. This is the desk shape: one trigger
// showing the current view, the rest inside the menu, current check-marked.

import {
  CalendarBlankIcon,
  CaretDownIcon,
  ChartBarIcon,
  ImageIcon,
  KanbanIcon,
  ListBulletsIcon,
  SquaresFourIcon,
  TreeStructureIcon,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { Button } from '@repo/forms';
import { DropdownMenu } from '@repo/ui';
import type { DropdownMenuEntry } from '@repo/ui';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import type { BackofficeView } from '../navigation/paths';

/** Phosphor stand-ins for desk's ListViewSelect icon_map. */
const VIEW_ICONS: Record<BackofficeView, Icon> = {
  list: ListBulletsIcon,
  report: ChartBarIcon,
  kanban: KanbanIcon,
  calendar: CalendarBlankIcon,
  tree: TreeStructureIcon,
  image: ImageIcon,
  dashboard: SquaresFourIcon,
};

export const useViewLabels = (): Record<BackofficeView, string> => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  return {
    list: t('views.list', 'List'),
    report: t('views.report', 'Report'),
    kanban: t('views.kanban', 'Kanban'),
    calendar: t('views.calendar', 'Calendar'),
    tree: t('views.tree', 'Tree'),
    image: t('views.image', 'Image'),
    dashboard: t('views.dashboard', 'Dashboard'),
  };
};

export interface ViewSwitcherMenuProps {
  views: readonly BackofficeView[];
  current: BackofficeView;
  onViewChange: (view: BackofficeView) => void;
}

/**
 * Single-select dropdown of the views this doctype can actually render.
 * Hidden when there is nothing to switch to. The current view is always
 * check-marked; picking another fires `onViewChange`.
 */
export const ViewSwitcherMenu = ({ views, current, onViewChange }: ViewSwitcherMenuProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const labels = useViewLabels();
  if (views.length <= 1) {
    return null;
  }

  const items: DropdownMenuEntry[] = views.map((candidate) => {
    const ViewIcon = VIEW_ICONS[candidate];
    return {
      key: candidate,
      label: labels[candidate],
      icon: <ViewIcon size={16} />,
      checked: candidate === current,
      onSelect: () => {
        if (candidate !== current) {
          onViewChange(candidate);
        }
      },
    };
  });

  return (
    <DropdownMenu
      items={items}
      closeOnSelect
      placement="bottom-end">
      <Button
        size="$3"
        icon={VIEW_ICONS[current]}
        iconAfter={CaretDownIcon}
        aria-label={t('views.switchView', 'Switch view')}
        testID="list-view-switcher">
        {labels[current]}
      </Button>
    </DropdownMenu>
  );
};
