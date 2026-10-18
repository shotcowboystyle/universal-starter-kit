// Navbar avatar menu (session user, my settings, toggle theme, logout;
// desk parity). Theme toggling rides the provider's `appearance` adapter —
// hosts without one get a disabled item (GJS/story parity). The logout and
// theme items are individually gated by the userMenu capability config.
import { Button } from '@repo/forms';
import { useFrappeConfig } from '@repo/frappe-ui';
import { useResolvedKnobs } from '@repo/theme';
import { Avatar, DropdownMenu, SizableText, YStack, isWeb } from '@repo/ui';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import {
  useBackofficeCapabilities,
  useBackofficeConfig,
  useBackofficeNavigator,
  useBackofficePaths,
} from '../config/BackofficeProvider';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import { useFrappeApp } from '../shared/use-frappe-app';

import { clearSessionUserCache, useSessionUserInfo } from './user-session';

export interface UserMenuProps {
  /** Open the menu on mount (stories/tests only). */
  defaultOpen?: boolean;
}

/** Avatar one step below the trigger button's size token. */
const avatarSizeFor = (sizeToken: string) => {
  if (sizeToken === '$5') {
    return '$3';
  }
  if (sizeToken === '$3') {
    return '$1';
  }
  return '$2';
};

// oxlint-disable-next-line eslint/complexity -- flat list of capability-gated menu items; each gate is one branch
export const UserMenu = ({ defaultOpen }: UserMenuProps = {}) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const navigator = useBackofficeNavigator();
  const paths = useBackofficePaths();
  const { appearance } = useBackofficeConfig();
  const { userMenu } = useBackofficeCapabilities();
  const app = useFrappeApp();
  const frappeConfig = useFrappeConfig();
  const { info } = useSessionUserInfo();
  const sessionUser = info?.user;

  const handleLogout = useCallback(async () => {
    try {
      await app?.auth().logout();
    } catch {
      // Best effort: even when the bench rejects the call (expired session,
      // network), still clear local state and leave the desk.
    }
    // Cache clear scope: this package's session-user cache only. The frappe
    // `sid` cookie is invalidated server-side by /api/method/logout itself.
    clearSessionUserCache();
    navigator.replace(paths.home());
  }, [app, navigator, paths]);

  const handleLogoutSelect = useCallback(() => {
    void handleLogout();
  }, [handleLogout]);

  const handleOpenOwnUser = useCallback(() => {
    if (sessionUser !== undefined && sessionUser !== '') {
      navigator.navigate(paths.form('User', sessionUser));
    }
  }, [navigator, paths, sessionUser]);

  const handleReload = useCallback(() => {
    if (typeof location !== 'undefined' && 'reload' in location) {
      location.reload();
    }
  }, []);

  const websiteURL = frappeConfig?.baseURL ?? '';
  const handleViewWebsite = useCallback(() => {
    if (websiteURL !== '' && typeof window !== 'undefined' && 'open' in window) {
      window.open(websiteURL, '_blank', 'noopener,noreferrer');
    }
  }, [websiteURL]);

  const handleToggleTheme = useCallback(() => {
    if (!appearance) {
      return;
    }
    appearance.setScheme(appearance.scheme === 'dark' ? 'light' : 'dark');
  }, [appearance]);

  const { exitToSite } = userMenu;
  const handleExitToSite = useCallback(() => {
    navigator.navigate(exitToSite.path);
  }, [navigator, exitToSite.path]);

  const sessionGate =
    sessionUser !== undefined && sessionUser !== ''
      ? {}
      : {
          disabled: true,
          disabledReason: t('userMenu.sessionUnavailable', 'Session not loaded'),
        };

  const themeGate = appearance
    ? {}
    : {
        disabled: true,
        disabledReason: t('userMenu.themeUnavailable', 'Theme switching is unavailable on this platform'),
      };

  return (
    <DropdownMenu
      placement="bottom-end"
      defaultOpen={defaultOpen}>
      <DropdownMenu.Trigger asChild>
        <Button
          chromeless
          circular
          size={knobProps.sizeToken}
          aria-label={t('userMenu.label', 'User menu')}>
          <Avatar
            size={avatarSizeFor(knobProps.sizeToken)}
            src={info?.imageUrl}
            name={info?.fullName ?? info?.user}
          />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content minWidth={240}>
        {info ? (
          <>
            <YStack
              {...knobProps.panelPadding}
              {...knobProps.gap}
              paddingVertical="$2">
              <SizableText
                {...knobProps.label}
                fontWeight="400"
                numberOfLines={1}>
                {info.fullName}
              </SizableText>
              {info.email !== undefined && info.email !== '' ? (
                <SizableText
                  size="$2"
                  color="$color10"
                  numberOfLines={1}>
                  {info.email}
                </SizableText>
              ) : null}
            </YStack>
            <DropdownMenu.Separator />
          </>
        ) : null}
        <DropdownMenu.Item
          {...sessionGate}
          onSelect={handleOpenOwnUser}>
          {t('userMenu.myProfile', 'My Profile')}
        </DropdownMenu.Item>
        <DropdownMenu.Item
          {...sessionGate}
          onSelect={handleOpenOwnUser}>
          {t('userMenu.mySettings', 'My Settings')}
        </DropdownMenu.Item>
        {/* GAP: desk's Session Defaults dialog (frappe.core.doctype.session_default_settings)
            has no backoffice surface yet — placeholder until a dialog exists. */}
        <DropdownMenu.Item
          disabled
          disabledReason={t('userMenu.sessionDefaultsGap', 'Not implemented yet')}>
          {t('userMenu.sessionDefaults', 'Session Defaults')}
        </DropdownMenu.Item>
        {isWeb ? <DropdownMenu.Item onSelect={handleReload}>{t('userMenu.reload', 'Reload')}</DropdownMenu.Item> : null}
        {userMenu.themeToggle ? (
          <DropdownMenu.Item
            {...themeGate}
            onSelect={handleToggleTheme}>
            {t('userMenu.toggleTheme', 'Toggle Theme')}
          </DropdownMenu.Item>
        ) : null}
        {isWeb && websiteURL !== '' ? (
          <DropdownMenu.Item onSelect={handleViewWebsite}>
            {t('userMenu.viewWebsite', 'View Website')}
          </DropdownMenu.Item>
        ) : null}
        {/* MOD-02: embedded shells are full-bleed (no host navbar), so the
            way back into the host app lives here. */}
        {isWeb && exitToSite.enabled ? (
          <DropdownMenu.Item onSelect={handleExitToSite}>
            {exitToSite.label ?? t('userMenu.exitToSite', '← universal starter kit')}
          </DropdownMenu.Item>
        ) : null}
        {userMenu.logout ? (
          <>
            <DropdownMenu.Separator />
            <DropdownMenu.Item onSelect={handleLogoutSelect}>{t('userMenu.logOut', 'Log Out')}</DropdownMenu.Item>
          </>
        ) : null}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};
