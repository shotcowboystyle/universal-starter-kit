import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import { FieldGroup } from './FieldGroup';
import { Input } from './fields/Input';
import { FormSection, FormSectionStack } from './FormSection';

const meta: Meta<typeof FieldGroup> = {
  title: 'Forms/FieldGroup',
  component: FieldGroup,
  parameters: { status: { type: 'beta' } },
  args: {
    legend: 'Contact details',
    columns: 1,
  },
};

export default meta;
type Story = StoryObj<typeof FieldGroup>;

function Field({ id, label }: { id: string; label: string }) {
  return <Input id={id} label={label} placeholder={label} />;
}

export const Basic: Story = {
  render: (args) => (
    <YStack maxWidth={480}>
      <FieldGroup {...args}>
        <Field id="fg-email" label="Email" />
        <Field id="fg-phone" label="Phone" />
      </FieldGroup>
    </YStack>
  ),
};

export const TwoColumnGroup: Story = {
  name: 'Two-column group (responsive)',
  render: () => (
    <YStack gap="$8" maxWidth={720}>
      <YStack borderWidth={1} borderColor="$borderColor" padding="$3">
        <FieldGroup legend="Name (wide)" columns={2}>
          <Field id="fgw-first" label="First" />
          <Field id="fgw-last" label="Last" />
        </FieldGroup>
      </YStack>
      <YStack maxWidth={280} borderWidth={1} borderColor="$borderColor" padding="$2">
        <FieldGroup legend="Name (narrow → 1 col)" columns={2}>
          <Field id="fgn-first" label="First" />
          <Field id="fgn-last" label="Last" />
        </FieldGroup>
      </YStack>
    </YStack>
  ),
};

export const SectionRhythm: Story = {
  name: 'FormSection stack rhythm',
  render: () => (
    <FormSectionStack>
      <FormSection label="Account">
        <FieldGroup legend="Credentials">
          <Field id="fs-user" label="Username" />
          <Field id="fs-pass" label="Password" />
        </FieldGroup>
      </FormSection>
      <FormSection label="Profile">
        <FieldGroup legend="Identity" columns={2}>
          <Field id="fs-first" label="First name" />
          <Field id="fs-last" label="Last name" />
        </FieldGroup>
      </FormSection>
    </FormSectionStack>
  ),
};
