/**
 * FrappeForm renders a doctype the way desk does (MPO-15 AC1, MPO-26 AC4).
 *
 * "Asset Loan" is a fixture doctype that uses every key the form engine
 * resolves: mandatory_depends_on, read_only_depends_on,
 * collapsible_depends_on, permlevel, set_only_once, fetch_from and
 * docstatus, plus a Tab Break and prompt naming. Each field is rendered
 * through an override probe that prints the props SchemaForm hands it, so
 * these specs assert FrappeForm's resolution rather than a field renderer.
 */

import { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { Text } from 'tamagui';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FrappeForm } from './FrappeForm';
import { FrappeProvider } from './FrappeProvider';
import type { FieldOverride } from './schemaForm';

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    interpolation: { escapeValue: false },
    resources: { en: { translation: {} } },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const APPROVED = 'eval:doc.status=="Approved"';

const assetLoanMeta = {
  name: 'Asset Loan',
  doctype: 'DocType',
  module: 'Assets',
  autoname: 'Prompt',
  is_submittable: 1,
  fields: [
    { fieldname: 'status', fieldtype: 'Select', label: 'Status', options: 'Draft\nApproved' },
    { fieldname: 'employee', fieldtype: 'Link', label: 'Employee', options: 'Employee' },
    {
      fieldname: 'employee_name',
      fieldtype: 'Data',
      label: 'Employee Name',
      fetch_from: 'employee.employee_name',
    },
    {
      fieldname: 'reason',
      fieldtype: 'Small Text',
      label: 'Reason',
      mandatory_depends_on: APPROVED,
    },
    {
      fieldname: 'approver_note',
      fieldtype: 'Data',
      label: 'Approver Note',
      read_only_depends_on: APPROVED,
    },
    { fieldname: 'serial_no', fieldtype: 'Data', label: 'Serial No', set_only_once: 1 },
    { fieldname: 'cost', fieldtype: 'Currency', label: 'Cost', permlevel: 1 },
    { fieldname: 'remarks', fieldtype: 'Data', label: 'Remarks', allow_on_submit: 1 },
    {
      fieldname: 'audit_section',
      fieldtype: 'Section Break',
      label: 'Audit',
      collapsible: 1,
      collapsible_depends_on: APPROVED,
    },
    { fieldname: 'audit_note', fieldtype: 'Data', label: 'Audit Note' },
    { fieldname: 'extra_tab', fieldtype: 'Tab Break', label: 'Extra' },
    { fieldname: 'extra_note', fieldtype: 'Data', label: 'Extra Note' },
  ],
  permissions: [
    { role: 'Loan Officer', permlevel: 0, read: 1, write: 1, create: 1 },
    { role: 'Loan Officer', permlevel: 1, read: 1, write: 0 },
    { role: 'Finance', permlevel: 0, read: 1, write: 1 },
    { role: 'Finance', permlevel: 1, read: 1, write: 1 },
    { role: 'Clerk', permlevel: 0, read: 1, write: 1 },
  ],
};

function corpus() {
  return new InMemoryFixtureProvider({
    DocType: [assetLoanMeta],
    Employee: [
      { name: 'EMP-1', doctype: 'Employee', employee_name: 'Ada Lovelace' },
      { name: 'EMP-2', doctype: 'Employee', employee_name: 'Grace Hopper' },
    ],
    'Asset Loan': [
      {
        name: 'LOAN-DRAFT',
        doctype: 'Asset Loan',
        docstatus: 0,
        status: 'Draft',
        employee: 'EMP-1',
        employee_name: 'Ada Lovelace',
        serial_no: 'SN-1',
        cost: 100,
      },
      {
        name: 'LOAN-APPROVED',
        doctype: 'Asset Loan',
        docstatus: 0,
        status: 'Approved',
        serial_no: 'SN-2',
      },
      {
        name: 'LOAN-SUBMITTED',
        doctype: 'Asset Loan',
        docstatus: 1,
        status: 'Approved',
        reason: 'Field work',
        serial_no: 'SN-3',
      },
    ],
  });
}

const probedFields = [
  'status',
  'employee',
  'employee_name',
  'reason',
  'approver_note',
  'serial_no',
  'cost',
  'remarks',
  'audit_note',
  'extra_note',
];

const probe: FieldOverride = (props) => {
  const name = props.fieldMeta?.name ?? '';
  const value = props.value === undefined || props.value === null ? '' : String(props.value);
  return (
    <>
      <Text testID={`probe-${name}`}>
        {`ro=${!!props.readOnly} req=${!!props.required} val=${value} err=${props.error ?? ''}`}
      </Text>
      <button
        type="button"
        data-testid={`set-${name}`}
        onClick={() => {
          props.onChange('EMP-2');
        }}>
        set
      </button>
    </>
  );
};

const overrides = Object.fromEntries(probedFields.map((field) => [field, probe]));

