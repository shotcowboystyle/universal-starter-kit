import { action } from '@repo/storybook';
import { Preset } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { Paragraph, YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { CheckboxGroup } from './CheckboxGroup';

const meta: Meta<typeof CheckboxGroup> = {
  title: 'Forms/CheckboxGroup',
  component: CheckboxGroup,
  parameters: { status: { type: 'beta' } },
  argTypes: {
    label: { control: 'text' },
    helperText: { control: 'text' },
    error: { control: 'text' },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
    readOnly: { control: 'boolean' },
    skeleton: { control: 'boolean' },
    compact: { control: 'boolean' },
    orientation: { control: 'select', options: ['vertical', 'horizontal'] },
    size: { control: 'select', options: ['$2', '$3', '$4'] },
  },
  args: {
    label: 'Features',
    helperText: 'Select all that apply',
    options: [
      { value: 'notifications', label: 'Push Notifications' },
      { value: 'emails', label: 'Email Updates' },
      { value: 'sms', label: 'SMS Alerts' },
    ],
    defaultValue: ['emails'],
  },
};

export default meta;
type Story = StoryObj<typeof CheckboxGroup>;

export const Basic: Story = {
  render: (args) => (
    <YStack maxWidth={400}>
      <CheckboxGroup {...args} onValueChange={action('onValueChange')} />
    </YStack>
  ),
};

/**
 * Selection-card mode: checkbox in a leading slot, bold label to its right,
 * muted `option.description` under the label; the whole card toggles.
 */
export const CardMode: Story = {
  render: (args) => (
    <YStack maxWidth={400}>
      <CheckboxGroup
        {...args}
        card
        label="Payment methods"
        helperText={undefined}
        options={[
          {
            value: 'card',
            label: 'Credit or debit card',
            description: 'Visa, Mastercard, and American Express.',
          },
          {
            value: 'bank',
            label: 'Bank transfer',
            description: 'Direct transfer from your bank account.',
          },
          {
            value: 'wallet',
            label: 'Digital wallet',
            description: 'Apple Pay, Google Pay, or PayPal.',
          },
        ]}
        defaultValue={['card']}
        onChange={action('onChange')}
      />
    </YStack>
  ),
};

export const States: Story = {
  render: () => (
    <YStack gap="$6" maxWidth={400}>
      <CheckboxGroup
        label="Group disabled"
        disabled
        options={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta' },
        ]}
        defaultValue={['a']}
      />
      <CheckboxGroup
        label="Group read-only"
        readOnly
        options={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta' },
        ]}
        defaultValue={['a']}
      />
      <CheckboxGroup
        label="String error"
        error="Pick at least one"
        helperText="Helper should be hidden by the error"
        options={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta' },
        ]}
      />
      <CheckboxGroup
        label="Boolean error"
        error={true}
        helperText="Helper should stay visible"
        options={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta' },
        ]}
      />
    </YStack>
  ),
};

export const SkeletonState: Story = {
  render: () => (
    <YStack gap="$6" maxWidth={400}>
      <CheckboxGroup
        label="Loading vertical"
        skeleton
        options={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta' },
          { value: 'c', label: 'Gamma' },
        ]}
      />
      <CheckboxGroup label="Loading horizontal (default count)" skeleton orientation="horizontal" />
    </YStack>
  ),
};

export const OptionEdgeCases: Story = {
  render: () => (
    <YStack gap="$6" maxWidth={400}>
      <Paragraph size="$2">empty options</Paragraph>
      <CheckboxGroup label="Empty" options={[]} />
      <Paragraph size="$2">single option</Paragraph>
      <CheckboxGroup label="Single" options={[{ value: 'only', label: 'Only option' }]} />
      <Paragraph size="$2">duplicate values</Paragraph>
      <CheckboxGroup
        label="Duplicates"
        options={[
          { value: 'dup', label: 'First duplicate' },
          { value: 'dup', label: 'Second duplicate' },
          { value: 'unique', label: 'Unique' },
        ]}
      />
      <Paragraph size="$2">disabled option inside enabled group</Paragraph>
      <CheckboxGroup
        label="Partially disabled"
        options={[
          { value: 'on', label: 'Enabled option' },
          { value: 'off', label: 'Disabled option', disabled: true },
          { value: 'on2', label: 'Another enabled' },
        ]}
        defaultValue={['off']}
      />
      <Paragraph size="$2">all options disabled</Paragraph>
      <CheckboxGroup
        label="All disabled"
        options={[
          { value: 'a', label: 'Alpha', disabled: true },
          { value: 'b', label: 'Beta', disabled: true },
        ]}
      />
      <Paragraph size="$2">unknown selected value</Paragraph>
      <CheckboxGroup
        label="Unknown selection"
        options={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta' },
        ]}
        defaultValue={['ghost']}
      />
      <Paragraph size="$2">long labels</Paragraph>
      <CheckboxGroup
        label="Long labels"
        options={[
          {
            value: 'long',
            label:
              'This option label is extremely long and should wrap gracefully next to its checkbox without pushing it out of alignment or clipping',
          },
          { value: 'short', label: 'Short' },
        ]}
      />
    </YStack>
  ),
};

export const HorizontalWrap: Story = {
  render: () => (
    <YStack maxWidth={320} borderWidth={1} borderColor="$borderColor" padding="$2">
      <CheckboxGroup
        label="Horizontal in narrow container"
        orientation="horizontal"
        options={[
          { value: 'one', label: 'Option one' },
          { value: 'two', label: 'Option two' },
          { value: 'three', label: 'Option three' },
          { value: 'four', label: 'Option four' },
          { value: 'five', label: 'Option five' },
        ]}
      />
    </YStack>
  ),
};

/**
 * E-FLAT proof: elevation large must not wrap group glyphs. Standalone
 * Checkbox still wraps (this story is the group carve-out).
 */
export const ElevationLarge: Story = {
  render: (args) => (
    <Preset overrides={{ elevation: 'large' }}>
      <YStack maxWidth={400}>
        <CheckboxGroup {...args} onValueChange={action('onValueChange')} />
      </YStack>
    </Preset>
  ),
};

export const RequiredForm: Story = {
  render: () => {
    const Example = () => {
      const form = useForm({
        defaultValues: { permissions: [] as string[] },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });
      return (
        <Form form={form}>
          <YStack gap="$4" maxWidth={400}>
            <CheckboxGroup
              label="Permissions"
              name="permissions"
              required
              options={[
                { value: 'read', label: 'Read' },
                { value: 'write', label: 'Write' },
                { value: 'admin', label: 'Admin' },
              ]}
              helperText="Submit empty to trigger required error"
            />
            <Button action="submit">Submit</Button>
          </YStack>
        </Form>
      );
    };
    return <Example />;
  },
};
