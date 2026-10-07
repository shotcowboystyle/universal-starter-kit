// DocFormScreen's permission fallback (MPO-390). When docinfo carries no
// usable permissions (a new record, or a token-auth bench answering
// {"null": 0}) the screen used to union every role's DocPerm rows, so any
// reader got an editable form and Save. It now resolves the session's roles.
// The form body is FrappeForm's (MPO-15 AC2), so a reader asking for a new
// record meets FrappeForm's not-permitted state, as desk refuses new_doc.
import { renderWithProviders } from '@repo/test-utils';
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import { createMemoryNavigator } from '../navigation/navigator';

import { DocFormScreen } from './DocFormScreen';

const doctype = 'Poke Move';

const meta = {
  name: doctype,
  doctype: 'DocType',
  title_field: 'move_name',
  fields: [{ fieldname: 'move_name', fieldtype: 'Data', label: 'Move Name' }],
  permissions: [
    { role: 'Pokemon Editor', read: 1, write: 1, create: 1, delete: 1 },
    { role: 'Guest', read: 1 },
  ],
};

const tackle = {
  name: 'a1b2c3',
  doctype,
  owner: 'Administrator',
  modified: '2026-09-27 00:00:00.000000',
  docstatus: 0,
  move_name: 'tackle',
};

let run = 0;
let roles: string[] = [];
let sessionAnswered = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  run += 1;
  sessionAnswered = false;
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const method = url.pathname.replace(/^\/api\/method\//, '');
    if (method === 'frappe.auth.get_logged_user') {
      return json({ message: 'user@pokemon.test' });
    }
    if (method === 'frappe.core.doctype.user.user.get_roles') {
      sessionAnswered = true;
      return json({ message: roles });
    }
    if (method === 'frappe.desk.form.load.getdoctype') {
      return json({ docs: [meta] });
    }
    if (method === 'frappe.desk.form.load.getdoc') {
      return json({ docs: [tackle], docinfo: { permissions: { null: 0 } } });
    }
    if (method === 'frappe.desk.form.load.get_docinfo') {
      return json({ docinfo: { permissions: { null: 0 } } });
    }
    const resource = `/api/resource/${encodeURIComponent(doctype)}`;
    if (url.pathname === `${resource}/a1b2c3`) {
      return json({ data: tackle });
    }
    if (url.pathname === resource) {
      return json({ data: [tackle] });
    }
    return json({ data: [], message: [] });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderForm(name: string) {
  return renderWithProviders(
    <BackofficeProvider
      frappe={{ baseURL: `https://form-rights-${run}.spec.test` }}
      navigation={createMemoryNavigator('/backoffice')}>
      <DocFormScreen
        doctype={doctype}
        name={name}
      />
    </BackofficeProvider>,
  );
}

function saveButton(): HTMLElement | undefined {
  return [...document.querySelectorAll('[role="button"], button')].find(
    (node) => node.textContent?.trim() === 'Save',
  ) as HTMLElement | undefined;
}

function moveNameInput(): HTMLInputElement {
  const field = screen.getByLabelText('Move Name', { exact: false });
  return (field instanceof HTMLInputElement ? field : field.querySelector('input'))!;
}

async function settle() {
  await waitFor(
    () => {
      expect(sessionAnswered).toBe(true);
    },
    { timeout: 5000 },
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

describe('DocFormScreen rights without docinfo permissions', () => {
  it('lets an editor save a new record', async () => {
    roles = ['Pokemon Editor', 'Guest'];
    renderForm('new');
    await waitFor(
      () => {
        expect(saveButton()).toBeTruthy();
      },
      { timeout: 5000 },
    );
    expect(moveNameInput().disabled || moveNameInput().readOnly).toBe(false);
  });

  it("tells a reader they can't create one, with no Save", async () => {
    roles = ['Guest'];
    renderForm('new');
    await waitFor(
      () => {
        expect(screen.getByTestId('frappe-form-not-permitted')).toBeTruthy();
      },
      {
        timeout: 5000,
      },
    );
    await settle();
    expect(saveButton()).toBeUndefined();
    expect(screen.queryByLabelText('Move Name', { exact: false })).toBeNull();
  });

  it('gives a reader an existing record read-only', async () => {
    roles = ['Guest'];
    renderForm('a1b2c3');
    await waitFor(
      () => {
        expect(moveNameInput().value).toBe('tackle');
      },
      { timeout: 5000 },
    );
    await settle();
    expect(moveNameInput().disabled || moveNameInput().readOnly).toBe(true);
  });
});
