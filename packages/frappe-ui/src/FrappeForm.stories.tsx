import { InMemoryFixtureProvider } from '@repo/frappe';
import { action } from '@repo/storybook';
import { YStack } from 'tamagui';

import { Check } from './fields/Check';
import { Data } from './fields/Data';
import { Date as DateField } from './fields/Date';
import { Numeric } from './fields/Numeric';
import { RadioGroupField } from './fields/RadioGroup';
import { Select } from './fields/Select';
import { FrappeStoryProvider, LiveToDoGate } from './frappe-story-target';
import { FrappeForm } from './FrappeForm';
import { FrappeProvider } from './FrappeProvider';

export default {
  title: 'FrappeUI/FrappeForm',
  component: FrappeForm,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Form over useFrappeCollection / useLiveQuery (edit) + useDocTypeMeta. Stories use InMemoryFixtureProvider so create/edit hit the live collection path against fixtures.',
      },
    },
  },
};

const MOCK_HOST = 'https://frappeform.mock.test';
const ERR_HOST = 'https://frappeform-error.mock.test';
const PENDING_HOST = 'https://pending.frappeform.mock.test';
const GUEST_HOST = 'https://guest.frappeform.mock.test';

/** The Frappe response envelopes the mock bench answers with. */
interface MockBody {
  data?: unknown;
  message?: unknown;
  exc_type?: string;
}

const jsonResponse = (body: MockBody, status = 200): Response => Response.json(body, { status });

