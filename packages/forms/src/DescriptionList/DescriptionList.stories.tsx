import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Paragraph, YStack } from 'tamagui';

import { FormGrid } from '../FormGrid';
import { FormSection, FormSectionStack } from '../FormSection';

import { DescriptionList, type DescriptionListItem } from './index';

const meta: Meta<typeof DescriptionList> = {
  title: 'Forms/DescriptionList',
  component: DescriptionList,
  parameters: { status: { type: 'stable' } },
  argTypes: {
    placement: { control: 'radio', options: ['side', 'top'] },
    compact: { control: 'boolean' },
    framed: { control: 'boolean' },
    quiet: { control: 'boolean' },
  },
  args: {
    placement: 'side',
    compact: false,
    framed: false,
    quiet: false,
  },
};

export default meta;
type Story = StoryObj<typeof DescriptionList>;

const HOST: DescriptionListItem[] = [
  {
    term: 'Hostname',
    field: 'input',
    value: 'compose01.hel1.hetzner',
    onChange: () => undefined,
  },
  {
    term: 'Status',
    field: 'select',
    value: 'active',
    fieldProps: { options: [{ label: 'Active', value: 'active', color: 'green' }] },
  },
  {
    term: 'Region',
    field: 'input',
    value: 'hel1 · Helsinki',
    onChange: () => undefined,
  },
  { term: 'Instance ID', field: 'input', value: 'i-0f9c2a7d44e1b6c83' },
  {
    term: 'Monthly cost',
    field: 'stepper',
    value: 38.4,
    fieldProps: { currency: 'EUR', precision: 2 },
  },
  { term: 'Created', field: 'datepicker', value: new Date(2025, 6, 1) },
  { term: 'Owner', field: 'input', value: 'Clay Risser', onChange: () => undefined },
  {
    term: 'Notes',
    field: 'textarea',
    value: 'Nightly restic snapshot to hz-s3. Retention 30 days, prune weekly. Verify runs first Monday of the month.',
  },
  {
    term: 'Docs',
    field: 'input',
    value: 'https://docs.selfhostedcloud.org/stacks/compose01',
  },
  { term: 'Decommissioned', field: 'input', value: null },
];

export const Default: Story = {
  render: (args) => <DescriptionList {...args} items={HOST} />,
};

export const Anatomy: Story = {
  name: 'Anatomy — term · value · Change',
  render: (args) => <DescriptionList {...args} items={HOST} />,
};

export const SideDefault: Story = {
  name: 'Side (record register)',
  render: () => <DescriptionList placement="side" items={HOST.map(({ onChange: _onChange, ...row }) => row)} />,
};

export const TopPlacement: Story = {
  name: 'Top — fieldLabelPlacement=top',
  render: () => <DescriptionList placement="top" items={HOST} />,
};

export const CollapseNarrow: Story = {
  name: 'Container under 480 auto-stacks',
  render: () => (
    <YStack width={280} borderWidth={1} borderColor="$borderColor" padding="$3">
      <DescriptionList
        placement="side"
        maxWidth="fluid"
        items={[
          {
            term: 'Hostname',
            field: 'input',
            value: 'compose01.hel1.hetzner',
            onChange: () => undefined,
          },
          {
            term: 'Status',
            field: 'select',
            value: 'active',
            fieldProps: { options: [{ label: 'Active', value: 'active', color: 'green' }] },
          },
          {
            term: 'Instance ID',
            field: 'input',
            value: 'i-0f9c2a7d44e1b6c83',
            truncate: true,
          },
        ]}
      />
    </YStack>
  ),
};

export const RecordPage: Story = {
  name: 'Record page — FormSection + FormGrid',
  render: () => (
    <FormGrid columns={2}>
      <FormSectionStack>
        <FormSection label="Host">
          <DescriptionList maxWidth="fluid" placement="side" items={HOST.slice(0, 6)} />
        </FormSection>
      </FormSectionStack>
      <FormSectionStack>
        <FormSection label="Backups">
          <DescriptionList
            maxWidth="fluid"
            placement="side"
            items={[
              {
                term: 'Schedule',
                field: 'select',
                value: 'weekly',
                fieldProps: { options: [{ label: 'Weekly', value: 'weekly' }] },
              },
              {
                term: 'Last run',
                field: 'datetimepicker',
                value: new Date(2026, 7, 26, 3, 30),
              },
              {
                term: 'Window',
                field: 'daterangepicker',
                value: new Date(2025, 6, 1),
                linkedValue: new Date(2026, 7, 28),
              },
              { term: 'Encrypted', field: 'checkbox', value: true },
              { term: 'Disk used', field: 'progress', value: 62, fieldProps: { max: 100 } },
            ]}
          />
        </FormSection>
        <FormSection label="Access">
          <DescriptionList
            maxWidth="fluid"
            placement="side"
            items={[
              { term: 'Owner', field: 'input', value: 'Clay Risser', onChange: () => undefined },
              {
                term: 'Team',
                field: 'combobox',
                value: ['infra', 'ops'],
                fieldProps: {
                  options: [
                    { label: 'infra', value: 'infra', color: 'blue' },
                    { label: 'ops', value: 'ops' },
                  ],
                },
              },
              {
                term: 'Docs',
                field: 'input',
                value: 'https://docs.selfhostedcloud.org/stacks/compose01',
              },
            ]}
          />
        </FormSection>
      </FormSectionStack>
    </FormGrid>
  ),
};

export const FramedAndQuiet: Story = {
  render: () => (
    <YStack gap="$5" maxWidth={560}>
      <Paragraph size="$2">Framed — Card paints, so it earns the inset</Paragraph>
      <DescriptionList framed placement="side" items={HOST.slice(0, 4).map(({ onChange: _onChange, ...row }) => row)} />
      <Paragraph size="$2">Quiet separators — 1px at opacity .5</Paragraph>
      <DescriptionList quiet placement="side" items={HOST.slice(0, 4).map(({ onChange: _onChange, ...row }) => row)} />
    </YStack>
  ),
};

export const Slots: Story = {
  name: 'FieldDisplay slots',
  render: () => (
    <DescriptionList
      placement="side"
      items={[
        { term: 'Data', field: 'input', value: 'compose01.hel1.hetzner' },
        {
          term: 'Long Text',
          field: 'textarea',
          value: 'Nightly restic snapshot to hz-s3. Retention 30 days, prune weekly.',
        },
        { term: 'Int', field: 'stepper', value: 47 },
        {
          term: 'Currency',
          field: 'stepper',
          value: 38.4,
          fieldProps: { currency: 'EUR', precision: 2 },
        },
        { term: 'Date', field: 'datepicker', value: new Date(2025, 6, 1) },
        { term: 'Check', field: 'checkbox', value: true },
        {
          term: 'Select',
          field: 'select',
          value: 'weekly',
          fieldProps: { options: [{ label: 'Weekly', value: 'weekly' }] },
        },
        { term: 'Color', field: 'colorpicker', value: '#3d8f5e' },
        { term: 'Percent', field: 'progress', value: 88, fieldProps: { max: 100 } },
        { term: 'Attach', field: 'fileupload', value: 'compose01-backup.tar.gz' },
        { term: 'URL', field: 'input', value: 'https://status.selfhostedcloud.org' },
        { term: 'Empty', field: 'input', value: null },
      ]}
    />
  ),
};

export const Compact: Story = {
  render: () => <DescriptionList compact placement="side" items={HOST.slice(0, 3)} />,
};
