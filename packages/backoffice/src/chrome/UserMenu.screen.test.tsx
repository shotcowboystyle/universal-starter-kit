// The navbar user menu (MPO-414): the session header, profile routing, the
// theme toggle through the host appearance adapter, and logout.
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import type { BackofficeProviderProps } from '../config/BackofficeProvider';
import { createMemoryNavigator } from '../navigation/navigator';

import { UserMenu } from './UserMenu';

let host = 0;
let loggedUser: string | null = 'jane@example.com';
let calls: string[] = [];

type Json = string | number | boolean | null | Json[] | JsonObject;
interface JsonObject {
  [key: string]: Json | undefined;
}

const json = (body: Json, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'content-type': 'application/json' },
  });

const renderMenu = (props: Partial<BackofficeProviderProps> = {}) => {
  const navigation = createMemoryNavigator('/backoffice/todo');
  renderWithProviders(
    <BackofficeProvider
      frappe={{ baseURL: `https://user-menu-${host}.screen.spec.test` }}
      navigation={navigation}
      {...props}>
      <UserMenu defaultOpen />
    </BackofficeProvider>,
  );
  return navigation;
};

const item = (label: string): HTMLElement => {
  const found = [...document.querySelectorAll('[role="menuitem"]')].find((node) => node.textContent?.startsWith(label));
  if (!found) {
    throw new Error(`no menu item ${label}`);
  }
  return found as HTMLElement;
};

describe(UserMenu, () => {
  beforeEach(() => {
    host += 1;
    calls = [];
    loggedUser = 'jane@example.com';
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      calls.push(url.pathname);
      if (url.pathname === '/api/method/frappe.auth.get_logged_user') {
        return loggedUser !== null && loggedUser !== ''
          ? json({ message: loggedUser })
          : json({ exc_type: 'Forbidden' }, 403);
      }
      if (url.pathname === '/api/method/frappe.client.get_value') {
        return json({
          message: { full_name: 'Jane Cooper', email: 'jane@example.com', user_image: null },
        });
      }
      if (url.pathname === '/api/method/logout') {
        return json({ message: '' });
      }
      return json({ data: [] });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('heads the menu with the session user and routes My Profile to their User form', async () => {
    const navigation = renderMenu();
    await expect(screen.findByText('Jane Cooper')).resolves.toBeTruthy();
    expect(screen.getByText('jane@example.com')).toBeTruthy();
    fireEvent.click(item('My Profile'));
    expect(navigation.getLocation().path).toBe('/backoffice/user/jane%40example.com');
  });

  it('disables the profile items while no session user resolves', async () => {
    loggedUser = null;
    renderMenu();
    await waitFor(() => {
      expect(calls).toContain('/api/method/frappe.auth.get_logged_user');
    });
    await waitFor(() => {
      expect(item('My Profile').getAttribute('aria-disabled')).toBe('true');
    });
    expect(item('My Settings').getAttribute('aria-disabled')).toBe('true');
    expect(screen.queryByText('Jane Cooper')).toBeNull();
  });

  it('toggles the scheme through the host appearance adapter', async () => {
    const setScheme = vi.fn<(scheme: 'light' | 'dark' | 'system') => void>();
    renderMenu({ appearance: { scheme: 'dark', setScheme } });
    await screen.findByText('Jane Cooper');
    fireEvent.click(item('Toggle Theme'));
    expect(setScheme).toHaveBeenCalledWith('light');
  });

  it('offers no theme toggle a host cannot honor', async () => {
    renderMenu();
    await screen.findByText('Jane Cooper');
    expect(item('Toggle Theme').getAttribute('aria-disabled')).toBe('true');
  });

  it('logs out on the bench and leaves for the desk home', async () => {
    const navigation = renderMenu();
    await screen.findByText('Jane Cooper');
    fireEvent.click(item('Log Out'));
    await waitFor(() => {
      expect(navigation.getLocation().path).toBe('/backoffice');
    });
    expect(calls).toContain('/api/method/logout');
  });
});
