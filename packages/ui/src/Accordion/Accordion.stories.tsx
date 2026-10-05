// Catalog Button (story honesty): stories compose catalog controls, never raw tamagui ones.
import { Button, Checkbox, FormGrid, Input, Select, TextArea } from '@repo/forms';
import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';

import { Accordion, type AccordionProps } from './index';

const meta: Meta<typeof Accordion> = {
  title: 'Components/Accordion',
  component: Accordion,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Themed collapsible sections over the tamagui Accordion primitive. Single or multiple expand modes, controlled or uncontrolled, plain (divider rows) and card (surface per item) variants. Header labels ride the fontWeight knob (400 / 700 — never 600); selected state is fill, not a heavier weight. Header rows are full-width tap targets; keyboard Enter/Space toggles and ArrowUp/ArrowDown moves between headers.',
      },
    },
  },
  argTypes: {
    type: { control: 'radio', options: ['single', 'multiple'] },
    variant: { control: 'radio', options: ['plain', 'card'] },
    collapsible: { control: 'boolean' },
    disabled: { control: 'boolean' },
    compact: { control: 'boolean' },
  },
  args: {
    type: 'single',
    variant: 'plain',
    collapsible: true,
    disabled: false,
  },
};
export default meta;

type Story = StoryObj<typeof Accordion>;

// A fragment CONSTANT, not a wrapper component: the Accordion resolves
// stacked-group corner positions by counting its children, and fragments/
// arrays are transparent to that count while a component boundary is opaque
// (it would DEV-warn `opaque-stack-group` and round every row uniformly).
const demoItems = (
  <>
    <Accordion.Item value="shipping">
      <Accordion.Trigger description="Where should we deliver the order?">Shipping details</Accordion.Trigger>
      <Accordion.Content>
        <Text>We ship to most countries within 3-5 business days. Free shipping applies to orders over $50.</Text>
      </Accordion.Content>
    </Accordion.Item>
    <Accordion.Item value="billing">
      <Accordion.Trigger description="Payment methods and invoices">Billing</Accordion.Trigger>
      <Accordion.Content>
        <Text>All major credit cards are supported. Invoices are emailed after every successful charge.</Text>
      </Accordion.Content>
    </Accordion.Item>
    <Accordion.Item value="returns" disabled>
      <Accordion.Trigger description="Disabled section">Returns</Accordion.Trigger>
      <Accordion.Content>
        <Text>Returns are accepted within 30 days.</Text>
      </Accordion.Content>
    </Accordion.Item>
  </>
);

export const Main: Story = {
  render: (args) => (
    <Accordion
      {...(args as AccordionProps)}
      defaultValue={args.type === 'multiple' ? (['shipping'] as any) : 'shipping'}
      onValueChange={action('onValueChange')}
      maxWidth={520}>
      {demoItems}
    </Accordion>
  ),
};

export const Multiple: Story = {
  args: { type: 'multiple' },
  render: () => (
    <Accordion
      type="multiple"
      defaultValue={['shipping', 'billing']}
      onValueChange={action('onValueChange')}
      maxWidth={520}>
      {demoItems}
    </Accordion>
  ),
};

export const CardVariant: Story = {
  args: { variant: 'card' },
  render: () => (
    <Accordion variant="card" defaultValue="shipping" onValueChange={action('onValueChange')} maxWidth={520}>
      {demoItems}
    </Accordion>
  ),
};

export const WithFormContent: Story = {
  render: () => (
    <Accordion
      type="multiple"
      variant="card"
      defaultValue={['contact']}
      onValueChange={action('onValueChange')}
      maxWidth={640}>
      <Accordion.Item value="contact">
        <Accordion.Trigger description="Frappe Section Break: collapsible section with a form grid">
          Contact information
        </Accordion.Trigger>
        <Accordion.Content>
          <FormGrid columns={2}>
            <Input name="firstName" label="First Name" placeholder="Jane" />
            <Input name="lastName" label="Last Name" placeholder="Doe" />
            <Input name="email" label="Email" placeholder="jane@example.com" />
            <Select
              name="country"
              label="Country"
              placeholder="Select country"
              // >5 options: shorter single-select lists trip `select-too-few-options`.
              options={[
                { label: 'United States', value: 'us' },
                { label: 'India', value: 'in' },
                { label: 'Germany', value: 'de' },
                { label: 'Japan', value: 'jp' },
                { label: 'Brazil', value: 'br' },
                { label: 'Australia', value: 'au' },
              ]}
            />
          </FormGrid>
        </Accordion.Content>
      </Accordion.Item>
      <Accordion.Item value="notes">
        <Accordion.Trigger description="A second collapsed section">Notes</Accordion.Trigger>
        <Accordion.Content>
          <YStack gap="$3">
            <TextArea name="notes" label="Internal Notes" placeholder="Anything worth recording" />
            <Checkbox name="subscribe" label="Subscribe to updates" />
          </YStack>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion>
  ),
};

export const Compact: Story = {
  args: { compact: true },
  render: (args) => (
    <Accordion
      {...(args as AccordionProps)}
      compact
      defaultValue={args.type === 'multiple' ? (['shipping'] as any) : 'shipping'}
      onValueChange={action('onValueChange')}
      maxWidth={520}>
      {demoItems}
    </Accordion>
  ),
};

export const Nested: Story = {
  render: () => (
    <Accordion defaultValue="outer" onValueChange={action('onValueChange')} maxWidth={520}>
      <Accordion.Item value="outer">
        <Accordion.Trigger description="Nested sections inherit a stepped-down density">
          Shipping regions
        </Accordion.Trigger>
        <Accordion.Content>
          <Accordion type="multiple" defaultValue={['eu']}>
            <Accordion.Item value="eu">
              <Accordion.Trigger>Europe</Accordion.Trigger>
              <Accordion.Content>3–5 business days to most EU countries.</Accordion.Content>
            </Accordion.Item>
            <Accordion.Item value="apac">
              <Accordion.Trigger>Asia Pacific</Accordion.Trigger>
              <Accordion.Content>5–8 business days depending on customs.</Accordion.Content>
            </Accordion.Item>
          </Accordion>
        </Accordion.Content>
      </Accordion.Item>
      <Accordion.Item value="billing">
        <Accordion.Trigger description="Payment methods and invoices">Billing</Accordion.Trigger>
        <Accordion.Content>All major credit cards are supported.</Accordion.Content>
      </Accordion.Item>
    </Accordion>
  ),
};

export const Controlled: Story = {
  render: () => {
    const [open, setOpen] = useState<string>('billing');
    return (
      <YStack gap="$4" maxWidth={520}>
        <XStack gap="$2" alignItems="center">
          <Button
            size="$2"
            onPress={() => {
              setOpen('shipping');
            }}>
            Open shipping
          </Button>
          <Button
            size="$2"
            onPress={() => {
              setOpen('billing');
            }}>
            Open billing
          </Button>
          <Button
            size="$2"
            onPress={() => {
              setOpen('');
            }}>
            Close all
          </Button>
          <Text fontSize="$2" color="$color11" data-testid="controlled-value">
            value: {open || '(none)'}
          </Text>
        </XStack>
        <Accordion
          type="single"
          value={open}
          onValueChange={(next) => {
            setOpen(next);
            action('onValueChange')(next);
          }}>
          {demoItems}
        </Accordion>
      </YStack>
    );
  },
};