function renderForm(props: { name?: string; roles?: string[] } = {}) {
  return renderWithProviders(
    <FrappeProvider
      baseURL="http://test"
      fixtures={corpus()}>
      <FrappeForm
        doctype="Asset Loan"
        name={props.name}
        roles={props.roles}
        overrides={overrides}
        showSidebar={false}
        showTimeline={false}
      />
    </FrappeProvider>,
  );
}

/** The doc lands a render after the form mounts, so every read waits for it. */
async function expectProbe(field: string, text: string): Promise<void> {
  await waitFor(() => {
    expect(screen.getByTestId(`probe-${field}`).textContent).toContain(text);
  });
}

function isCollapsed(field: string): boolean {
  return screen.getByTestId(`probe-${field}`).closest('[aria-hidden="true"]') !== null;
}

describe('FrappeForm resolves a doctype through the desk form engine', () => {
  it('mandatory_depends_on makes a field required only while it holds', async () => {
    renderForm({ name: 'LOAN-APPROVED' });
    await expectProbe('reason', 'req=true');
    cleanup();

    renderForm({ name: 'LOAN-DRAFT' });
    await expectProbe('status', 'val=Draft');
    await expectProbe('reason', 'req=false');
  });

  it('save refuses an empty field that mandatory_depends_on made required', async () => {
    renderForm({ name: 'LOAN-APPROVED', roles: ['Loan Officer'] });
    await expectProbe('status', 'val=Approved');
    fireEvent.click(screen.getByText('Save'));
    await expectProbe('reason', 'err=Reason is required');
  });

  it('read_only_depends_on locks a field only while it holds', async () => {
    renderForm({ name: 'LOAN-APPROVED' });
    await expectProbe('approver_note', 'ro=true');
    cleanup();

    renderForm({ name: 'LOAN-DRAFT' });
    await expectProbe('status', 'val=Draft');
    await expectProbe('approver_note', 'ro=false');
  });

  it('set_only_once is editable on a new doc and read-only once saved', async () => {
    renderForm();
    await expectProbe('serial_no', 'ro=false');
    cleanup();

    renderForm({ name: 'LOAN-DRAFT' });
    await expectProbe('serial_no', 'ro=true');
  });

  it('permlevel hides a level the roles cannot read and locks one they cannot write', async () => {
    renderForm({ name: 'LOAN-DRAFT', roles: ['Clerk'] });
    await expectProbe('status', 'val=Draft');
    expect(screen.queryByTestId('probe-cost')).toBeNull();
    cleanup();

    renderForm({ name: 'LOAN-DRAFT', roles: ['Loan Officer'] });
    await expectProbe('cost', 'ro=true');
    cleanup();

    renderForm({ name: 'LOAN-DRAFT', roles: ['Finance'] });
    await expectProbe('status', 'val=Draft');
    await expectProbe('cost', 'ro=false');
  });

  it('permlevel without a role list is read-only, never hidden', async () => {
    renderForm({ name: 'LOAN-DRAFT' });
    await expectProbe('cost', 'ro=true');
  });

  it('fetch_from locks the target and fills it when the link changes', async () => {
    renderForm({ name: 'LOAN-DRAFT', roles: ['Finance'] });
    await expectProbe('employee_name', 'ro=true');
    await expectProbe('employee_name', 'val=Ada Lovelace');

    fireEvent.click(screen.getByTestId('set-employee'));
    await expectProbe('employee_name', 'val=Grace Hopper');
  });

  it('docstatus 1 makes every field read-only except allow_on_submit', async () => {
    renderForm({ name: 'LOAN-SUBMITTED', roles: ['Finance'] });
    await expectProbe('status', 'ro=true');
    await expectProbe('serial_no', 'ro=true');
    await expectProbe('remarks', 'ro=false');
  });

  it('collapsible_depends_on opens its section only while it holds', async () => {
    renderForm({ name: 'LOAN-DRAFT' });
    await expectProbe('status', 'val=Draft');
    expect(isCollapsed('audit_note')).toBe(true);
    cleanup();

    renderForm({ name: 'LOAN-APPROVED' });
    await expectProbe('status', 'val=Approved');
    await waitFor(() => {
      expect(isCollapsed('audit_note')).toBe(false);
    });
  });

  it('a Tab Break renders as a tab and its fields mount when it opens', async () => {
    renderForm({ name: 'LOAN-DRAFT' });
    await screen.findByTestId('probe-status');
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['Details', 'Extra']);

    fireEvent.click(screen.getByText('Extra'));
    await expectProbe('extra_note', 'ro=false');
  });

  it('a prompt-named doctype asks for the name and will not save without it', async () => {
    renderForm();
    await screen.findByTestId('probe-status');
    expect(screen.getByText('Name')).toBeTruthy();
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeTruthy();
    });
  });
});
