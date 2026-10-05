import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Paragraph, YStack } from 'tamagui';

import { PageSection } from './Page';

const meta: Meta<typeof PageSection> = {
  title: 'Components/PageSection',
  component: PageSection,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Labeled content section: H2 title, optional description, divider, and optional soft card surface. Title size is the shared sectionHeading scale; weight rides the fontWeight knob (400 / 700). Surfaced sections do not wrap Tint (R12).',
      },
    },
  },
  argTypes: {
    title: { control: 'text' },
    description: { control: 'text' },
    divider: { control: 'boolean' },
    surface: { control: 'boolean' },
    compact: {
      control: 'boolean',
      description: 'Density override. Omitted follows the density knob (LC-76).',
    },
  },
  args: {
    title: 'Section title',
    description: 'Short description of what lives in this section',
    divider: true,
    surface: false,
  },
};
export default meta;

type Story = StoryObj<typeof PageSection>;

export const Default: Story = {
  name: 'Main',
  render: (args) => (
    <PageSection {...args}>
      <Paragraph>Section body content.</Paragraph>
    </PageSection>
  ),
};

export const Surface: Story = {
  args: { surface: true },
  render: (args) => (
    <PageSection {...args}>
      <Paragraph>Content inside the soft card surface.</Paragraph>
    </PageSection>
  ),
};

export const HeaderOnly: Story = {
  render: (args) => <PageSection {...args} />,
};

export const Empty: Story = {
  args: { title: undefined, description: undefined },
  render: (args) => <PageSection {...args} />,
};

export const LongHeading: Story = {
  args: {
    title: 'A very long section heading that keeps going well past a reasonable length to test wrapping behaviour',
  },
  render: (args) => (
    <YStack maxWidth={360}>
      <PageSection {...args}>
        <Paragraph>Narrow container content.</Paragraph>
      </PageSection>
    </YStack>
  ),
};

export const Nested: Story = {
  args: { surface: true },
  render: (args) => (
    <PageSection {...args} title="Outer section">
      <Paragraph>Outer content.</Paragraph>
      <PageSection {...args} title="Inner section">
        <Paragraph>Inner content — check for double borders/padding.</Paragraph>
      </PageSection>
    </PageSection>
  ),
};
