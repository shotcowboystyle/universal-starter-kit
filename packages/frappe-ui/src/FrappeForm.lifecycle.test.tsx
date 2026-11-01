/**
 * FrappeForm runs a submittable doctype's docstatus lifecycle the way desk
 * does (MPO-15 AC1): Save, Submit, Update, Cancel and Amend, one action at
 * a time, gated by the roles' submit/cancel/amend rights.
 *
 * The "Asset Loan" fixture (tests/fixtures/assetLoanLifecycle.ts) is a
 * submittable doctype with one document per state. Transitions are asserted
 * against the fixture corpus, which is what the form wrote.
 */

import type { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { useState } from 'react';
import { initReactI18next } from 'react-i18next';
import { Text } from 'tamagui';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { assetLoanLifecycleFixtures } from '../tests/fixtures/assetLoanLifecycle';

import { takeCreatePrefill } from './formEngine/create-prefill';
import type { FrappeNavigation } from './frappe-navigation';
import { FrappeForm } from './FrappeForm';
import type { FrappeFormProps } from './FrappeForm';
import { FrappeProvider } from './FrappeProvider';
import type { FieldOverride } from './schemaForm';

const corpus = assetLoanLifecycleFixtures;

const probe: FieldOverride = (props) => {
  const name = props.fieldMeta?.name ?? '';
  const value = props.value === undefined || props.value === null ? '' : String(props.value);
  return (
    <>
      <Text testID={`probe-${name}`}>
        {`ro=${!!props.readOnly} val=${value} err=${props.error ?? ''} off=${!!props.disabled}`}
      </Text>
      <button
        type="button"
        data-testid={`set-${name}`}
        onClick={() => {
          props.onChange('edited');
        }}>
        set
      </button>
    </>
  );
};

const overrides = { employee_name: probe, serial_no: probe, remarks: probe };

/** The identity every Asset Loan fixture document carries. */
interface AssetLoan {
  name: string;
  doctype: string;
}

type AmendHandler = NonNullable<FrappeFormProps<AssetLoan>['onAmend']>;

interface RenderOptions {
  name?: string;
  roles?: string[];
  onAmend?: AmendHandler;
  onDelete?: () => void;
  onCancel?: () => void;
  onEdit?: () => void;
}

const renderForm = (fixtures: InMemoryFixtureProvider, options: RenderOptions = {}) => {
  const { onAmend: handleAmend, onDelete: handleDelete, onCancel: handleCancel, onEdit: handleEdit } = options;
  return renderWithProviders(
    <FrappeProvider
      baseURL="http://test"
      fixtures={fixtures}>
      <FrappeForm
        doctype="Asset Loan"
        name={options.name}
        roles={options.roles ?? ['Loan Manager']}
        overrides={overrides}
        showSidebar={false}
        showTimeline={false}
        onAmend={handleAmend}
        onDelete={handleDelete}
        onCancel={handleCancel}
        onEdit={handleEdit}
      />
    </FrappeProvider>,
  );
};

const renderPage = (fixtures: InMemoryFixtureProvider, pathname: string) => {
  const pushed: string[] = [];
  const navigation: FrappeNavigation = {
    usePathname: () => pathname,
    useNavigate: () => (href) => pushed.push(href),
  };
  renderWithProviders(
    <FrappeProvider
      baseURL="http://test"
      fixtures={fixtures}
      navigation={navigation}>
      <FrappeForm
        doctype="Asset Loan"
        route="/loans"
        roles={['Loan Manager']}
        overrides={overrides}
        showSidebar={false}
        showTimeline={false}
      />
    </FrappeProvider>,
  );
  return pushed;
};

const expectProbe = async (field: string, text: string): Promise<void> => {
  await waitFor(() => {
    expect(screen.getByTestId(`probe-${field}`).textContent).toContain(text);
  });
};

const expectStatus = async (status: string): Promise<void> => {
  await waitFor(() => {
    expect(screen.getByTestId(`frappe-form-status-${status}`)).toBeTruthy();
  });
};

const docstatusOf = async (fixtures: InMemoryFixtureProvider, name: string) => {
  const doc = await fixtures.getDoc('Asset Loan', name);
  return doc?.docstatus;
};

const holdWrites = (fixtures: InMemoryFixtureProvider, method: 'createDoc' | 'updateDoc') => {
  // A never-settling promise keeps the write in flight for the whole test.
  vi.spyOn(fixtures, method).mockReturnValue(Promise.withResolvers<never>().promise);
};

const isInert = (element: HTMLElement) =>
  element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';

const expectLive = (element: HTMLElement) => {
  expect(element.getAttribute('disabled')).toBeNull();
  expect(element.getAttribute('aria-disabled')).toBeNull();
};

describe('FrappeForm lifecycle', () => {
  beforeAll(async () => {
    // oxlint-disable-next-line import/no-named-as-default-member -- the named `use` export is unbound; i18next.use needs the instance as `this`
    await i18next.use(initReactI18next).init({
      lng: 'en',
      interpolation: { escapeValue: false },
      resources: { en: { translation: {} } },
    });
  });

  let confirm: Mock<(message?: string) => boolean>;

  beforeEach(() => {
    confirm = vi.fn<(message?: string) => boolean>(() => true);
    vi.stubGlobal('confirm', confirm);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('FrappeForm runs the desk docstatus lifecycle', () => {
    it('a saved draft offers Submit, which asks first and locks the document', async () => {
      const fixtures = corpus();
      renderForm(fixtures, { name: 'LOAN-DRAFT' });
      await expectProbe('employee_name', 'val=Ada Lovelace');
      await expectStatus('draft');
      expect(screen.queryByText('Save')).toBeNull();

      fireEvent.click(screen.getByText('Submit'));
      await waitFor(() => {
        expect(confirm).toHaveBeenCalledWith('Permanently Submit LOAN-DRAFT?');
      });
      await expectStatus('submitted');
      await waitFor(async () => {
        await expect(docstatusOf(fixtures, 'LOAN-DRAFT')).resolves.toBe(1);
      });
      await expectProbe('employee_name', 'ro=true');
      await expectProbe('remarks', 'ro=false');
      expect(screen.getByTestId('frappe-form-cancel-document')).toBeTruthy();
    });

    it('a declined confirmation leaves the draft alone', async () => {
      confirm.mockReturnValue(false);
      const fixtures = corpus();
      renderForm(fixtures, { name: 'LOAN-DRAFT' });
      await expectStatus('draft');

      fireEvent.click(screen.getByText('Submit'));
      await waitFor(() => {
        expect(confirm).toHaveBeenCalledWith('Permanently Submit LOAN-DRAFT?');
      });
      await expect(docstatusOf(fixtures, 'LOAN-DRAFT')).resolves.toBe(0);
      expect(screen.getByTestId('frappe-form-status-draft')).toBeTruthy();
    });

    it('Submit refuses a draft whose mandatory field is empty', async () => {
      const fixtures = corpus();
      renderForm(fixtures, { name: 'LOAN-UNNAMED' });
      await expectProbe('serial_no', 'val=SN-2');

      fireEvent.click(screen.getByText('Submit'));
      await expectProbe('employee_name', 'err=Employee Name is required');
      expect(confirm).not.toHaveBeenCalled();
      await expect(docstatusOf(fixtures, 'LOAN-UNNAMED')).resolves.toBe(0);
    });

    it('an edited draft saves first; Submit waits for a clean document', async () => {
      renderForm(corpus(), { name: 'LOAN-DRAFT' });
      await expectStatus('draft');

      fireEvent.click(screen.getByTestId('set-remarks'));
      await expectStatus('notSaved');
      expect(screen.getByText('Save')).toBeTruthy();
      expect(screen.queryByText('Submit')).toBeNull();
    });

    it("a submitted document cancels, is never deleted, and the host's leave button reads Close", async () => {
      const fixtures = corpus();
      renderForm(fixtures, {
        name: 'LOAN-SUBMITTED',
        onDelete: vi.fn<() => void>(),
        onCancel: vi.fn<() => void>(),
        onAmend: vi.fn<AmendHandler>(),
      });
      await expectStatus('submitted');
      expect(screen.queryByText('Delete')).toBeNull();
      expect(screen.getByText('Close')).toBeTruthy();
      expect(screen.getByTestId('frappe-form-cancel-document').textContent).toContain('Cancel Document');

      fireEvent.click(screen.getByTestId('frappe-form-cancel-document'));
      await waitFor(() => {
        expect(confirm).toHaveBeenCalledWith('Permanently Cancel LOAN-SUBMITTED?');
      });
      await expectStatus('cancelled');
      await waitFor(async () => {
        await expect(docstatusOf(fixtures, 'LOAN-SUBMITTED')).resolves.toBe(2);
      });
      expect(screen.getByText('Amend')).toBeTruthy();
      expect(screen.getByText('Delete')).toBeTruthy();
    });

    it('an allow_on_submit edit turns Cancel into Update, which keeps the document submitted', async () => {
      const fixtures = corpus();
      renderForm(fixtures, { name: 'LOAN-SUBMITTED' });
      await expectStatus('submitted');

      fireEvent.click(screen.getByTestId('set-remarks'));
      await waitFor(() => {
        expect(screen.getByText('Update')).toBeTruthy();
      });
      expect(screen.queryByTestId('frappe-form-cancel-document')).toBeNull();

      fireEvent.click(screen.getByText('Update'));
      await waitFor(async () => {
        const loan = await fixtures.getDoc('Asset Loan', 'LOAN-SUBMITTED');
        expect(loan?.remarks).toBe('edited');
      });
      await expect(docstatusOf(fixtures, 'LOAN-SUBMITTED')).resolves.toBe(1);
    });

    it('Amend hands the host a draft that a create-mode form opens and saves as the amendment', async () => {
      const fixtures = corpus();
      const onAmend = vi.fn<AmendHandler>();
      const Host = () => {
        const [name, setName] = useState<string | undefined>('LOAN-CANCELLED');
        return (
          <FrappeProvider
            baseURL="http://test"
            fixtures={fixtures}>
            <FrappeForm
              doctype="Asset Loan"
              name={name}
              roles={['Loan Manager']}
              overrides={overrides}
              showSidebar={false}
              showTimeline={false}
              onAmend={(draft) => {
                onAmend(draft);
                setName(undefined);
              }}
            />
          </FrappeProvider>
        );
      };
      renderWithProviders(<Host />);
      await expectStatus('cancelled');

      fireEvent.click(screen.getByText('Amend'));
      await waitFor(() => {
        expect(onAmend).toHaveBeenCalledWith(expect.any(Object));
      });
      const [[draft]] = onAmend.mock.calls;
      expect(draft).toMatchObject({
        amended_from: 'LOAN-CANCELLED',
        employee_name: 'Katherine Johnson',
        serial_no: 'SN-4',
        remarks: 'Wrong serial',
        docstatus: 0,
      });
      expect(draft).not.toHaveProperty('name');

      await expectStatus('notSaved');
      await expectProbe('employee_name', 'val=Katherine Johnson');
      await expectProbe('serial_no', 'ro=false');
      fireEvent.click(screen.getByText('Save'));
      await waitFor(async () => {
        const amendments = await fixtures.getList('Asset Loan', {
          filters: { amended_from: 'LOAN-CANCELLED' },
        });
        expect(amendments).toHaveLength(1);
        expect(amendments[0]).toMatchObject({ docstatus: 0, serial_no: 'SN-4' });
      });
    });

    it('Amend stays disabled while a live amendment exists', async () => {
      const onAmend = vi.fn<AmendHandler>();
      renderForm(corpus(), { name: 'LOAN-REDONE', onAmend });
      await expectStatus('cancelled');
      await waitFor(() => {
        expect(screen.getByText('Already amended as LOAN-REDONE-1')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('Amend'));
      expect(onAmend).not.toHaveBeenCalled();
    });

    it('the roles decide: a Loan Officer submits but neither cancels nor amends', async () => {
      renderForm(corpus(), { name: 'LOAN-SUBMITTED', roles: ['Loan Officer'], onCancel: vi.fn<() => void>() });
      await expectStatus('submitted');
      expect(screen.queryByTestId('frappe-form-cancel-document')).toBeNull();
      expect(screen.getByText('Cancel')).toBeTruthy();
      cleanup();

      renderForm(corpus(), { name: 'LOAN-CANCELLED', roles: ['Loan Officer'], onAmend: vi.fn<AmendHandler>() });
      await expectStatus('cancelled');
      expect(screen.queryByText('Amend')).toBeNull();
      cleanup();

      renderForm(corpus(), { name: 'LOAN-DRAFT', roles: ['Loan Clerk'] });
      await expectStatus('draft');
      expect(screen.getByText('Save')).toBeTruthy();
      expect(screen.queryByText('Submit')).toBeNull();
    });

    it('a role the doctype grants nothing reads the document with no lifecycle action', async () => {
      renderForm(corpus(), { name: 'LOAN-DRAFT', roles: ['Auditor'], onDelete: vi.fn<() => void>() });
      await expectStatus('draft');
      await expectProbe('employee_name', 'off=true');
      for (const label of ['Save', 'Submit', 'Delete']) {
        expect(screen.queryByText(label)).toBeNull();
      }
      cleanup();

      renderForm(corpus(), { name: 'LOAN-SUBMITTED', roles: ['Auditor'], onCancel: vi.fn<() => void>() });
      await expectStatus('submitted');
      expect(screen.queryByTestId('frappe-form-cancel-document')).toBeNull();
      expect(screen.getByText('Cancel')).toBeTruthy();
      cleanup();

      renderForm(corpus(), { name: 'LOAN-CANCELLED', roles: ['Auditor'], onAmend: vi.fn<AmendHandler>() });
      await expectStatus('cancelled');
      expect(screen.queryByText('Amend')).toBeNull();
    });

    it('without onAmend a cancelled document offers no Amend', async () => {
      renderForm(corpus(), { name: 'LOAN-CANCELLED' });
      await expectStatus('cancelled');
      expect(screen.queryByText('Amend')).toBeNull();
    });
  });

  describe("a read-only record view keeps desk's lifecycle beside Edit", () => {
    it('a saved draft offers Edit and Submit, never Save or a discard button', async () => {
      const fixtures = corpus();
      const onEdit = vi.fn<() => void>();
      renderForm(fixtures, {
        name: 'LOAN-DRAFT',
        onEdit,
        onCancel: vi.fn<() => void>(),
        onDelete: vi.fn<() => void>(),
      });
      await expectStatus('draft');
      expect(screen.queryByText('Save')).toBeNull();
      expect(screen.queryByText('Cancel')).toBeNull();
      expect(screen.getByText('Delete')).toBeTruthy();

      fireEvent.click(screen.getByText('Edit'));
      expect(onEdit).toHaveBeenCalledOnce();

      fireEvent.click(screen.getByText('Submit'));
      await waitFor(() => {
        expect(confirm).toHaveBeenCalledWith('Permanently Submit LOAN-DRAFT?');
      });
      await waitFor(async () => {
        await expect(docstatusOf(fixtures, 'LOAN-DRAFT')).resolves.toBe(1);
      });
      await expectStatus('submitted');
      expect(screen.getByText('Cancel Document')).toBeTruthy();
      expect(screen.getByText('Edit')).toBeTruthy();
      expect(screen.queryByText('Delete')).toBeNull();
    });

    it('a submitted document offers Cancel Document, and its allow_on_submit field keeps Edit', async () => {
      const fixtures = corpus();
      renderForm(fixtures, { name: 'LOAN-SUBMITTED', onEdit: vi.fn<() => void>(), onCancel: vi.fn<() => void>() });
      await expectStatus('submitted');
      expect(screen.getByText('Edit')).toBeTruthy();
      expect(screen.queryByText('Cancel')).toBeNull();
      expect(screen.queryByText('Close')).toBeNull();

      fireEvent.click(screen.getByText('Cancel Document'));
      await waitFor(() => {
        expect(confirm).toHaveBeenCalledWith('Permanently Cancel LOAN-SUBMITTED?');
      });
      await waitFor(async () => {
        await expect(docstatusOf(fixtures, 'LOAN-SUBMITTED')).resolves.toBe(2);
      });
      await expectStatus('cancelled');
      expect(screen.queryByText('Edit')).toBeNull();
    });

    it('a cancelled document offers Amend and no Edit', async () => {
      const onAmend = vi.fn<AmendHandler>();
      renderForm(corpus(), { name: 'LOAN-CANCELLED', onEdit: vi.fn<() => void>(), onAmend });
      await expectStatus('cancelled');
      expect(screen.queryByText('Edit')).toBeNull();

      fireEvent.click(screen.getByText('Amend'));
      await waitFor(() => {
        expect(onAmend).toHaveBeenCalledWith(expect.objectContaining({ amended_from: 'LOAN-CANCELLED' }));
      });
      expect(onAmend.mock.calls[0][0]).toMatchObject({ amended_from: 'LOAN-CANCELLED' });
    });
  });

  describe("a submittable doctype's routed pages", () => {
    it('the record page offers Edit and Submit, and Edit opens the edit page', async () => {
      const pushed = renderPage(corpus(), '/loans/LOAN-DRAFT');
      await expectStatus('draft');
      expect(screen.getByText('Submit')).toBeTruthy();
      expect(screen.queryByText('Save')).toBeNull();

      fireEvent.click(screen.getByText('Edit'));
      expect(pushed).toStrictEqual(['/loans/LOAN-DRAFT/edit']);
    });

    it('the edit page offers Submit on a clean draft, Save once edited, and a discard back to the record', async () => {
      const pushed = renderPage(corpus(), '/loans/LOAN-DRAFT/edit');
      await expectStatus('draft');
      expect(screen.getByText('Submit')).toBeTruthy();
      expect(screen.queryByText('Edit')).toBeNull();

      fireEvent.click(screen.getByTestId('set-remarks'));
      await expectStatus('notSaved');
      expect(screen.getByText('Save')).toBeTruthy();
      expect(screen.queryByText('Submit')).toBeNull();

      fireEvent.click(screen.getByText('Cancel'));
      expect(pushed).toStrictEqual(['/loans/LOAN-DRAFT']);
    });

    it("a cancelled record's Amend opens the amended draft on the new page", async () => {
      const pushed = renderPage(corpus(), '/loans/LOAN-CANCELLED');
      await expectStatus('cancelled');

      fireEvent.click(screen.getByText('Amend'));
      await waitFor(() => {
        expect(pushed).toStrictEqual(['/loans/new']);
      });
      expect(takeCreatePrefill('Asset Loan')).toMatchObject({
        amended_from: 'LOAN-CANCELLED',
        employee_name: 'Katherine Johnson',
      });
    });
  });

  describe('the leave button stays live while a write is in flight (LC-30)', () => {
    it('Save disables while it waits on the server; Cancel stays enabled and still leaves', async () => {
      const fixtures = corpus();
      holdWrites(fixtures, 'createDoc');
      const onCancel = vi.fn<() => void>();
      renderForm(fixtures, { onCancel });
      await expectProbe('employee_name', 'ro=false');

      fireEvent.click(screen.getByTestId('set-employee_name'));
      await expectProbe('employee_name', 'val=edited');
      fireEvent.click(screen.getByTestId('frappe-form-save'));
      await waitFor(() => {
        expect(isInert(screen.getByTestId('frappe-form-save'))).toBe(true);
      });
      await waitFor(() => {
        expect(fixtures.createDoc).toHaveBeenCalledWith('Asset Loan', expect.any(Object));
      });

      const cancel = screen.getByTestId('frappe-form-close');
      expectLive(cancel);
      fireEvent.click(cancel);
      expect(onCancel).toHaveBeenCalledOnce();
    });

    it('Cancel Document in flight leaves Close enabled beside it', async () => {
      const fixtures = corpus();
      holdWrites(fixtures, 'updateDoc');
      const onCancel = vi.fn<() => void>();
      renderForm(fixtures, { name: 'LOAN-SUBMITTED', onCancel });
      await expectStatus('submitted');
      expect(screen.getByTestId('frappe-form-close').textContent).toContain('Close');

      fireEvent.click(screen.getByTestId('frappe-form-cancel-document'));
      await waitFor(() => {
        expect(isInert(screen.getByTestId('frappe-form-cancel-document'))).toBe(true);
      });
      await waitFor(() => {
        expect(fixtures.updateDoc).toHaveBeenCalledWith('Asset Loan', 'LOAN-SUBMITTED', expect.any(Object));
      });

      const close = screen.getByTestId('frappe-form-close');
      expectLive(close);
      fireEvent.click(close);
      expect(onCancel).toHaveBeenCalledOnce();
    });
  });
});
