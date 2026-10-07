/**
 * useFrappeForm is FrappeForm's own state, handed to its caller (MPO-15
 * AC2): a page renders the fields with `<FrappeForm form={controller} />`
 * and builds its chrome on the same controller, so the desk and a bare
 * FrappeForm run one engine. A new record also starts from the doctype's
 * defaults, the way desk create_new seeds it.
 */

import { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { Text } from 'tamagui';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { assetLoanLifecycleFixtures } from '../tests/fixtures/assetLoanLifecycle';

import { setCreatePrefill } from './formEngine/createPrefill';
import { FrappeForm } from './FrappeForm';
import { FrappeProvider } from './FrappeProvider';
import type { FieldOverride } from './schemaForm';
import { useFrappeForm } from './useFrappeForm';
import type { FrappeFormController } from './useFrappeForm';

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    interpolation: { escapeValue: false },
    resources: { en: { translation: {} } },
  });
});

let confirm: ReturnType<typeof vi.fn>;

beforeEach(() => {
  confirm = vi.fn(() => true);
  vi.stubGlobal('confirm', confirm);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Doc = Record<string, unknown> & { name: string; doctype: string };

const probe: FieldOverride = (props) => {
  const name = props.fieldMeta?.name ?? '';
  const value = props.value === undefined || props.value === null ? '' : String(props.value);
  return <Text testID={`probe-${name}`}>{`val=${value} err=${props.error ?? ''}`}</Text>;
};

const ticketMeta = {
  name: 'Desk Ticket',
  doctype: 'DocType',
  autoname: 'hash',
  fields: [
    { fieldname: 'subject', fieldtype: 'Data', label: 'Subject', required: 1 },
    { fieldname: 'status', fieldtype: 'Select', label: 'Status', options: 'Open\nClosed' },
    { fieldname: 'priority', fieldtype: 'Data', label: 'Priority', default: 'Medium' },
    { fieldname: 'more_tab', fieldtype: 'Tab Break', label: 'More' },
    { fieldname: 'resolution', fieldtype: 'Data', label: 'Resolution', required: 1 },
  ],
  permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
};

const ticketOverrides = { subject: probe, status: probe, priority: probe, resolution: probe };

function ticketFixtures() {
  return new InMemoryFixtureProvider({
    DocType: [ticketMeta],
    'Desk Ticket': [{ name: 'TICKET-1', doctype: 'Desk Ticket', subject: 'Printer', status: 'Open' }],
  });
}

let controller: FrappeFormController<Doc> | undefined;

function Host({ doctype, name }: { doctype: string; name?: string }) {
  const form = useFrappeForm<Doc>({ doctype, name, roles: ['Loan Manager', 'All'] });
  controller = form;
  return (
    <>
      <button
        type="button"
        data-testid="host-validate"
        onClick={() => {
          revealFirst(form);
        }}>
        validate
      </button>
      <button
        type="button"
        data-testid="host-submit"
        onClick={() => void form.submitDocument()}>
        submit
      </button>
      <FrappeForm<Doc>
        form={form}
        doctype={doctype}
        name={name}
        overrides={{ ...ticketOverrides, employee_name: probe }}
        showToolbar={false}
        showSidebar={false}
        showTimeline={false}
        showBanners={false}
      />
    </>
  );
}

function revealFirst(form: FrappeFormController<Doc>) {
  const errors = form.validate();
  form.setErrors(errors);
  Object.keys(errors).some((field) => form.revealField(field));
}

async function expectProbe(field: string, text: string): Promise<void> {
  await waitFor(() => {
    expect(screen.getByTestId(`probe-${field}`).textContent).toContain(text);
  });
}

describe("FrappeForm seeds a new record from the doctype's defaults", () => {
  it("a Data default and a Select's first option fill in", async () => {
    renderWithProviders(
      <FrappeProvider
        baseURL="http://test"
        fixtures={ticketFixtures()}>
        <FrappeForm
          doctype="Desk Ticket"
          overrides={ticketOverrides}
          showSidebar={false}
        />
      </FrappeProvider>,
    );
    await expectProbe('status', 'val=Open');
    await expectProbe('priority', 'val=Medium');
    await expectProbe('subject', 'val=');
  });

  it('a stashed draft (?d=, Duplicate, Amend) wins over the defaults', async () => {
    setCreatePrefill('Desk Ticket', { priority: 'High', subject: 'From the list' });
    renderWithProviders(
      <FrappeProvider
        baseURL="http://test"
        fixtures={ticketFixtures()}>
        <FrappeForm
          doctype="Desk Ticket"
          overrides={ticketOverrides}
          showSidebar={false}
        />
      </FrappeProvider>,
    );
    await expectProbe('priority', 'val=High');
    await expectProbe('subject', 'val=From the list');
    await expectProbe('status', 'val=Open');
  });
});

describe('a caller-owned FrappeForm', () => {
  it('renders the fields without its own toolbar and lays out the same tabs', async () => {
    renderWithProviders(
      <FrappeProvider
        baseURL="http://test"
        fixtures={ticketFixtures()}>
        <Host
          doctype="Desk Ticket"
          name="TICKET-1"
        />
      </FrappeProvider>,
    );
    await expectProbe('subject', 'val=Printer');
    expect(screen.queryByText('Save')).toBeNull();
    expect(controller?.fieldTargets.map((field) => [field.name, field.tabKey])).toEqual([
      ['subject', '__details'],
      ['status', '__details'],
      ['priority', '__details'],
      ['resolution', 'more_tab'],
    ]);
  });

  it('reveals the tab a failing required field sits on', async () => {
    renderWithProviders(
      <FrappeProvider
        baseURL="http://test"
        fixtures={ticketFixtures()}>
        <Host
          doctype="Desk Ticket"
          name="TICKET-1"
        />
      </FrappeProvider>,
    );
    await expectProbe('subject', 'val=Printer');
    expect(screen.queryByTestId('probe-resolution')).toBeNull();
    fireEvent.click(screen.getByTestId('host-validate'));
    await expectProbe('resolution', 'err=Resolution is required');
    expect(controller?.activeTab).toBe('more_tab');
  });

  it("submits without FrappeForm's own confirm, so the host owns the question", async () => {
    const fixtures = assetLoanLifecycleFixtures();
    renderWithProviders(
      <FrappeProvider
        baseURL="http://test"
        fixtures={fixtures}>
        <Host
          doctype="Asset Loan"
          name="LOAN-DRAFT"
        />
      </FrappeProvider>,
    );
    await expectProbe('employee_name', 'val=Ada Lovelace');
    await waitFor(() => {
      expect(controller?.rights.submit).toBe(true);
    });
    fireEvent.click(screen.getByTestId('host-submit'));
    await waitFor(async () => {
      expect((await fixtures.getDoc('Asset Loan', 'LOAN-DRAFT'))?.docstatus).toBe(1);
    });
    await waitFor(() => {
      expect(controller?.docstatus).toBe(1);
    });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("save resolves with the created record's name", async () => {
    const fixtures = ticketFixtures();
    renderWithProviders(
      <FrappeProvider
        baseURL="http://test"
        fixtures={fixtures}>
        <Host doctype="Desk Ticket" />
      </FrappeProvider>,
    );
    await expectProbe('priority', 'val=Medium');
    act(() => {
      controller?.setValue('subject', 'Scanner');
      controller?.setValue('resolution', 'Rebooted');
    });
    await waitFor(() => {
      expect(controller?.doc.subject).toBe('Scanner');
    });
    let saved: string | undefined;
    await act(async () => {
      saved = await controller?.save();
    });
    expect(saved).toBeTruthy();
    const created = await fixtures.getDoc('Desk Ticket', String(saved));
    expect(created).toMatchObject({ subject: 'Scanner', priority: 'Medium', status: 'Open' });
  });
});
