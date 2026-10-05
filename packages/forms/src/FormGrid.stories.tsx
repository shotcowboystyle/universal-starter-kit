import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Paragraph, YStack } from 'tamagui';

import { FieldGroup } from './FieldGroup';
import { Input } from './fields/Input';
import { FormGrid } from './FormGrid';
import { FormSection, FormSectionStack } from './FormSection';

const meta: Meta<typeof FormGrid> = {
  title: 'Forms/FormGrid',
  component: FormGrid,
  parameters: { status: { type: 'beta' } },
  argTypes: {
    columns: { control: { type: 'number', min: 1, max: 2 } },
    maxColumns: { control: { type: 'number', min: 1, max: 2 } },
    compact: { control: 'boolean' },
  },
  args: {
    columns: 1,
    maxColumns: 2,
  },
};

export default meta;
type Story = StoryObj<typeof FormGrid>;

function GridField({ id, label }: { id: string; label: string }) {
  return <Input id={id} label={label} placeholder={label} />;
}

export const Basic: Story = {
  name: 'Basic (single column default)',
  render: (args) => (
    <YStack maxWidth={640}>
      <FormGrid {...args}>
        <GridField id="fg-first" label="First name" />
        <GridField id="fg-last" label="Last name" />
        <GridField id="fg-email" label="Email" />
        <GridField id="fg-phone" label="Phone" />
      </FormGrid>
    </YStack>
  ),
};

export const TwoColumnsWide: Story = {
  name: 'Two columns (wide)',
  render: () => (
    <YStack maxWidth={720} borderWidth={1} borderColor="$borderColor" padding="$3">
      <FormGrid columns={2}>
        <GridField id="fg2-first" label="First name" />
        <GridField id="fg2-last" label="Last name" />
        <GridField id="fg2-email" label="Email" />
        <GridField id="fg2-phone" label="Phone" />
      </FormGrid>
    </YStack>
  ),
};

export const ChildCounts: Story = {
  render: () => (
    <YStack gap="$6" maxWidth={640}>
      <Paragraph size="$2">zero children</Paragraph>
      <FormGrid columns={2}>{null}</FormGrid>
      <Paragraph size="$2">one child</Paragraph>
      <FormGrid columns={2}>
        <GridField id="fg1-only" label="Only field" />
      </FormGrid>
      <Paragraph size="$2">odd count (last cell hangs)</Paragraph>
      <FormGrid columns={2}>
        <GridField id="fgo-a" label="A" />
        <GridField id="fgo-b" label="B" />
        <GridField id="fgo-c" label="C" />
      </FormGrid>
    </YStack>
  ),
};

export const NarrowContainer: Story = {
  name: 'Narrow container (collapses to 1)',
  render: () => (
    <YStack maxWidth={280} borderWidth={1} borderColor="$borderColor" padding="$2" gap="$2">
      <Paragraph size="$2">columns=2 inside 280px → must render as 1 column</Paragraph>
      <FormGrid columns={2}>
        <GridField id="fgn-a" label="Cramped field one" />
        <GridField id="fgn-b" label="Cramped field two" />
        <GridField id="fgn-c" label="Cramped field three" />
        <GridField id="fgn-d" label="Cramped field four" />
      </FormGrid>
    </YStack>
  ),
};

export const LongErrors: Story = {
  render: () => (
    <YStack maxWidth={640}>
      <FormGrid columns={2}>
        <Input
          id="fge-a"
          label="With long error"
          error="This validation message is extremely long and should wrap inside its own grid cell without breaking the neighbouring column alignment or overflowing the grid container"
        />
        <GridField id="fge-b" label="Neighbour" />
      </FormGrid>
    </YStack>
  ),
};

export const FieldGroupAndSections: Story = {
  name: 'FieldGroup + FormSection rhythm',
  render: () => (
    <FormSectionStack>
      <FormSection label="Contact">
        <FieldGroup legend="Name" columns={2}>
          <GridField id="fgs-first" label="First name" />
          <GridField id="fgs-last" label="Last name" />
        </FieldGroup>
        <GridField id="fgs-email" label="Email" />
      </FormSection>
      <FormSection label="Address">
        <FieldGroup legend="Location">
          <GridField id="fgs-street" label="Street" />
          <GridField id="fgs-city" label="City" />
        </FieldGroup>
      </FormSection>
    </FormSectionStack>
  ),
};
