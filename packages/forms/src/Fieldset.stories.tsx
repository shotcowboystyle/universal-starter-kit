import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import { Input } from './fields/Input';
import { Fieldset, FormSectionStack } from './FormSection';

function Field({ id, label, ...rest }: { id: string; label: string; secureTextEntry?: boolean }) {
  return <Input id={id} label={label} placeholder={label} {...rest} />;
}

const meta: Meta<typeof Fieldset> = {
  title: 'Forms/Fieldset',
  component: Fieldset,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Semantic fieldset + legend grouping for form fields. Alias of FormSection (same rhythm tokens). On web renders `<fieldset>`/`<legend>`; native keeps a heading label.',
      },
    },
  },
  argTypes: {
    label: { control: 'text' },
    maxWidth: { control: 'text' },
    fieldset: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<typeof Fieldset>;

export const Default: Story = {
  name: 'Main',
  render: () => (
    <YStack maxWidth={480}>
      <Fieldset label="Contact">
        <Field id="full-name" label="Full name" />
        <Field id="email" label="Email" />
      </Fieldset>
    </YStack>
  ),
};

export const Stacked: Story = {
  render: () => (
    <YStack maxWidth={480}>
      <FormSectionStack>
        <Fieldset label="Account">
          <Field id="username" label="Username" />
          <Field id="password" label="Password" secureTextEntry />
        </Fieldset>
        <Fieldset label="Profile">
          <Field id="display-name" label="Display name" />
        </Fieldset>
      </FormSectionStack>
    </YStack>
  ),
};

export const FluidWidth: Story = {
  render: () => (
    <Fieldset label="Wide section" maxWidth="fluid">
      <Field id="notes" label="Notes" />
    </Fieldset>
  ),
};
