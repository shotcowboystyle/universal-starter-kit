// The navbar bell over the Notification Log (MPO-414): unread badge, panel
// rows newest first, a row press routes to its document and marks it read.
import { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import { createMemoryNavigator } from '../navigation/navigator';

import { NotificationsButton } from './NotificationsButton';

const notifications = [
  {
    name: 'notif-0001',
    doctype: 'Notification Log',
    subject: '<b>Jane Doe</b> mentioned you in a comment on ToDo',
    type: 'Mention',
    document_type: 'ToDo',
    document_name: 'TODO-0001',
    read: 0,
    from_user: 'jane@example.com',
    creation: '2026-09-27 10:00:00',
  },
  {
    name: 'notif-0002',
    doctype: 'Notification Log',
    subject: '<b>Joe Smith</b> assigned a new task to you',
    type: 'Assignment',
    document_type: 'ToDo',
    document_name: 'TODO-0002',
    read: 0,
    from_user: 'joe@example.com',
    creation: '2026-09-27 09:00:00',
  },
  {
    name: 'notif-0003',
    doctype: 'Notification Log',
    subject: '<b>Administrator</b> shared a document with you',
    type: 'Share',
    document_type: 'Note',
    document_name: 'NOTE-0001',
    read: 1,
    from_user: 'Administrator',
    creation: '2026-09-26 08:00:00',
  },
];

let host = 0;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderBell(rows: typeof notifications) {
  host += 1;
  const navigation = createMemoryNavigator('/backoffice');
  renderWithProviders(
    <BackofficeProvider
      frappe={{
        baseURL: `https://notifications-${host}.screen.spec.test`,
        fixtures: new InMemoryFixtureProvider({ 'Notification Log': rows }),
      }}
      navigation={navigation}>
      <NotificationsButton />
    </BackofficeProvider>,
  );
  return navigation;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderLiveBell() {
  host += 1;
  const navigation = createMemoryNavigator('/backoffice');
  renderWithProviders(
    <BackofficeProvider
      frappe={{ baseURL: `https://notifications-live-${host}.screen.spec.test` }}
      navigation={navigation}>
      <NotificationsButton />
    </BackofficeProvider>,
  );
  return navigation;
}

function badgeCount(): string | undefined {
  const badge = document.querySelector('[data-badge="count"]');
  return badge?.textContent?.replaceAll(/\D/g, '');
}

function rows(): HTMLElement[] {
  return screen.queryAllByTestId('backoffice-notification-row');
}

describe(NotificationsButton, () => {
  it('badges the unread count and lists every row newest first', async () => {
    renderBell(notifications);
    await waitFor(() => {
      expect(badgeCount()).toBe('2');
    });
    fireEvent.click(screen.getByTestId('backoffice-notifications-button'));
    await waitFor(() => {
      expect(rows()).toHaveLength(3);
    });
    expect(rows().map((row) => row.getAttribute('aria-label'))).toEqual([
      'Jane Doe mentioned you in a comment on ToDo',
      'Joe Smith assigned a new task to you',
      'Administrator shared a document with you',
    ]);
  });

  it('routes a row press to its document and marks it read', async () => {
    const navigation = renderBell(notifications);
    await waitFor(() => {
      expect(badgeCount()).toBe('2');
    });
    fireEvent.click(screen.getByTestId('backoffice-notifications-button'));
    await waitFor(() => {
      expect(rows()).toHaveLength(3);
    });
    fireEvent.click(rows()[1]);
    expect(navigation.getLocation().path).toBe('/backoffice/todo/TODO-0002');
    await waitFor(() => {
      expect(badgeCount()).toBe('1');
    });
  });

  it('marks every row read from the panel header', async () => {
    renderBell(notifications);
    await waitFor(() => {
      expect(badgeCount()).toBe('2');
    });
    fireEvent.click(screen.getByTestId('backoffice-notifications-button'));
    const markAll = await screen.findByTestId('backoffice-notifications-mark-all');
    fireEvent.click(markAll);
    await waitFor(() => {
      expect(badgeCount()).toBeUndefined();
    });
  });

  it('tells the bench a live row was read', async () => {
    const markedRead: string[] = [];
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      const method = url.pathname.replace(/^\/api\/method\//, '');
      if (method === 'frappe.auth.get_logged_user') {
        return json({ message: 'jane@example.com' });
      }
      if (method === 'frappe.desk.doctype.notification_log.notification_log.mark_as_read') {
        markedRead.push(String(init?.body ?? ''));
        return json({ message: null });
      }
      if (url.pathname === '/api/resource/Notification%20Log') {
        return json({ data: notifications });
      }
      return json({ data: [] });
    });
    renderLiveBell();
    await waitFor(
      () => {
        expect(badgeCount()).toBe('2');
      },
      { timeout: 5000 },
    );
    fireEvent.click(screen.getByTestId('backoffice-notifications-button'));
    await waitFor(() => {
      expect(rows()).toHaveLength(3);
    });
    fireEvent.click(rows()[0]);
    await waitFor(() => {
      expect(markedRead).toHaveLength(1);
    });
    expect(markedRead[0]).toContain('notif-0001');
  });

  it('shows the empty state when the log has no rows', async () => {
    renderBell([]);
    fireEvent.click(screen.getByTestId('backoffice-notifications-button'));
    await expect(screen.findByText('No new notifications')).resolves.toBeTruthy();
    expect(rows()).toHaveLength(0);
    expect(badgeCount()).toBeUndefined();
  });
});
