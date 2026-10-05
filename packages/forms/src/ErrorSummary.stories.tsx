import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Paragraph, YStack } from 'tamagui';

import { Button } from './Button';
import { ErrorSummary, collectFormFieldErrors } from './ErrorSummary';
import { FieldLayout } from './fieldLayout';
import { Form } from './Form';
import { FormSection } from './FormSection';
import { Input as InputParts } from './InputParts';

const meta: Meta<typeof ErrorSummary> = {
  title: 'Forms/ErrorSummary',
  component: ErrorSummary,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Form-level error summary (DG-VAL-02), the GOV.UK pattern. It lists every field error as a link that focuses the offending control, carries `role="alert"`, and takes keyboard focus itself the moment it appears — so a submit failure is announced once and the keyboard lands somewhere useful instead of at the top of the document.',
      },
    },
  },
  argTypes: {
    title: { control: 'text' },
    disableAutoFocus: { control: 'boolean' },
  },
  args: {
    disableAutoFocus: true,
    errors: [
      { name: 'email', error: 'Enter an email address in the format name@example.com' },
      { name: 'password', error: 'Enter a password' },
    ],
  },
};

export default meta;
type Story = StoryObj<typeof ErrorSummary>;

export const Basic: Story = {
  render: (args) => (
    <YStack maxWidth={520}>
      <ErrorSummary {...args} onFocusField={action('onFocusField')} />
    </YStack>
  ),
};

/**
 * Structured errors: a validator may return `{ problem, action }`
 * instead of a string, and the summary flattens the pair into one sentence —
 * what is wrong, then what to do about it.
 */
export const StructuredErrors: Story = {
  render: () => (
    <YStack maxWidth={520}>
      <ErrorSummary
        disableAutoFocus
        errors={[
          {
            name: 'vatNumber',
            error: {
              problem: 'That VAT number is not registered.',
              action: 'Check it against your registration certificate.',
            },
          },
          {
            name: 'startDate',
            error: { problem: 'The start date is in the past.' },
          },
        ]}
        onFocusField={action('onFocusField')}
      />
    </YStack>
  ),
};

/** A custom `label` overrides the link text without touching the error payload. */
export const CustomLabels: Story = {
  render: () => (
    <YStack maxWidth={520}>
      <ErrorSummary
        disableAutoFocus
        title="Check these before continuing"
        errors={[
          { name: 'email', label: 'Email address', error: 'Enter an email address' },
          { name: 'phone', label: 'Phone number', error: 'Enter a phone number' },
        ]}
        onFocusField={action('onFocusField')}
      />
    </YStack>
  ),
};

/** One error, the common case after a single missed required field. */
export const SingleError: Story = {
  render: () => (
    <YStack maxWidth={520}>
      <ErrorSummary
        disableAutoFocus
        errors={[{ name: 'terms', error: 'You must accept the terms to continue' }]}
        onFocusField={action('onFocusField')}
      />
    </YStack>
  ),
};

/** An empty list renders nothing at all — no empty banner, no reserved space. */
export const EmptyRendersNothing: Story = {
  render: () => (
    <YStack maxWidth={520} gap="$3">
      <Paragraph size="$3">Nothing should paint between these two lines.</Paragraph>
      <ErrorSummary errors={[]} />
      <Paragraph size="$3">Second line.</Paragraph>
    </YStack>
  ),
};

/**
 * The live loop: submit empty, the summary appears, and clicking a link puts
 * the caret in the field that caused it. `collectFormFieldErrors` turns
 * TanStack `fieldMeta` into the item list.
 */
export const FocusesTheFieldOnPress: Story = {
  render: () => {
    const Example = () => {
      const [errors, setErrors] = useState<ReturnType<typeof collectFormFieldErrors>>([]);
      const form = useForm({
        defaultValues: { email: '', password: '' },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });
      const submit = () => {
        const next = collectFormFieldErrors({
          email: { errors: [form.state.values.email ? undefined : 'Enter an email address'] },
          password: { errors: [form.state.values.password ? undefined : 'Enter a password'] },
        });
        setErrors(next);
        if (next.length === 0) {
          void form.handleSubmit();
        }
      };
      return (
        <Form form={form}>
          <YStack maxWidth={520} gap="$4">
            <ErrorSummary errors={errors} disableAutoFocus onFocusField={action('onFocusField')} />
            <FormSection label="Sign in">
              <FieldLayout id="email" label="Email">
                <InputParts>
                  <InputParts.Box>
                    <InputParts.Area
                      id="email"
                      placeholder="you@example.com"
                      onChangeText={(text) => {
                        form.setFieldValue('email', text);
                      }}
                    />
                  </InputParts.Box>
                </InputParts>
              </FieldLayout>
              <FieldLayout id="password" label="Password">
                <InputParts>
                  <InputParts.Box>
                    <InputParts.Area
                      id="password"
                      secureTextEntry
                      onChangeText={(text) => {
                        form.setFieldValue('password', text);
                      }}
                    />
                  </InputParts.Box>
                </InputParts>
              </FieldLayout>
            </FormSection>
            <Button onPress={submit}>Submit</Button>
          </YStack>
        </Form>
      );
    };
    return <Example />;
  },
};

/**
 * `disableAutoFocus` off is the shipping default: the summary steals focus so
 * a screen reader announces it. Toggle the control to feel the difference.
 */
export const AutoFocusOnAppear: Story = {
  render: () => {
    const Example = () => {
      const [shown, setShown] = useState(false);
      return (
        <YStack maxWidth={520} gap="$4">
          <Button
            onPress={() => {
              setShown((prev) => !prev);
            }}>
            {shown ? 'Hide the summary' : 'Show the summary'}
          </Button>
          {shown ? (
            <ErrorSummary
              errors={[
                { name: 'email', error: 'Enter an email address' },
                { name: 'postcode', error: 'Enter a postcode' },
              ]}
              onFocusField={action('onFocusField')}
            />
          ) : null}
        </YStack>
      );
    };
    return <Example />;
  },
};
