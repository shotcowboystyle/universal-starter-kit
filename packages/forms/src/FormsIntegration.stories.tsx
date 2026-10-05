import { EnvelopeIcon, KeyIcon, MagnifyingGlassIcon, EyeIcon, EyeSlashIcon } from '@phosphor-icons/react';
import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Paragraph, ScrollView, Separator, View, YStack } from 'tamagui';

import type { AnyFormApi } from './types';

import {
  Button,
  Checkbox,
  FieldGroup,
  Form,
  FormActions,
  FormSection,
  Input,
  OTPInput,
  PhoneInput,
  Select,
  Switch,
  TextArea,
  useFocusManagement,
} from './index';

const meta: Meta<typeof Form> = {
  title: 'Forms/FormsIntegration',
  component: Form,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Complete form integration examples showing how all form components work together with TanStack Form. Shell chrome is Form / FieldGroup / FormSection / FormActions — not raw stacks with bold headings.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Form>;

export const multiStepRegistration: Story = {
  name: 'Main',
  render: function MultiStepRegistration() {
    const [step, setStep] = useState<'personal' | 'contact' | 'verification'>('personal');
    const [_otpCode, setOtpCode] = useState<string>('');
    const [_isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm({
      defaultValues: {
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: '',
        country: 'US',
        agreeToTerms: false,
        marketingEmails: true,
        otp: '',
        search: '',
      },
      onSubmit: async ({ value }) => {
        setIsSubmitting(true);
        action('onSubmit')(value);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        setIsSubmitting(false);
        action('onSubmitComplete')('Form submitted successfully!');
      },
    });

    const focusManagement = useFocusManagement({
      trapFocus: true,
      initialFocus: 'first',
    });

    const handleOTPComplete = (code: string) => {
      setOtpCode(code);
      form.setFieldValue('otp', code);
      action('onOTPComplete')(code);
    };

    const renderPersonalInfo = () => (
      <FormSection label="Personal Information">
        <YStack ref={focusManagement.containerRef as never}>
          <FieldGroup legend="Full Name" columns={2}>
            <Input
              form={form as unknown as AnyFormApi}
              name="firstName"
              inputProps={{ placeholder: 'First Name' }}
              validators={{
                onChange: ({ value }) => (!value ? 'First name is required' : undefined),
              }}
            />
            <Input
              form={form as unknown as AnyFormApi}
              name="lastName"
              inputProps={{ placeholder: 'Last Name' }}
              validators={{
                onChange: ({ value }) => (!value ? 'Last name is required' : undefined),
              }}
            />
          </FieldGroup>
        </YStack>

        <Input
          form={form as unknown as AnyFormApi}
          name="email"
          label="Email Address"
          inputProps={{ placeholder: 'Enter your email' }}
          validators={{
            onChange: ({ value }) => {
              if (!value) {
                return 'Email is required';
              }
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                // No please/invalid — state the requirement.
                return 'Email must include an @ and a domain';
              }
            },
          }}
        />

        <PhoneInput
          form={form as unknown as AnyFormApi}
          name="phone"
          label="Phone Number"
          inputProps={{ placeholder: 'Enter your phone number' }}
          defaultCountry="US"
          validators={{
            onChange: ({ value }) => (!value ? 'Phone number is required' : undefined),
          }}
        />

        <Input
          form={form as unknown as AnyFormApi}
          name="password"
          label="Password"
          inputProps={{
            placeholder: 'Create a password',
            secureTextEntry: true,
          }}
          validators={{
            onChange: ({ value }) => {
              if (!value) {
                return 'Password is required';
              }
              if (value.length < 8) {
                return 'Password must be at least 8 characters';
              }
              if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(value)) {
                return 'Password must contain uppercase, lowercase, and number';
              }
            },
          }}
        />

        <Input
          form={form as unknown as AnyFormApi}
          name="confirmPassword"
          inputProps={{ placeholder: 'Confirm password' }}
          validators={{
            onChange: ({ value }) => {
              const password = form.getFieldValue('password');
              if (!value) {
                return 'Enter the password again to confirm';
              }
              if (value !== password) {
                return 'Passwords do not match';
              }
            },
          }}
        />

        <FormActions>
          <Button
            onPress={() => {
              setStep('contact');
            }}>
            Next: Contact Preferences
          </Button>
        </FormActions>
      </FormSection>
    );

    const renderContactPreferences = () => (
      <FormSection label="Contact Preferences">
        <Select
          form={form as unknown as AnyFormApi}
          name="country"
          options={[
            { label: 'United States', value: 'US' },
            { label: 'Canada', value: 'CA' },
            { label: 'United Kingdom', value: 'GB' },
            { label: 'Germany', value: 'DE' },
            { label: 'France', value: 'FR' },
            { label: 'Japan', value: 'JP' },
          ]}
          placeholder="Select your country"
        />

        <Checkbox
          form={form as unknown as AnyFormApi}
          name="agreeToTerms"
          label="I agree to the Terms and Conditions"
          validators={{
            onChange: ({ value }) => (!value ? 'You must agree to the terms' : undefined),
          }}
        />

        <Switch form={form as unknown as AnyFormApi} name="marketingEmails" label="Subscribe to marketing emails" />

        <Input
          form={form as unknown as AnyFormApi}
          name="search"
          label="Search interests (optional)"
          inputProps={{ placeholder: 'Search topics...' }}
        />

        <FormActions>
          <Button
            onPress={() => {
              setStep('personal');
            }}>
            Back
          </Button>
          <Button
            onPress={() => {
              setStep('verification');
            }}>
            Next: Verification
          </Button>
        </FormActions>
      </FormSection>
    );

    const renderVerification = () => (
      <FormSection label="Verification">
        <Paragraph>Enter the 6-digit verification code sent to your email.</Paragraph>

        <OTPInput
          form={form as unknown as AnyFormApi}
          name="otp"
          length={6}
          onComplete={handleOTPComplete}
          validators={{
            onChange: ({ value }) => {
              if (!value || value.length !== 6) {
                // No please/valid-shaming — state the requirement.
                return 'Code must be 6 digits';
              }
            },
          }}
        />

        <FormActions>
          <Button
            onPress={() => {
              setStep('contact');
            }}>
            Back
          </Button>
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <Button action="submit" disabled={!canSubmit || isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Complete Registration'}
              </Button>
            )}
          </form.Subscribe>
        </FormActions>
      </FormSection>
    );

    return (
      <ScrollView>
        <View padding="$4" maxWidth={600} alignSelf="center">
          <Form form={form as unknown as AnyFormApi}>
            {step === 'personal' && renderPersonalInfo()}
            {step === 'contact' && renderContactPreferences()}
            {step === 'verification' && renderVerification()}
          </Form>
        </View>
      </ScrollView>
    );
  },
};