const requestUrl = (input: RequestInfo | URL): string => {
  if (input instanceof URL) {
    return input.toString();
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- discriminates fetch's declared `string | Request` input union
  return typeof input === 'string' ? input : input.url;
};

const contactMeta = () => ({
  name: 'Contact',
  module: 'Contacts',
  title_field: 'first_name',
  fields: [
    { fieldname: 'main_section', fieldtype: 'Section Break', label: 'Details' },
    { fieldname: 'first_name', fieldtype: 'Data', label: 'First Name', required: 1 },
    { fieldname: 'last_name', fieldtype: 'Data', label: 'Last Name', required: 1 },
    { fieldname: 'email', fieldtype: 'Data', label: 'Email', required: 1 },
    { fieldname: 'phone', fieldtype: 'Data', label: 'Phone' },
    {
      fieldname: 'status',
      fieldtype: 'Select',
      label: 'Status',
      // >5 options: shorter single-select lists trip `select-too-few-options` (DG-CTRL-01).
      options: 'Active\nLead\nProspect\nCustomer\nInactive\nArchived',
    },
  ],
  permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
});

const salesOrderMeta = () => ({
  name: 'SalesOrder',
  module: 'Selling',
  title_field: 'customer',
  fields: [
    { fieldname: 'main_section', fieldtype: 'Section Break', label: 'Details' },
    { fieldname: 'customer', fieldtype: 'Data', label: 'Customer', required: 1 },
    { fieldname: 'order_date', fieldtype: 'Date', label: 'Order Date', required: 1 },
    { fieldname: 'total_amount', fieldtype: 'Currency', label: 'Total Amount' },
    {
      fieldname: 'status',
      fieldtype: 'Select',
      label: 'Status',
      // >5 options: shorter single-select lists trip `select-too-few-options` (DG-CTRL-01).
      options: 'Draft\nSubmitted\nIn Progress\nOn Hold\nCompleted\nCancelled',
    },
    { fieldname: 'is_paid', fieldtype: 'Check', label: 'Payment Received' },
    { fieldname: 'notes', fieldtype: 'Small Text', label: 'Notes' },
  ],
  permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
});

interface Contact {
  name: string;
  doctype: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  status: string;
}

const contactFixtures: Contact[] = [
  {
    name: 'CONTACT-001',
    doctype: 'Contact',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    phone: '555-0100',
    status: 'Active',
  },
  {
    name: 'CONTACT-002',
    doctype: 'Contact',
    first_name: 'Jane',
    last_name: 'Smith',
    email: 'jane@example.com',
    phone: '555-0101',
    status: 'Lead',
  },
];

const guestResponse = (urlStr: string): Response => {
  const url = new URL(urlStr);
  if (url.pathname === '/api/method/frappe.desk.form.load.getdoctype') {
    return jsonResponse({ exc_type: 'PermissionError', message: 'Sign in to read the Contact form' }, 403);
  }
  if (url.pathname.startsWith('/api/resource/Contact')) {
    if (urlStr.includes('CONTACT-PRIVATE')) {
      return jsonResponse({ exc_type: 'PermissionError', message: 'Not permitted' }, 403);
    }
    const record = { ...contactFixtures[0], owner: 'Administrator' };
    return jsonResponse({ data: url.pathname.endsWith('/Contact') ? [record] : record });
  }
  return jsonResponse({ data: [], message: [] });
};

(() => {
  // SAFETY: the flag is an optional property this module alone sets on window
  const w = window as Window & { __frappeFormMockFetch?: boolean };
  if (w.__frappeFormMockFetch === true) {
    return;
  }
  w.__frappeFormMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = requestUrl(input);
    if (urlStr.startsWith(PENDING_HOST)) {
      // oxlint-disable-next-line promise/avoid-new, eslint/no-empty-function -- a fetch that never settles holds the story in its pending state
      return await new Promise<Response>(() => {});
    }
    if (urlStr.startsWith(ERR_HOST)) {
      return jsonResponse({ message: 'DocType meta unavailable' }, 500);
    }
    if (urlStr.startsWith(GUEST_HOST)) {
      return guestResponse(urlStr);
    }
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      const metaMatch = /^\/api\/resource\/DocType\/(?<doctype>.+)$/u.exec(url.pathname);
      if (metaMatch) {
        const doctype = decodeURIComponent(metaMatch[1]);
        if (doctype === 'SalesOrder') {
          return jsonResponse({ data: salesOrderMeta() });
        }
        return jsonResponse({ data: contactMeta() });
      }
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

export const CreateForm = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ Contact: contactFixtures })}>
    <FrappeForm<Contact>
      doctype="Contact"
      onSave={action('onSave')}
      onCancel={action('onCancel')}>
      {({ doc, setValue, errors }) => (
        <YStack
          gap="$3"
          width={400}>
          <Data
            label="First Name"
            value={doc.first_name ?? ''}
            onChange={(v) => {
              setValue('first_name', v);
            }}
            required
            error={errors.first_name}
          />
          <Data
            label="Last Name"
            value={doc.last_name ?? ''}
            onChange={(v) => {
              setValue('last_name', v);
            }}
            required
            error={errors.last_name}
          />
          <Data
            label="Email"
            value={doc.email ?? ''}
            onChange={(v) => {
              setValue('email', v);
            }}
            required
            error={errors.email}
          />
          <Data
            label="Phone"
            value={doc.phone ?? ''}
            onChange={(v) => {
              setValue('phone', v);
            }}
          />
          <Select
            label="Status"
            value={doc.status ?? ''}
            onChange={(v) => {
              setValue('status', v);
            }}
            options={['Active', 'Lead', 'Prospect', 'Customer', 'Inactive', 'Archived']}
          />
        </YStack>
      )}
    </FrappeForm>
  </FrappeProvider>
);
CreateForm.parameters = {
  docs: {
    description: {
      story: 'Form for creating a new Contact document.',
    },
  },
};

CreateForm.storyName = 'Main';
export const EditForm = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ Contact: contactFixtures })}>
    <FrappeForm<Contact>
      doctype="Contact"
      name="CONTACT-001"
      onSave={action('onSave')}
      onCancel={action('onCancel')}>
      {({ doc, setValue, errors }) => (
        <YStack
          gap="$3"
          width={400}>
          <Data
            label="First Name"
            value={doc.first_name ?? ''}
            onChange={(v) => {
              setValue('first_name', v);
            }}
            required
            error={errors.first_name}
          />
          <Data
            label="Last Name"
            value={doc.last_name ?? ''}
            onChange={(v) => {
              setValue('last_name', v);
            }}
            required
            error={errors.last_name}
          />
          <Data
            label="Email"
            value={doc.email ?? ''}
            onChange={(v) => {
              setValue('email', v);
            }}
            required
            error={errors.email}
          />
          <Data
            label="Phone"
            value={doc.phone ?? ''}
            onChange={(v) => {
              setValue('phone', v);
            }}
          />
          <Select
            label="Status"
            value={doc.status ?? ''}
            onChange={(v) => {
              setValue('status', v);
            }}
            options={['Active', 'Lead', 'Prospect', 'Customer', 'Inactive', 'Archived']}
          />
        </YStack>
      )}
    </FrappeForm>
  </FrappeProvider>
);
EditForm.parameters = {
  docs: {
    description: {
      story: 'Form for editing an existing Contact document.',
    },
  },
};

