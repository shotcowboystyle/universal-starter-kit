// Catalog Button (story honesty): raw tamagui buttons ignored
// the knobs and pinned a non-house radius.
import { Button } from '@repo/forms';
import { Preset } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import type { ReactNode } from 'react';
import { Paragraph, YStack } from 'tamagui';

import { Tabs } from '../Tabs';

import { PageHeader, Screen } from './Page';

const meta: Meta<typeof PageHeader> = {
  title: 'Components/PageHeader',
  component: PageHeader,
  parameters: {
    status: { type: 'beta' },
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Page header: H1 + body-scale lede stacked left, actions right, edge-to-edge hairline. Pass `nav` (tabs) to seat the active indicator on that one rule.',
      },
    },
  },
  argTypes: {
    title: { control: 'text' },
    subtitle: { control: 'text' },
    divider: { control: 'boolean' },
    compact: {
      control: 'boolean',
      description: 'Density override. Omitted follows the density knob (LC-76).',
    },
  },
  args: {
    title: 'Page title',
    subtitle: 'Supporting subtitle text under the title',
    divider: true,
  },
};
export default meta;

type Story = StoryObj<typeof PageHeader>;

function HeaderCanvas({ children }: { children: ReactNode }) {
  return (
    <Screen scroll={false} maxWidth={720}>
      {children}
      <Paragraph color="$color11">Page body shares the title inset. The hairline is edge-to-edge.</Paragraph>
    </Screen>
  );
}

export const Default: Story = {
  name: 'Main',
  render: (args) => (
    <HeaderCanvas>
      <PageHeader {...args} />
    </HeaderCanvas>
  ),
};

export const WithActions: Story = {
  render: (args) => (
    <HeaderCanvas>
      <PageHeader
        {...args}
        actions={
          <>
            <Button>Secondary</Button>
            <Button>Primary</Button>
          </>
        }
      />
    </HeaderCanvas>
  ),
};

export const WithNav: Story = {
  render: (args) => (
    <HeaderCanvas>
      <PageHeader
        {...args}
        actions={
          <>
            <Button>Secondary</Button>
            <Button>Primary</Button>
          </>
        }
        nav=<Tabs
          items={[
            { value: 'all', label: 'All' },
            { value: 'open', label: 'Open' },
            { value: 'closed', label: 'Closed' },
          ]}
        />
      />
    </HeaderCanvas>
  ),
};

export const TitleOnly: Story = {
  args: { subtitle: undefined },
  render: (args) => (
    <HeaderCanvas>
      <PageHeader {...args} />
    </HeaderCanvas>
  ),
};

/**
 * Page-title dial: the default is the moderate step ($8 = 32px) because a
 * page title is wayfinding, not content. `titleScale="display"` is the
 * per-instance eject back to the 64px hero scale for one marketing header.
 */
export const DisplayScale: Story = {
  args: { titleScale: 'display', subtitle: undefined, divider: false },
  render: (args) => <PageHeader {...args} />,
};

/**
 * Surface-level opt-in: the `hero` preset re-scales every page title
 * inside it, so a marketing surface asks once instead of per header.
 */
export const HeroPresetSurface: Story = {
  args: { subtitle: undefined, divider: false },
  render: (args) => (
    <Preset preset="hero">
      <PageHeader {...args} />
    </Preset>
  ),
};

export const NoTitle: Story = {
  args: { title: undefined, subtitle: undefined },
  render: (args) => (
    <HeaderCanvas>
      <PageHeader {...args} actions={<Button>Only action</Button>} />
    </HeaderCanvas>
  ),
};

export const LongTitleNarrow: Story = {
  args: {
    title: 'An extremely long page title that should wrap rather than clip on narrow viewports',
    subtitle:
      'A long subtitle as well, to make sure supporting copy wraps under the heading without overflowing horizontally',
  },
  render: (args) => (
    <YStack maxWidth={320} borderWidth={1} borderColor="$color6" borderStyle="dashed">
      <PageHeader
        {...args}
        actions={
          <>
            <Button>First action</Button>
            <Button>Second action</Button>
            <Button>Third action</Button>
          </>
        }
      />
    </YStack>
  ),
};
