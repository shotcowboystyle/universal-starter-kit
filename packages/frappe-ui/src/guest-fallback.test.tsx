// LC-96 (MPO-15 AC10): a data-aware view degrades to the weakest honest
// rendering, never a blank. The bench below refuses getdoctype the way Frappe
// refuses it to Guest, answers or refuses the record reads per test, and
// refuses or breaks a query report's run. Each rung of the ladder is one test:
// meta refused but the rows readable, the record refused too, nothing to
// create from, and a read that failed for some other reason, for the form, the
// list and both report views.
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { frappeRouteTarget } from './frappe-navigation';
import type { FrappeNavigation } from './frappe-navigation';
import { FrappeForm } from './FrappeForm';
import { FrappeListView } from './FrappeListView';
import { FrappeProvider } from './FrappeProvider';
import { FrappeReportBuilder } from './FrappeReportBuilder';
import { FrappeReportView } from './FrappeReportView';

const doctype = 'Poke Move';
const route = '/moves';

interface Move {
  name: string;
  doctype: string;
  move_name?: string;
  power?: number;
}

const tackle = {
  name: 'a1b2c3',
  doctype,
  owner: 'Administrator',
  modified: '2026-09-29 10:00:00',
  docstatus: 0,
  idx: 0,
  _user_tags: null,
  move_name: 'tackle',
  power: 40,
  accuracy: 0.95,
};

const settle = { timeout: 8000 };

let run = 0;
let bench = '';
let metaAnswer: 'refused' | 'broken' = 'refused';
let recordsReadable = true;
let reportRun: 'refused' | 'broken' = 'refused';
const reportName = 'Move Usage';

/** The Frappe response envelopes this bench answers with. */
interface BenchBody {
  data?: unknown;
  message?: unknown;
  exc_type?: string;
  exception?: string;
  _server_messages?: string;
}

const json = (body: BenchBody, status = 200) => Response.json(body, { status });

const stubBench = () => {
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const method = url.pathname.replace(/^\/api\/method\//u, '');
    if (method === 'frappe.desk.form.load.getdoctype') {
      return metaAnswer === 'refused'
        ? json({ exc_type: 'PermissionError', exception: 'Not permitted' }, 403)
        : json({ exc_type: 'ValidationError', exception: 'Poke Move is being migrated' }, 417);
    }
    if (method === 'frappe.desk.query_report.run') {
      return reportRun === 'refused'
        ? json(
            {
              exc_type: 'PermissionError',
              _server_messages: JSON.stringify([
                JSON.stringify({ message: `You don't have access to Report: ${reportName}` }),
              ]),
            },
            403,
          )
        : json({ exc_type: 'ValidationError', exception: 'Move Usage timed out' }, 417);
    }
    if (method === 'frappe.auth.get_logged_user' || method.endsWith('.get_roles')) {
      return json({ exc_type: 'PermissionError' }, 403);
    }
    const resource = `/api/resource/${encodeURIComponent(doctype)}`;
    if (url.pathname === resource || url.pathname.startsWith(`${resource}/`)) {
      if (!recordsReadable) {
        return json({ exc_type: 'PermissionError', exception: 'Not permitted' }, 403);
      }
      return url.pathname === resource ? json({ data: [tackle] }) : json({ data: tackle });
    }
    return json({ data: [], message: [] });
  });
};

const renderAt = (pathname: string, page: 'list' | 'form') => {
  const navigation: FrappeNavigation = {
    usePathname: () => pathname,
    useNavigate: () => () => {},
  };
  return renderWithProviders(
    <FrappeProvider
      baseURL={bench}
      realtime={false}
      navigation={navigation}>
      {page === 'list' ? (
        <FrappeListView<Move>
          doctype={doctype}
          route={route}
          defaultViewMode="table"
        />
      ) : (
        <FrappeForm<Move>
          doctype={doctype}
          route={route}
        />
      )}
    </FrappeProvider>,
  );
};

// oxlint-disable-next-line vitest/require-top-level-describe -- shared setup/teardown for every describe block in this file
beforeAll(async () => {
  // oxlint-disable-next-line import/no-named-as-default-member -- the named `use` export is unbound; i18next.use needs the instance as `this`
  await i18next.use(initReactI18next).init({
    lng: 'en',
    interpolation: { escapeValue: false },
    resources: { en: { translation: {} } },
  });
});

// oxlint-disable-next-line vitest/require-top-level-describe -- shared setup/teardown for every describe block in this file
beforeEach(() => {
  run += 1;
  bench = `http://guest-fallback-${run}.spec.test`;
  metaAnswer = 'refused';
  recordsReadable = true;
  reportRun = 'refused';
  stubBench();
});