interface Order {
  name: string;
  doctype: string;
  customer: string;
  order_date: string;
  total_amount: number;
  status: string;
  is_paid: boolean;
  notes: string;
}

const orderFixtures: Order[] = [
  {
    name: 'ORD-001',
    doctype: 'SalesOrder',
    customer: 'CUST-001',
    order_date: '2026-01-20',
    total_amount: 1500,
    status: 'Draft',
    is_paid: false,
    notes: '',
  },
];

/**
 * Meta fetch never resolves — the schema-mode loading state (W9 / DG-ST-02).
 * Renders a spinner panel, not a skeleton form (LC-20 nuance, see
 * p-results/state-triplet-coverage.md).
 */
export const Loading = () => (
  <FrappeProvider baseURL={PENDING_HOST}>
    <FrappeForm<Contact>
      doctype="Contact"
      onSave={action('onSave')}
      onCancel={action('onCancel')}
    />
  </FrappeProvider>
);

/** Meta fetch fails — schema mode surfaces the form-level error branch (SB-M-916). */
export const MetaError = () => (
  <FrappeProvider
    baseURL={ERR_HOST}
    fixtures={new InMemoryFixtureProvider({ Contact: [] })}>
    <FrappeForm<Contact>
      doctype="Contact"
      onSave={action('onSave')}
      onCancel={action('onCancel')}
    />
  </FrappeProvider>
);
MetaError.parameters = {
  docs: {
    description: {
      story: 'DocType meta fetch failure shows an error state instead of an empty editable form.',
    },
  },
};

/**
 * LC-96: a reader the bench refuses meta to, on a record they may read. The
 * form lays out the record's own fields, read-only, with no actions.
 */
export const GuestRecord = () => (
  <FrappeProvider
    baseURL={GUEST_HOST}
    realtime={false}>
    <FrappeForm<Contact>
      doctype="Contact"
      name="CONTACT-001"
      showSidebar={false}
      showTimeline={false}
    />
  </FrappeProvider>
);

/** LC-96: the same reader on a create page. Nothing to create from, so it says so. */
export const GuestCreate = () => (
  <FrappeProvider
    baseURL={GUEST_HOST}
    realtime={false}>
    <FrappeForm<Contact> doctype="Contact" />
  </FrappeProvider>
);

/** LC-96: the same reader on a record they may not read either. */
export const GuestRecordRefused = () => (
  <FrappeProvider
    baseURL={GUEST_HOST}
    realtime={false}>
    <FrappeForm<Contact>
      doctype="Contact"
      name="CONTACT-PRIVATE"
      showSidebar={false}
      showTimeline={false}
    />
  </FrappeProvider>
);

/** Named doc missing from fixtures — surfaces not-found (SB-M-916). */
export const DocNotFound = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ Contact: contactFixtures })}>
    <FrappeForm<Contact>
      doctype="Contact"
      name="MISSING-001"
      onSave={action('onSave')}
      onCancel={action('onCancel')}
    />
  </FrappeProvider>
);
DocNotFound.parameters = {
  docs: {
    description: {
      story: 'Missing document name shows a not-found state instead of an empty editable form.',
    },
  },
};

export const ComplexForm = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ SalesOrder: orderFixtures })}>
    <FrappeForm<Order>
      doctype="SalesOrder"
      name="ORD-001"
      onSave={action('onSave')}
      onCancel={action('onCancel')}>
      {({ doc, setValue, errors }) => (
        <YStack
          gap="$3"
          width={500}>
          <Data
            label="Customer"
            value={doc.customer ?? ''}
            onChange={(v) => {
              setValue('customer', v);
            }}
            required
            error={errors.customer}
          />
          <DateField
            label="Order Date"
            type="date"
            value={doc.order_date ?? ''}
            onChange={(v) => {
              setValue('order_date', v);
            }}
            required
          />
          <Numeric
            label="Total Amount"
            type="Currency"
            currencySymbol="$"
            value={doc.total_amount}
            onChange={(v) => {
              setValue('total_amount', v);
            }}
          />
          <Select
            label="Status"
            value={doc.status ?? ''}
            onChange={(v) => {
              setValue('status', v);
            }}
            options={['Draft', 'Submitted', 'In Progress', 'On Hold', 'Completed', 'Cancelled']}
          />
          <Check
            label="Payment Received"
            value={doc.is_paid ?? false}
            onChange={(v) => {
              setValue('is_paid', v);
            }}
          />
          <Data
            label="Notes"
            type="long_text"
            value={doc.notes ?? ''}
            onChange={(v) => {
              setValue('notes', v);
            }}
            placeholder="Add any additional notes..."
          />
        </YStack>
      )}
    </FrappeForm>
  </FrappeProvider>
);
ComplexForm.parameters = {
  docs: {
    description: {
      story: 'A more complex form with multiple field types including dates, numbers, selects, and checkboxes.',
    },
  },
};

