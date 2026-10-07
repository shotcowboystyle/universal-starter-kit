import { Avatar, DropdownMenu, SizableText, YStack, isWeb } from '@repo/ui';
import { Button } from '@repo/forms';
import { useFrappeConfig } from '@repo/frappe-ui';
import { useResolvedKnobs } from '@repo/theme';
// Navbar avatar menu (session user, my settings, toggle theme, logout;
// desk parity). Theme toggling rides the provider's `appearance` adapter —
// hosts without one get a disabled item (GJS/story parity). The logout and
// theme items are individually gated by the userMenu capability config.
import React from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import {
  useBackofficeCapabilities,
  useBackofficeConfig,
  useBackofficeNavigator,
  useBackofficePaths,
} from '../config/BackofficeProvider';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import { useFrappeApp } from '../shared/useFrappeApp';

import { clearSessionUserCache, useSessionUserInfo } from './user-session';

export interface UserMenuProps {
  /** Open the menu on mount (stories/tests only). */
  defaultOpen?: boolean;
}

export function UserMenu({ defaultOpen }: UserMenuProps = {}) {
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

  const handleReload = useCallback(() => {
    if (typeof location !== 'undefined' && typeof location.reload === 'function') {
      location.reload();
    }
  }, []);

  const websiteURL = frappeConfig?.baseURL;
  const handleViewWebsite = useCallback(() => {
    if (websiteURL && typeof window !== 'undefined' && typeof window.open === 'function') {
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

  const sessionGate = sessionUser
    ? {}
    : {
        disabled: true,
        disabledReason: t('userMenu.sessionUnavailable', 'Session not loaded'),
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
            size={knobProps.sizeToken === '$5' ? '$3' : knobProps.sizeToken === '$3' ? '$1' : '$2'}
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
              {info.email ? (
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
          onSelect={() => sessionUser && navigator.navigate(paths.form('User', sessionUser))}>
          {t('userMenu.myProfile', 'My Profile')}
        </DropdownMenu.Item>
        <DropdownMenu.Item
          {...sessionGate}
          onSelect={() => sessionUser && navigator.navigate(paths.form('User', sessionUser))}>
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
            {...(appearance
              ? {}
              : {
                  disabled: true,
                  disabledReason: t('userMenu.themeUnavailable', 'Theme switching is unavailable on this platform'),
                })}
            onSelect={handleToggleTheme}>
            {t('userMenu.toggleTheme', 'Toggle Theme')}
          </DropdownMenu.Item>
        ) : null}
        {isWeb && websiteURL ? (
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
            <DropdownMenu.Item onSelect={handleLogout}>{t('userMenu.logOut', 'Log Out')}</DropdownMenu.Item>
          </>
        ) : null}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
