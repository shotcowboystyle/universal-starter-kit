// Navbar help dropdown (docs, keyboard shortcuts dialog, about; desk parity).
//
// Desk parity items: Documentation, User Forum, Report an Issue (external,
// via the platform-split openUrl — web new tab / native Linking / GNOME Gio),
// Keyboard Shortcuts and About (dialogs, all platforms). Dialogs are mounted
// as siblings of the menu so they survive the menu closing.
//
// Catalog DropdownMenu (not a padded Popover of Buttons): SP-EDGE rows,
// LC-71 keyboard ring on the focused item, LC-21 COMMIT close-on-pick.
import { DropdownMenu } from '@repo/ui';
import { Button } from '@repo/forms';
import { openUrl } from '@repo/platform';
import { useResolvedKnobs } from '@repo/theme';
import { BookOpenIcon, BugIcon, ChatsCircleIcon, InfoIcon, KeyboardIcon, QuestionIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

import { HelpAboutDialog } from './help-about-dialog';
import { HelpShortcutsDialog } from './help-shortcuts-dialog';

const DOCUMENTATION_URL = 'https://docs.frappe.io';
const USER_FORUM_URL = 'https://discuss.frappe.io';
const REPORT_ISSUE_URL = 'https://github.com/frappe/frappe/issues';

export function HelpMenu() {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const iconSize = Number(knobProps.controlIcon?.width) || 16;
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const openLink = (url: string) => {
    openUrl(url, '_blank');
  };

  const openDialog = (setOpen: (open: boolean) => void) => {
    setOpen(true);
  };

  return (
    <>
      <DropdownMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        placement="bottom-end">
        <DropdownMenu.Trigger asChild>
          <Button
            chromeless
            circular
            size={knobProps.sizeToken}
            icon={QuestionIcon}
            aria-label={t('help.label', 'Help')}
            data-testid="backoffice-help-trigger"
          />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          minWidth={220}
          data-testid="backoffice-help-menu">
          <DropdownMenu.Item
            icon={<BookOpenIcon size={iconSize} />}
            onSelect={() => {
              openLink(DOCUMENTATION_URL);
            }}
            data-testid="backoffice-help-documentation">
            {t('help.documentation', 'Documentation')}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            icon={<ChatsCircleIcon size={iconSize} />}
            onSelect={() => {
              openLink(USER_FORUM_URL);
            }}
            data-testid="backoffice-help-forum">
            {t('help.userForum', 'User Forum')}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            icon={<BugIcon size={iconSize} />}
            onSelect={() => {
              openLink(REPORT_ISSUE_URL);
            }}
            data-testid="backoffice-help-report-issue">
            {t('help.reportIssue', 'Report an Issue')}
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item
            icon={<KeyboardIcon size={iconSize} />}
            onSelect={() => {
              openDialog(setShortcutsOpen);
            }}
            data-testid="backoffice-help-shortcuts">
            {t('help.keyboardShortcuts', 'Keyboard Shortcuts')}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            icon={<InfoIcon size={iconSize} />}
            onSelect={() => {
              openDialog(setAboutOpen);
            }}
            data-testid="backoffice-help-about">
            {t('help.about', 'About')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>
      <HelpShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />
      <HelpAboutDialog
        open={aboutOpen}
        onOpenChange={setAboutOpen}
      />
    </>
  );
}
