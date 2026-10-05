import { action } from '@repo/storybook';
import { Preset } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Paragraph, YStack, XStack } from 'tamagui';

import { Button } from './Button';
import { Field, FieldLayout } from './fieldLayout';
import { Checkbox } from './fields/Checkbox';
import { Input } from './fields/Input';
import { Form } from './Form';
import { Input as InputParts } from './InputParts';

/**
 * FieldLayout wraps a CONTROL, so these stories cannot mount the house `Input`
 * field — it brings its own FieldLayout. `InputParts.Box` is the house chrome
 * underneath that field, and it is the part that consumes the knobs.
 */
function Control(props: {
  id?: string;
  placeholder?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  secureTextEntry?: boolean;
}) {
  return (
    <InputParts>
      <InputParts.Box>
        <InputParts.Area {...props} />
      </InputParts.Box>
    </InputParts>
  );
}

const meta: Meta<typeof FieldLayout> = {
  title: 'Forms/FieldLayout',
  component: FieldLayout,
  parameters: { status: { type: 'beta' } },
  argTypes: {
    label: { control: 'text' },
    helperText: { control: 'text' },
    error: { control: 'text' },
    required: { control: 'boolean' },
    compactSpacing: { control: 'boolean' },
    size: { control: 'select', options: ['$2', '$3', '$4', '$6'] },
    id: { control: 'text' },
  },
  args: {
    id: 'fl-input',
    label: 'Email address',
    helperText: 'We never share your email',
  },
};

export default meta;
type Story = StoryObj<typeof FieldLayout>;

export const Basic: Story = {
  render: (args) => (
    <YStack maxWidth={360}>
      <FieldLayout {...args}>
        <Control id={args.id} placeholder="you@example.com" />
      </FieldLayout>
    </YStack>
  ),
};

/** Shared message order with real controls, including the inline checkbox row. */
export const MessageOrder: Story = {
  render: () => {
    const Example = () => {
      const [showErrors, setShowErrors] = useState(false);
      return (
        <YStack gap="$4" width="100%" maxWidth={480}>
          <Input
            id="message-top"
            label="Contact"
            helperText="Use an address where we can reach you"
            error={showErrors ? 'Enter a contact address' : undefined}
          />
          <Preset overrides={{ fieldLabelPlacement: 'side' }}>
            <Input
              id="message-side"
              label="Office"
              helperText="Use the office name shown on your account"
              error={showErrors ? 'Enter your office name' : undefined}
            />
          </Preset>
          <Checkbox
            id="message-inline"
            label="Accept terms"
            helperText="Read the terms before continuing"
            error={showErrors ? 'Accept the terms to continue' : undefined}
          />
          <Button
            onPress={() => {
              setShowErrors((shown) => !shown);
            }}>
            {showErrors ? 'Show helpers' : 'Show validation'}
          </Button>
        </YStack>
      );
    };
    return <Example />;
  },
};

export const ErrorStates: Story = {
  render: () => (
    <YStack gap="$6" maxWidth={360}>
      <FieldLayout
        id="fl-err-string"
        label="String error"
        helperText="Helper should be hidden"
        // Error copy states the rule broken — never "invalid"/"please"/"error".
        error="Value must use letters only">
        <Control id="fl-err-string" />
      </FieldLayout>
      <FieldLayout id="fl-err-bool" label="Boolean error" helperText="Helper should remain visible" error={true}>
        <Control id="fl-err-bool" />
      </FieldLayout>
      <FieldLayout
        id="fl-err-empty"
        label="Empty string error"
        helperText="Empty string should act as no message"
        error="">
        <Control id="fl-err-empty" />
      </FieldLayout>
    </YStack>
  ),
};

export const AnatomyEdgeCases: Story = {
  render: () => (
    <YStack gap="$6" maxWidth={360}>
      <FieldLayout id="fl-required" label="Required field" required>
        <Control id="fl-required" />
      </FieldLayout>
      <FieldLayout id="fl-nolabel" helperText="No label means compact $1 gap">
        <Control id="fl-nolabel" />
      </FieldLayout>
      <FieldLayout id="fl-compact" label="Compact spacing" compactSpacing helperText="Compact gap">
        <Control id="fl-compact" />
      </FieldLayout>
      <FieldLayout
        id="fl-node-label"
        label={
          <XStack gap="$2" alignItems="center">
            <Paragraph fontWeight="700">ReactNode</Paragraph>
            <Paragraph size="$1">(custom node label)</Paragraph>
          </XStack>
        }>
        <Control id="fl-node-label" />
      </FieldLayout>
      <FieldLayout
        id="fl-long"
        label="Long messages"
        error="This validation message is extremely long and keeps going to make sure long validation copy wraps correctly under the control without pushing the layout sideways or clipping any of its content at narrow widths">
        <Control id="fl-long" />
      </FieldLayout>
    </YStack>
  ),
};

export const FieldWrapper: Story = {
  render: () => {
    const Example = () => {
      const form = useForm({
        defaultValues: { username: 'initial-value' },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });
      return (
        <Form form={form}>
          <YStack gap="$4" maxWidth={360}>
            <Field form={form} name="username" defaultValue="initial-value">
              {(field) => (
                <FieldLayout
                  id="field-username"
                  label="Username"
                  helperText="TanStack Field wrapper"
                  field={field as any}>
                  <Control
                    id="field-username"
                    value={String(field.state.value ?? '')}
                    onChangeText={(text) => {
                      field.handleChange(text);
                    }}
                  />
                </FieldLayout>
              )}
            </Field>
            <XStack gap="$2">
              <Button action="submit">Submit</Button>
              <Button
                onPress={() => {
                  form.reset();
                }}>
                Reset
              </Button>
            </XStack>
          </YStack>
        </Form>
      );
    };
    return <Example />;
  },
};

export const FieldRequiredValidator: Story = {
  render: () => {
    const Example = () => {
      const form = useForm({
        defaultValues: { nickname: '' },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });
      return (
        <Form form={form}>
          <YStack gap="$4" maxWidth={360}>
            <Field
              form={form}
              name="nickname"
              validators={{
                onSubmit: ({ value }: { value: unknown }) => (!value ? 'Nickname is required' : undefined),
              }}>
              {(field) => (
                <FieldLayout id="field-nickname" label="Nickname" required field={field as any}>
                  <Control
                    id="field-nickname"
                    value={String(field.state.value ?? '')}
                    onChangeText={(text) => {
                      field.handleChange(text);
                    }}
                  />
                </FieldLayout>
              )}
            </Field>
            <Button action="submit">Submit</Button>
          </YStack>
        </Form>
      );
    };
    return <Example />;
  },
};
