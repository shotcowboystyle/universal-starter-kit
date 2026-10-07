import { CheckIcon } from '@phosphor-icons/react';
import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Checkbox as TamaguiCheckbox, Label, Paragraph, XStack, YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { Checkbox, Checkboxes, CheckboxGroup } from './index';

const meta: Meta<typeof Checkbox> = {
  title: 'Forms/Checkbox',
  component: Checkbox,
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
    pointy: { control: 'boolean' },
    size: { control: 'select', options: ['$2', '$3', '$4'] },
    checked: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Checkbox>;

const TERMS_LABEL = 'Accept terms';

const FormExample = () => {
  const form = useForm({
    defaultValues: {
      terms: false,
      newsletter: true,
    },
    onSubmit: async ({ value }) => {
      action('onSubmit')(value);
    },
  });

  return (
    <Form form={form}>
      <Checkbox
        label={TERMS_LABEL}
        name="terms"
        validators={{ onChange: ({ value }: { value: boolean }) => (value ? undefined : 'Terms are required') }}
      />
      <Checkbox
        label="Subscribe to newsletter"
        name="newsletter"
      />
      <Button action="submit">Submit</Button>
    </Form>
  );
};

export const Main: Story = {
  name: 'Main',
  render: () => <FormExample />,
};

export const Standalone: Story = {
  args: {
    label: TERMS_LABEL,
    helperText: 'You must accept to continue',
    disabled: false,
    required: false,
  },
  render: (args) => <Checkbox {...args} />,
};

export const Basic: Story = {
  args: {
    label: TERMS_LABEL,
    helperText: 'You must accept before continuing',
    defaultValue: false,
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disabled Field',
    disabled: true,
  },
};

export const WithError: Story = {
  args: {
    label: 'Field with Error',
    error: 'This field is required',
    required: true,
  },
};

export const Pointy: Story = {
  render: () => (
    <YStack
      gap="$4"
      maxWidth={400}>
      <Checkbox
        label="Pointy (hard angles)"
        pointy
        checked={true}
      />
      <Checkbox
        label="Regular (default)"
        pointy={false}
        checked={true}
      />
    </YStack>
  ),
};

export const Sizes: Story = {
  render: () => (
    <YStack
      gap="$4"
      maxWidth={400}>
      <Checkbox
        label="Small"
        size="$2"
      />
      <Checkbox
        label="Medium (default)"
        size="$3"
      />
      <Checkbox
        label="Large"
        size="$4"
      />
    </YStack>
  ),
};

const CompoundExample = () => {
  const [values, setValues] = useState({
    analytics: true,
    updates: false,
    marketing: false,
  });

  return (
    <YStack gap="$4">
      <Checkboxes
        values={values}
        onValuesChange={(nextValues) => {
          setValues(nextValues as typeof values);
        }}>
        <Checkboxes.Title>Notification Preferences</Checkboxes.Title>
        <Checkboxes.FocusGroup orientation="vertical">
          <Checkboxes.Group>
            <Checkboxes.Group.Item>
              <Checkboxes.FocusGroup.Item value="analytics">
                <Checkboxes.Card>
                  <Checkboxes.Checkbox>
                    <Checkboxes.Checkbox.Indicator />
                  </Checkboxes.Checkbox>
                  <Paragraph>Product analytics</Paragraph>
                </Checkboxes.Card>
              </Checkboxes.FocusGroup.Item>
            </Checkboxes.Group.Item>
            <Checkboxes.Group.Item>
              <Checkboxes.FocusGroup.Item value="updates">
                <Checkboxes.Card>
                  <Checkboxes.Checkbox>
                    <Checkboxes.Checkbox.Indicator />
                  </Checkboxes.Checkbox>
                  <Paragraph>Release updates</Paragraph>
                </Checkboxes.Card>
              </Checkboxes.FocusGroup.Item>
            </Checkboxes.Group.Item>
            <Checkboxes.Group.Item>
              <Checkboxes.FocusGroup.Item value="marketing">
                <Checkboxes.Card>
                  <Checkboxes.Checkbox>
                    <Checkboxes.Checkbox.Indicator />
                  </Checkboxes.Checkbox>
                  <Paragraph>Marketing emails</Paragraph>
                </Checkboxes.Card>
              </Checkboxes.FocusGroup.Item>
            </Checkboxes.Group.Item>
          </Checkboxes.Group>
        </Checkboxes.FocusGroup>
      </Checkboxes>
    </YStack>
  );
};

export const compound = () => <CompoundExample />;

const ComparisonExample = () => {
  const [customChecked, setCustomChecked] = useState(false);
  const [tamaguiChecked, setTamaguiChecked] = useState<boolean>(false);
  return (
    <XStack
      gap="$6"
      alignItems="flex-start"
      padding="$4">
      <YStack
        gap="$3"
        width={250}>
        <Paragraph
          size="$2"
          color="$placeholderColor">
          Custom Checkbox
        </Paragraph>
        <Checkbox
          label={TERMS_LABEL}
          defaultValue={customChecked}
          // oxlint-disable-next-line typescript/no-deprecated -- the story demonstrates the Radix-named alias next to Tamagui's own checkbox
          onCheckedChange={(val) => {
            setCustomChecked(val !== false);
            action('custom.onCheckedChange')(val);
          }}
        />
      </YStack>

      <YStack
        gap="$3"
        width={250}>
        <Paragraph
          size="$2"
          color="$placeholderColor">
          Tamagui Checkbox
        </Paragraph>
        <XStack
          gap="$2"
          alignItems="center">
          <TamaguiCheckbox
            id="tamagui-cb"
            checked={tamaguiChecked}
            onCheckedChange={(val) => {
              setTamaguiChecked(val !== false);
              action('tamagui.onCheckedChange')(val);
            }}>
            <TamaguiCheckbox.Indicator>
              <CheckIcon />
            </TamaguiCheckbox.Indicator>
          </TamaguiCheckbox>
          <Label htmlFor="tamagui-cb">Accept terms</Label>
        </XStack>
      </YStack>
    </XStack>
  );
};

export const Comparison: StoryObj = {
  parameters: { foreignContrastSpecimen: true },
  render: () => <ComparisonExample />,
};

// --- CheckboxGroup Stories ---

export const CheckboxGroupBasic: StoryObj = {
  render: () => (
    <YStack
      gap="$4"
      maxWidth={400}>
      <CheckboxGroup
        label="Features"
        options={[
          { value: 'notifications', label: 'Push Notifications' },
          { value: 'emails', label: 'Email Updates' },
          { value: 'sms', label: 'SMS Alerts' },
        ]}
        defaultValue={['emails']}
        helperText="Select all that apply"
      />
    </YStack>
  ),
};

const GroupFormExample = () => {
  const form = useForm({
    defaultValues: {
      features: ['notifications'],
      permissions: [] as string[],
    },
    onSubmit: async ({ value }) => {
      action('onSubmit')(value);
    },
  });

  return (
    <Form form={form}>
      <YStack
        gap="$4"
        maxWidth={400}>
        <CheckboxGroup
          label="Features"
          name="features"
          options={[
            { value: 'notifications', label: 'Push Notifications' },
            { value: 'emails', label: 'Email Updates' },
            { value: 'sms', label: 'SMS Alerts' },
            { value: 'reports', label: 'Weekly Reports' },
          ]}
          helperText="Select your preferred features"
        />
        <CheckboxGroup
          label="Permissions"
          name="permissions"
          options={[
            { value: 'read', label: 'Read Access' },
            { value: 'write', label: 'Write Access' },
            { value: 'delete', label: 'Delete Access' },
            { value: 'admin', label: 'Admin Access' },
          ]}
          helperText="Select required permissions"
          required
        />
        <Button action="submit">Submit</Button>
      </YStack>
    </Form>
  );
};

export const CheckboxGroupWithForm: StoryObj = {
  render: () => <GroupFormExample />,
};

export const CheckboxGroupHorizontal: StoryObj = {
  render: () => (
    <YStack
      gap="$4"
      maxWidth={600}>
      <CheckboxGroup
        label="Size"
        orientation="horizontal"
        options={[
          { value: 's', label: 'Small' },
          { value: 'm', label: 'Medium' },
          { value: 'l', label: 'Large' },
          { value: 'xl', label: 'X-Large' },
        ]}
        defaultValue={['m']}
      />
    </YStack>
  ),
};

export const CheckboxGroupWithDisabled: StoryObj = {
  render: () => (
    <YStack
      gap="$4"
      maxWidth={400}>
      <CheckboxGroup
        label="Options"
        options={[
          { value: 'available', label: 'Available Option' },
          { value: 'disabled', label: 'Disabled Option', disabled: true },
          { value: 'another', label: 'Another Option' },
        ]}
        defaultValue={['available']}
        helperText="Some options may be disabled"
      />
    </YStack>
  ),
};

const InteractiveExample = () => {
  const [selected, setSelected] = useState<string[]>(['opt1']);
  return (
    <YStack
      gap="$4"
      maxWidth={400}>
      <CheckboxGroup
        label="Interactive Selection"
        options={[
          { value: 'opt1', label: 'Option 1' },
          { value: 'opt2', label: 'Option 2' },
          { value: 'opt3', label: 'Option 3' },
        ]}
        value={selected}
        onChange={(values) => {
          setSelected(values);
          action('onValueChange')(values);
        }}
      />
      <Paragraph size="$2">Selected: {selected.join(', ') || 'None'}</Paragraph>
    </YStack>
  );
};

export const CheckboxGroupInteractive: StoryObj = {
  render: () => <InteractiveExample />,
};

/** Loading placeholder — the skeleton mirrors control + label anatomy. */
export const SkeletonState: Story = {
  args: { label: TERMS_LABEL, skeleton: true },
};