// oxlint-disable-next-line vitest/require-top-level-describe -- shared setup/teardown for every describe block in this file
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('LC-96 guest fallback: meta refused, rows readable', () => {
  it("a record page lays out the record's own fields, read-only", async () => {
    expect(frappeRouteTarget(route, '/moves/a1b2c3')).toStrictEqual({ mode: 'view', name: 'a1b2c3' });
    renderAt('/moves/a1b2c3', 'form');
    const power = await screen.findByLabelText('Power', { exact: false }, settle);
    const input = power instanceof HTMLInputElement ? power : power.querySelector('input');
    expect(input?.value).toBe('40');
    expect(input?.disabled ?? input?.readOnly).toBe(true);
    expect(screen.getByLabelText('Accuracy', { exact: false })).toBeTruthy();
    for (const bookkeeping of ['Owner', 'Modified', 'Docstatus', 'Idx', 'User Tags']) {
      expect(screen.queryByLabelText(bookkeeping, { exact: true })).toBeNull();
    }
  });

  it('a list table takes its columns from one record instead of a lone Name', async () => {
    renderAt('/moves', 'list');
    await waitFor(() => {
      expect(screen.getAllByText('tackle').length).toBeGreaterThan(0);
    }, settle);
    await waitFor(() => {
      expect(screen.getByText('Move Name')).toBeTruthy();
    }, settle);
    expect(screen.getByText('Power')).toBeTruthy();
    expect(screen.queryByText('Owner')).toBeNull();
  });
});

describe('LC-96 guest fallback: nothing readable to fall back to', () => {
  it("a create page says the reader can't create, with the server's reason, not a load failure", async () => {
    renderAt('/moves/new', 'form');
    const state = await screen.findByTestId('frappe-form-not-permitted', {}, settle);
    expect(state.textContent).toContain(`You can't create ${doctype}`);
    expect(screen.queryByText(`Failed to load ${doctype} form`)).toBeNull();
  });

  it("a record page whose record is refused too says the reader can't open it, with no retry", async () => {
    recordsReadable = false;
    renderAt('/moves/a1b2c3', 'form');
    const state = await screen.findByTestId('frappe-form-not-permitted', {}, settle);
    expect(state.textContent).toContain(`You can't open ${doctype} a1b2c3`);
    expect(screen.queryByText(`Failed to load ${doctype}`)).toBeNull();
    expect(screen.queryByRole('button', { name: /retry/iu })).toBeNull();
  });

  it('a meta read that failed for another reason is an error state, not a permission one', async () => {
    metaAnswer = 'broken';
    renderAt('/moves/new', 'form');
    const alert = await screen.findByText(`Failed to load ${doctype} form`, {}, settle);
    expect(alert).toBeTruthy();
    expect(screen.queryByTestId('frappe-form-not-permitted')).toBeNull();
  });
});

const renderReport = (view: 'builder' | 'query') =>
  renderWithProviders(
    <FrappeProvider
      baseURL={bench}
      realtime={false}>
      {view === 'builder' ? (
        <FrappeReportBuilder doctype={doctype} />
      ) : (
        <FrappeReportView
          reportName={reportName}
          debounceMs={0}
        />
      )}
    </FrappeProvider>,
  );

describe('LC-96 guest fallback: report views', () => {
  it('a doctype report takes its columns from one record and saves nothing', async () => {
    renderReport('builder');
    await waitFor(() => {
      expect(screen.getAllByText('tackle').length).toBeGreaterThan(0);
    }, settle);
    expect(screen.getByText('Move Name')).toBeTruthy();
    expect(screen.getByText('Power')).toBeTruthy();
    expect(screen.getByText('Accuracy')).toBeTruthy();
    expect(screen.queryByText('Owner')).toBeNull();
    expect(screen.queryByText(/Couldn't load/u)).toBeNull();
    expect(screen.queryByRole('button', { name: /save as/iu })).toBeNull();
  });

  it("a doctype report whose rows are refused too says the reader can't open it, with no retry", async () => {
    recordsReadable = false;
    renderReport('builder');
    const state = await screen.findByTestId('frappe-report-not-permitted', {}, settle);
    expect(state.textContent).toContain(`You can't open the ${doctype} report`);
    expect(screen.queryByRole('button', { name: /retry/iu })).toBeNull();
  });

  it('a doctype report whose meta failed for another reason stays an error', async () => {
    metaAnswer = 'broken';
    renderReport('builder');
    await expect(screen.findByText(`Couldn't load the ${doctype} report`, {}, settle)).resolves.toBeTruthy();
    expect(screen.queryByTestId('frappe-report-not-permitted')).toBeNull();
  });

  it("a refused query report says the reader can't run it, with the server's reason and no retry", async () => {
    renderReport('query');
    const state = await screen.findByTestId('frappe-report-not-permitted', {}, settle);
    expect(state.textContent).toContain(`You can't run ${reportName}`);
    expect(state.textContent).toContain(`You don't have access to Report: ${reportName}`);
    expect(screen.queryByRole('button', { name: /retry|refresh/iu })).toBeNull();
  });

  it('a query report that failed for another reason stays a retryable error', async () => {
    reportRun = 'broken';
    renderReport('query');
    await expect(screen.findByText(`Error running ${reportName}`, {}, settle)).resolves.toBeTruthy();
    expect(screen.queryByTestId('frappe-report-not-permitted')).toBeNull();
    expect(screen.getByRole('button', { name: /retry/iu })).toBeTruthy();
  });
});
