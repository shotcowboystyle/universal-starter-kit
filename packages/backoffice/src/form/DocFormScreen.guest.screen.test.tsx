// LC-96 on the desk form (MPO-473). Signed out, pokemon's bench refuses
// getdoctype to Guest while Guest can still read the record, and the desk form
// stopped at its own "Could not load Pokemon" before FrappeForm could lay the
// record out. The bench below answers getdoctype the way Frappe's
// is_whitelisted refuses Guest (one message, a <details> summary and body) and
// answers or refuses the record per test.
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import { createMemoryNavigator } from '../navigation/navigator';

import { DocFormScreen } from './DocFormScreen';

type Json = string | number | boolean | null | Json[] | JsonObject;
interface JsonObject {
  [key: string]: Json;
}

const doctype = 'Poke Move';

const tackle = {
  name: 'a1b2c3',
  doctype,
  owner: 'Administrator',
  modified: '2026-09-29 10:00:00',
  docstatus: 0,
  idx: 0,
  move_name: 'tackle',
  power: 40,
};

const refusal = {
  message:
    '<details><summary>You are not permitted to access this resource. Login to access</summary>Function <strong>frappe.desk.form.load.getdoctype</strong> is not whitelisted.</details>',
  title: 'Method Not Allowed',
  indicator: 'red',
  raise_exception: 1,
};

const settle = { timeout: 8000 };

let run = 0;
let metaAnswer: 'refused' | 'broken' = 'refused';
let recordReadable = true;
let metaReads = 0;

const json = (body: Json, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'content-type': 'application/json' },
  });

const refused = () =>
  json(
    {
      exc_type: 'PermissionError',
      exception: `frappe.exceptions.PermissionError: ${refusal.message}`,
      _server_messages: JSON.stringify([JSON.stringify(refusal)]),
    },
    403,
  );

const renderForm = (name: string) =>
  renderWithProviders(
    <BackofficeProvider
      frappe={{ baseURL: `https://desk-form-guest-${run}.spec.test` }}
      navigation={createMemoryNavigator('/backoffice')}>
      <DocFormScreen
        doctype={doctype}
        name={name}
      />
    </BackofficeProvider>,
  );

const inputOf = (label: string): HTMLInputElement => {
  const field = screen.getByLabelText(label, { exact: false });
  return (field instanceof HTMLInputElement ? field : field.querySelector('input'))!;
};

const button = (label: string): HTMLElement | undefined =>
  [...document.querySelectorAll('[role="button"], button')].find((node) => node.textContent?.trim() === label) as
    | HTMLElement
    | undefined;

describe('DocFormScreen with DocType meta refused (LC-96)', () => {
  beforeEach(() => {
    run += 1;
    metaAnswer = 'refused';
    recordReadable = true;
    metaReads = 0;
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      const method = url.pathname.replace(/^\/api\/method\//u, '');
      if (method === 'frappe.desk.form.load.getdoctype') {
        metaReads += 1;
        return metaAnswer === 'refused'
          ? refused()
          : json({ exc_type: 'ValidationError', exception: 'Poke Move is being migrated' }, 417);
      }
      if (method.startsWith('frappe.')) {
        return refused();
      }
      const resource = `/api/resource/${encodeURIComponent(doctype)}`;
      if (url.pathname === resource || url.pathname.startsWith(`${resource}/`)) {
        if (!recordReadable) {
          return json({ exc_type: 'PermissionError', exception: 'Not permitted' }, 403);
        }
        return url.pathname === resource ? json({ data: [tackle] }) : json({ data: tackle });
      }
      return json({ data: [], message: [] });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("lays out the record's own fields read-only instead of stopping at 'Could not load'", async () => {
    renderForm('a1b2c3');
    await waitFor(() => {
      expect(inputOf('Power').value).toBe('40');
    }, settle);
    expect(inputOf('Power').disabled || inputOf('Power').readOnly).toBe(true);
    expect(inputOf('Move Name').value).toBe('tackle');
    expect(screen.queryByText(/Could not load/u)).toBeNull();
    expect(screen.queryByLabelText('Owner', { exact: true })).toBeNull();
    expect(button('Save')).toBeUndefined();
    expect(metaReads).toBe(1);
  });

  it('offers nothing that needs the refused meta or docinfo', async () => {
    renderForm('a1b2c3');
    await waitFor(() => {
      expect(inputOf('Power').value).toBe('40');
    }, settle);
    expect(screen.queryByText('Activity')).toBeNull();
    fireEvent.click(screen.getByTestId('form-toolbar-menu'));
    await waitFor(() => {
      expect(document.querySelectorAll('[role="menuitem"]').length).toBeGreaterThan(0);
    }, settle);
    const items = [...document.querySelectorAll('[role="menuitem"]')].map((node) => node.textContent ?? '');
    expect(items.some((label) => label.startsWith('Duplicate'))).toBe(false);
    expect(items.some((label) => label.startsWith('Delete'))).toBe(false);
  });

  it("says the reader can't open a record refused too, with no retry", async () => {
    recordReadable = false;
    renderForm('a1b2c3');
    const state = await screen.findByTestId('frappe-form-not-permitted', {}, settle);
    expect(state.textContent).toContain(`You can't open ${doctype} a1b2c3`);
    expect(screen.queryByText(/Could not load/u)).toBeNull();
    expect(screen.queryByRole('button', { name: /retry/iu })).toBeNull();
  });

  it("says the reader can't create, with each server message on its own line", async () => {
    renderForm('new');
    const state = await screen.findByTestId('frappe-form-not-permitted', {}, settle);
    expect(state.textContent).toContain(`You can't create ${doctype}`);
    const lines = [...state.querySelectorAll('p')].map((node) => node.textContent);
    expect(lines).toContain('You are not permitted to access this resource. Login to access');
    expect(lines).toContain('Function frappe.desk.form.load.getdoctype is not whitelisted.');
    expect(lines.some((line) => line?.includes('accessFunction'))).toBe(false);
    expect(button('Save')).toBeUndefined();
  });

  it('keeps a meta read that failed for another reason a retryable error', async () => {
    metaAnswer = 'broken';
    renderForm('a1b2c3');
    await waitFor(() => {
      expect(screen.getByText(/Poke Move is being migrated/u)).toBeTruthy();
    }, settle);
    expect(screen.queryByTestId('frappe-form-not-permitted')).toBeNull();
    const retry = screen.getByRole('button', { name: /retry/iu });
    fireEvent.click(retry);
    await waitFor(() => {
      expect(metaReads).toBe(2);
    }, settle);
  });
});
