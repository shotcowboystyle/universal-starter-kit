import { Form, Input, Switch, useFormContext } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';

import { Wizard, useWizard, type WizardFormLike, type WizardStep } from './index';

const steps: WizardStep[] = [
  {
    id: 'snapshot',
    label: 'Snapshot',
    fields: ['source'],
    fieldLabels: { source: 'Source' },
  },
  {
    id: 'destination',
    label: 'Destination',
    fields: ['volume', 'region'],
    fieldLabels: { volume: 'Destination volume', region: 'Region' },
  },
  {
    id: 'verify',
    label: 'Verify',
    fields: ['checksums'],
    fieldLabels: { checksums: 'Checksums' },
  },
  { id: 'review', label: 'Review', review: true },
];

const meta: Meta<typeof Wizard> = {
  title: 'Components/Wizard',
  component: Wizard,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Multi-step form container. ProgressSteps is the rail; every panel stays mounted (LC-63). Per-step validation on Next (DG-VAL-01/02). Last primary is the task verb, never Submit.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Wizard>;

function DeriveToggle() {
  const { setFieldValue } = useWizard();
  const [derived, setDerived] = useState(false);
  return (
    <Switch
      id="derive"
      label="Derive destination from snapshot"
      checked={derived}
      onChange={(checked) => {
        setDerived(checked);
        if (checked) {
          setFieldValue('volume', '');
        }
      }}
    />
  );
}

function ReadyWizard({
  labels = 'visible',
  defaultCurrent = 1,
}: {
  labels?: 'visible' | 'hidden';
  defaultCurrent?: number;
}) {
  const form = useFormContext<Record<string, string>>();
  return (
    <Wizard
      form={form as unknown as WizardFormLike}
      steps={steps}
      defaultCurrent={defaultCurrent}
      completeLabel="Restore backup"
      labels={labels}
      onCancel={() => undefined}>
      <Wizard.Panel>
        <Input id="source" name="source" label="Source" required />
      </Wizard.Panel>
      <Wizard.Panel>
        <DeriveToggle />
        <Wizard.Clearable names={['volume']}>
          <Input
            id="volume"
            name="volume"
            label="Destination volume"
            helperText="Must be empty before restore begins."
            required
          />
        </Wizard.Clearable>
        <Input id="region" name="region" label="Region" required />
      </Wizard.Panel>
      <Wizard.Panel>
        <Input id="checksums" name="checksums" label="Checksums" />
      </Wizard.Panel>
      <Wizard.Panel>
        <Wizard.Review />
      </Wizard.Panel>
    </Wizard>
  );
}

function ReadyForm(props: { labels?: 'visible' | 'hidden'; defaultCurrent?: number }) {
  return (
    <Form
      formOptions={{
        defaultValues: {
          source: 'backup-2026-08-27-0300',
          volume: 'vol-restore-2026-08',
          region: 'eu-central',
          checksums: 'After restore',
        },
      }}
      showErrorSummary={false}>
      <ReadyWizard {...props} />
    </Form>
  );
}

export const Main: Story = {
  name: 'Ready',
  render: () => <ReadyForm />,
};

export const Loading: Story = {
  parameters: {
    skeletonSpecimen: true,
    docs: {
      description: {
        story: 'SKELETON SPECIMEN (D-10 / LC-61) — loading promise for the wizard shell.',
      },
    },
  },
  render: () => <Wizard steps={steps} completeLabel="Restore backup" status="loading" />,
};

export const Empty: Story = {
  render: () => <Wizard steps={steps} completeLabel="Restore backup" status="empty" emptyTitle="No restore steps" />,
};

export const Error: Story = {
  render: () => (
    <Wizard
      steps={steps}
      completeLabel="Restore backup"
      status="error"
      errorTitle="Could not load this flow"
      errorDescription="The snapshot catalog did not respond."
    />
  ),
};

export const ValidationError: Story = {
  render: () => (
    <Form formOptions={{ defaultValues: { source: '', volume: '', region: '' } }} showErrorSummary={false}>
      <ReadyWizard defaultCurrent={1} />
    </Form>
  ),
};

export const HiddenLabels: Story = {
  name: 'Labels hidden (390)',
  render: () => <ReadyForm labels="hidden" />,
};

export const Review: Story = {
  render: () => <ReadyForm defaultCurrent={3} />,
};
