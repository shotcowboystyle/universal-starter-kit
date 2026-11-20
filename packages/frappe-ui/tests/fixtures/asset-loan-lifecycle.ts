/**
 * "Asset Loan": a submittable fixture doctype with one document per
 * docstatus state, for the FrappeForm lifecycle specs and stories.
 *
 * Roles: Loan Manager holds every right; Loan Officer submits but neither
 * cancels nor amends; Loan Clerk only saves; Auditor has no permission row.
 * LOAN-REDONE already has a live amendment (LOAN-REDONE-1), so Amend is
 * disabled on it.
 */
import { InMemoryFixtureProvider } from '@repo/frappe';

const ASSET_LOAN = 'Asset Loan';

const assetLoanMeta = {
  name: ASSET_LOAN,
  doctype: 'DocType',
  module: 'Assets',
  is_submittable: 1,
  fields: [
    { fieldname: 'employee_name', fieldtype: 'Data', label: 'Employee Name', required: 1 },
    { fieldname: 'serial_no', fieldtype: 'Data', label: 'Serial No' },
    { fieldname: 'remarks', fieldtype: 'Data', label: 'Remarks', allow_on_submit: 1 },
    {
      fieldname: 'amended_from',
      fieldtype: 'Link',
      label: 'Amended From',
      options: ASSET_LOAN,
      read_only: 1,
      no_copy: 1,
    },
  ],
  permissions: [
    {
      role: 'Loan Manager',
      permlevel: 0,
      read: 1,
      write: 1,
      create: 1,
      delete: 1,
      submit: 1,
      cancel: 1,
      amend: 1,
    },
    { role: 'Loan Officer', permlevel: 0, read: 1, write: 1, create: 1, submit: 1 },
    { role: 'Loan Clerk', permlevel: 0, read: 1, write: 1, create: 1 },
  ],
};

const loan = (name: string, docstatus: number, values: Record<string, string> = {}) => ({
  name,
  doctype: ASSET_LOAN,
  docstatus,
  ...values,
});

/** A fresh corpus per call, so one spec's writes never leak into the next. */
export const assetLoanLifecycleFixtures = (): InMemoryFixtureProvider =>
  new InMemoryFixtureProvider({
    DocType: [assetLoanMeta],
    [ASSET_LOAN]: [
      loan('LOAN-DRAFT', 0, { employee_name: 'Ada Lovelace', serial_no: 'SN-1' }),
      loan('LOAN-UNNAMED', 0, { serial_no: 'SN-2' }),
      loan('LOAN-SUBMITTED', 1, { employee_name: 'Grace Hopper', serial_no: 'SN-3' }),
      loan('LOAN-CANCELLED', 2, {
        employee_name: 'Katherine Johnson',
        serial_no: 'SN-4',
        remarks: 'Wrong serial',
      }),
      loan('LOAN-REDONE', 2, { employee_name: 'Dorothy Vaughan', serial_no: 'SN-5' }),
      loan('LOAN-REDONE-1', 0, { employee_name: 'Dorothy Vaughan', serial_no: 'SN-5', amended_from: 'LOAN-REDONE' }),
    ],
  });