export const inputComposition: Story = {
  render: function InputComposition() {
    const [showPassword, setShowPassword] = useState(false);

    return (
      <ScrollView>
        <View padding="$4" maxWidth={600} alignSelf="center">
          <FormSection label="Input Composition Patterns" maxWidth="fluid">
            <FormSection label="Convenience Props (recommended)" maxWidth="fluid">
              <Input
                label="Email"
                placeholder="you@example.com"
                helperText="We'll never share your email"
                leftIcon=<EnvelopeIcon />
              />

              <Input
                label="Password"
                placeholder="Enter password"
                secureTextEntry={!showPassword}
                leftIcon=<KeyIcon />
                rightIcon={
                  showPassword ? (
                    <EyeSlashIcon
                      cursor="pointer"
                      onClick={() => {
                        setShowPassword(false);
                      }}
                    />
                  ) : (
                    <EyeIcon
                      cursor="pointer"
                      onClick={() => {
                        setShowPassword(true);
                      }}
                    />
                  )
                }
              />

              <Input label="Required Field" placeholder="This field is required" required />

              {/* Error copy states the problem + fix without the
                  banned invalid/error/please words. */}
              <Input
                label="With Error"
                placeholder="Letters and spaces"
                error="Value must use letters and spaces only"
                defaultValue="bad value"
              />

              <TextArea
                label="Bio"
                placeholder="Tell us about yourself..."
                helperText="Max 500 characters"
                showCount
                maxLength={500}
              />

              {/* >5 options so the Select doesn't trip
                  `select-too-few-options`. */}
              <Select
                label="Country"
                options={[
                  { label: 'United States', value: 'US' },
                  { label: 'Canada', value: 'CA' },
                  { label: 'United Kingdom', value: 'GB' },
                  { label: 'Germany', value: 'DE' },
                  { label: 'France', value: 'FR' },
                  { label: 'Japan', value: 'JP' },
                ]}
                placeholder="Select your country"
              />
            </FormSection>

            <Separator />

            <FormSection label="Compound Composition (full control)" maxWidth="fluid">
              <Input>
                <Input.Label>Custom Styled Label</Input.Label>
                <Input.Box>
                  <Input.Icon>
                    <MagnifyingGlassIcon />
                  </Input.Icon>
                  <Input.Area placeholder="Search anything..." />
                </Input.Box>
                <Input.Info>Press Enter to search</Input.Info>
              </Input>

              <Input>
                <Input.Label color="$blue11">Styled Label</Input.Label>
                <Input.Box>
                  <Input.Area placeholder="With custom label styling" />
                </Input.Box>
              </Input>

              <Input error>
                <Input.Label color="$red11">Error State (compound)</Input.Label>
                <Input.Box>
                  <Input.Area placeholder="Something went wrong" />
                </Input.Box>
                <Input.Info color="$red11" role="alert">
                  This value must match the expected format
                </Input.Info>
              </Input>
            </FormSection>
          </FormSection>
        </View>
      </ScrollView>
    );
  },
};
