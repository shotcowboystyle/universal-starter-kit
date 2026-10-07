import { useMemo, useState } from 'react';

import { assetLoanLifecycleFixtures } from '../tests/fixtures/assetLoanLifecycle';

import { FrappeForm } from './FrappeForm';
import { FrappeProvider } from './FrappeProvider';
import { FrappeStoryProvider, frappeStoriesLive } from './frappeStoryTarget';

export default {
  title: 'FrappeUI/FrappeForm Lifecycle',
  component: FrappeForm,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          "A submittable doctype's docstatus lifecycle with desk's rules. A saved, clean draft offers Submit; an edited one saves first. A submitted document is read-only except its allow_on_submit fields, offers Cancel, and turns Cancel into Update while such a field is edited. A cancelled document offers Amend, which hands the host a new draft carrying `amended_from`; the doctype's next create-mode FrappeForm opens seeded with it. Submit and Cancel ask first. Each action shows only for roles holding the matching right. The fixture doctype is Asset Loan.",
      },
    },
  },
};

const host = 'https://form-lifecycle.mock.test';
const roles = ['Loan Manager'];

function AssetLoan({ start, initialRoles = roles }: { start?: string; initialRoles?: string[] }) {
  const fixtures = useMemo(() => assetLoanLifecycleFixtures(), []);
  const [name, setName] = useState<string | undefined>(start);
  return (
    <FrappeProvider
      baseURL={host}
      fixtures={fixtures}>
      <FrappeForm
        doctype="Asset Loan"
        name={name}
        roles={initialRoles}
        showSidebar={false}
        showTimeline={false}
        onAmend={() => {
          setName(undefined);
        }}
        onCancel={() => {
          setName(start);
        }}
        onDelete={() => {
          setName(undefined);
        }}
      />
    </FrappeProvider>
  );
}

/** Starts on a saved draft: Submit, Cancel, then Amend, on one live fixture corpus. */
export const Lifecycle = () => <AssetLoan start="LOAN-DRAFT" />;

export const Submitted = () => <AssetLoan start="LOAN-SUBMITTED" />;

export const Cancelled = () => <AssetLoan start="LOAN-CANCELLED" />;

/** Desk disables Amend while a live amendment of the document exists. */
export const AlreadyAmended = () => <AssetLoan start="LOAN-REDONE" />;

/** Loan Officer holds submit but neither cancel nor amend. */
export const SubmitOnlyRole = () => (
  <AssetLoan
    start="LOAN-SUBMITTED"
    initialRoles={['Loan Officer']}
  />
);

function BenchLoan({ start }: { start: string }) {
  const [name, setName] = useState<string | undefined>(start);
  return (
    <FrappeStoryProvider>
      <FrappeForm
        doctype="Asset Loan"
        name={name}
        showSidebar={false}
        showTimeline={false}
        onAmend={() => {
          setName(undefined);
        }}
        onCancel={() => {
          setName(start);
        }}
      />
    </FrappeStoryProvider>
  );
}

/**
 * The same walk on the bench the Storybook dev server proxies
 * (STORYBOOK_FRAPPE_URL), with the session's own roles. `name` picks an
 * Asset Loan on that bench; without a bench the fixture draft stands in.
 */
export const OnBench = {
  args: { name: 'LOAN-DRAFT' },
  render: ({ name }: { name: string }) =>
    frappeStoriesLive ? (
      <BenchLoan
        key={name}
        start={name}
      />
    ) : (
      <AssetLoan start="LOAN-DRAFT" />
    ),
};