// ---------------------------------------------------------------------------
// oxlint-disable-next-line sonarjs/todo-tag -- names the Frappe doctype, not a task marker
// Live bench story — real ToDo document over the live data path
// ---------------------------------------------------------------------------

interface LiveToDo {
  name: string;
  doctype: string;
  description: string;
  status: string;
  priority: string;
}

const liveFormFixtures = new InMemoryFixtureProvider({
  ToDo: [
    {
      name: 'TODO-LIVE-001',
      doctype: 'ToDo',
      description: 'Fixture fallback todo (bench unreachable)',
      status: 'Open',
      priority: 'Medium',
    },
  ],
});

/**
 * Live edit form against the real bench (STORYBOOK_FRAPPE_URL, default the
 * local dev bench proxied by the Storybook dev server) on Frappe's stock to-do
 * doctype. External edits to the open doc patch fields in place; edits the
 * user has dirty are preserved and flagged via the conflict banner;
 * `doc_deleted` for the open doc renders the read-only deleted banner. The
 * `name` arg selects the document (harnesses pass the real doc name via URL
 * args). When live with no arg, {@link LiveToDoGate} resolves a real to-do
 * (TODO-LIVE-001 if present, else the first readable row, else a seeded one)
 * so the story does not 404 on a hash-named doctype. Falls back to fixtures
 * when the bench is down.
 */
export const Live = (args: { name?: string }) => (
  <FrappeStoryProvider fixtures={liveFormFixtures}>
    <LiveToDoGate name={args.name}>
      {(name) => (
        <FrappeForm<LiveToDo>
          doctype="ToDo"
          name={name}
          fields={['name', 'description', 'status', 'priority']}
          onSave={action('onSave')}
          onCancel={action('onCancel')}>
          {({ doc, setValue, errors, disabled }) => (
            <YStack
              gap="$3"
              width={420}>
              <Data
                label="Description"
                value={doc.description ?? ''}
                onChange={(v) => {
                  setValue('description', v);
                }}
                error={errors.description}
                disabled={disabled}
              />
              {/* The real ToDo doctype pins 3-option enums; DG-CTRL-01 routes short
                  single choices to RadioGroup, so the live arm composes the honest
                  control instead of tripping `select-too-few-options` at rest. */}
              <RadioGroupField
                label="Status"
                value={doc.status ?? ''}
                onChange={(v) => {
                  setValue('status', v);
                }}
                options={[
                  { label: 'Open', value: 'Open' },
                  { label: 'Closed', value: 'Closed' },
                  { label: 'Cancelled', value: 'Cancelled' },
                ]}
                disabled={disabled}
              />
              <RadioGroupField
                label="Priority"
                value={doc.priority ?? ''}
                onChange={(v) => {
                  setValue('priority', v);
                }}
                options={[
                  { label: 'Low', value: 'Low' },
                  { label: 'Medium', value: 'Medium' },
                  { label: 'High', value: 'High' },
                ]}
                disabled={disabled}
              />
            </YStack>
          )}
        </FrappeForm>
      )}
    </LiveToDoGate>
  </FrappeStoryProvider>
);
Live.args = { name: '' };
Live.argTypes = { name: { control: 'text' } };
Live.parameters = {
  docs: {
    description: {
      story:
        'Live ToDo edit form over the real bench: realtime doc_update patches clean fields in place, dirty fields are preserved with an honest conflict banner, doc_deleted renders the read-only deleted state. Opens a real bench ToDo (TODO-LIVE-001 when present, else the first readable row / a seeded one) so the live arm is not a 404 on a hash-named doctype. Fixture fallback when the bench is down. DocShare 403 for an ordinary Desk User is expected — the form still renders; Administrator sees live shares.',
    },
  },
};
