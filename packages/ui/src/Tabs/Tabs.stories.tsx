import { ChatCircleIcon, FileTextIcon, GearIcon, LinkIcon, PaperclipIcon, UserIcon } from '@phosphor-icons/react';
import { Button, Input } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import React from 'react';
import { ScrollView, Text, XStack, YStack } from 'tamagui';

import { Chip } from '../Chip';

import { Tabs, type TabsItem } from './index';

const meta: Meta<typeof Tabs> = {
  title: 'Components/Tabs',
  component: Tabs,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          "Themed app-level Tabs over the tamagui primitive. Underline (desk-style, default) and contained (segmented) variants, sliding intent-colored indicator, scrollable overflow with edge fades, lazy-mountable panels, full keyboard support (ArrowLeft/Right, Home/End). Frappe form layouts are tab-heavy — SchemaForm's tab layout is the follow-up consumer.",
      },
    },
  },
  argTypes: {
    variant: { control: 'select', options: ['underline', 'contained', 'band'] },
    distribution: { control: 'select', options: ['content', 'equal'] },
    size: { control: 'select', options: ['$2', '$3', '$4', '$5'] },
    accent: { control: 'boolean' },
    error: { control: 'boolean' },
    warning: { control: 'boolean' },
    success: { control: 'boolean' },
    compact: { control: 'boolean' },
    lazyMount: { control: 'boolean' },
    fill: { control: 'boolean' },
    activationMode: { control: 'select', options: ['automatic', 'manual'] },
    loop: { control: 'boolean' },
    disabled: { control: 'boolean' },
    defaultValue: { control: 'text' },
    ariaLabel: { control: 'text' },
  },
};
export default meta;

type Story = StoryObj<typeof Tabs>;

const Panel = ({ title, body }: { title: string; body: string }) => (
  <YStack gap="$2">
    <Text fontWeight="700">{title}</Text>
    <Text color="$color11">{body}</Text>
  </YStack>
);

const baseItems: TabsItem[] = [
  {
    value: 'details',
    label: 'Details',
    content: <Panel title="Details" body="Primary fields of the document live here." />,
  },
  {
    value: 'address',
    label: 'Address & Contact',
    content: <Panel title="Address & Contact" body="Addresses, phone numbers, and emails." />,
  },
  {
    value: 'settings',
    label: 'Settings',
    content: <Panel title="Settings" body="Per-document configuration and toggles." />,
  },
  {
    value: 'archived',
    label: 'Archived',
    disabled: true,
    content: <Panel title="Archived" body="You should not be able to reach this tab." />,
  },
];

// NOTE: `items` holds React elements, so it must stay OUT of `args` -- the
// on-device storybook's arg-type inference walks arg values, and walking a
// React element's props tree trips a throwing @react-navigation context
// getter ("Couldn't find an UnhandledLinkingContext context"), which kills
// story loading for the ENTIRE native storybook (verified on iOS sim).
export const Underline: Story = {
  name: 'Main',
  args: { variant: 'underline' },
  render: (args) => <Tabs {...args} items={baseItems} />,
};

export const Contained: Story = {
  args: { variant: 'contained' },
  render: (args) => <Tabs {...args} items={baseItems.slice(0, 3)} />,
};

export const Intents: Story = {
  render: () => (
    <YStack gap="$6">
      {(['accent', 'error', 'warning', 'success'] as const).map((intent) => (
        <YStack key={intent} gap="$2">
          <Text fontSize="$2" color="$color11">
            {intent}
          </Text>
          <Tabs items={baseItems.slice(0, 3)} {...{ [intent]: true }} />
        </YStack>
      ))}
    </YStack>
  ),
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$6">
      {(['$2', '$3', '$4', '$5'] as const).map((size) => (
        <YStack key={size} gap="$2">
          <Text fontSize="$2" color="$color11">
            size={size}
          </Text>
          <Tabs items={baseItems.slice(0, 3)} size={size} />
        </YStack>
      ))}
    </YStack>
  ),
};

export const ManyTabsOverflow: Story = {
  render: () => {
    const many: TabsItem[] = Array.from({ length: 14 }, (_, i) => ({
      value: `tab-${i + 1}`,
      label: `Section ${i + 1}`,
      content: <Panel title={`Section ${i + 1}`} body="Overflowing tab strip content." />,
    }));
    return (
      <YStack maxWidth={480}>
        <Tabs items={many} />
      </YStack>
    );
  },
};

export const Controlled: Story = {
  render: () => {
    const [tab, setTab] = React.useState('address');
    const values = ['details', 'address', 'settings'];
    return (
      <YStack gap="$4">
        <XStack gap="$2" alignItems="center">
          {values.map((v) => (
            <Button
              key={v}
              size="$2"
              onPress={() => {
                setTab(v);
              }}>
              go: {v}
            </Button>
          ))}
          <Text color="$color11" fontSize="$2">
            value={tab}
          </Text>
        </XStack>
        <Tabs items={baseItems.slice(0, 3)} value={tab} onChange={setTab} />
      </YStack>
    );
  },
};

export const WithIconsAndBadges: Story = {
  render: () => {
    const items: TabsItem[] = [
      {
        value: 'profile',
        label: 'Profile',
        icon: <UserIcon size={16} />,
        content: <Panel title="Profile" body="User profile fields." />,
      },
      {
        value: 'comments',
        label: 'Comments',
        icon: <ChatCircleIcon size={16} />,
        badge: (
          <Chip size="$2" color="blue">
            12
          </Chip>
        ),
        content: <Panel title="Comments" body="Discussion thread." />,
      },
      {
        value: 'files',
        label: 'Attachments',
        icon: <PaperclipIcon size={16} />,
        badge: (
          <Chip size="$2" color="gray">
            3
          </Chip>
        ),
        content: <Panel title="Attachments" body="Files attached to this document." />,
      },
      {
        value: 'connections',
        label: 'Connections',
        icon: <LinkIcon size={16} />,
        content: <Panel title="Connections" body="Linked documents." />,
      },
    ];
    return (
      <YStack gap="$8">
        <Tabs items={items} />
        <Tabs items={items.slice(0, 3)} variant="contained" />
      </YStack>
    );
  },
};

export const LazyMountPanels: Story = {
  render: () => {
    const items: TabsItem[] = [
      {
        value: 'form',
        label: 'Form',
        icon: <FileTextIcon size={16} />,
        content: (
          <YStack gap="$2" maxWidth={320}>
            <Text color="$color11">Type here, switch away, and come back — state survives:</Text>
            <Input name="keptAlive" placeholder="Kept alive across tab switches" />
          </YStack>
        ),
      },
      {
        value: 'system',
        label: 'System',
        icon: <GearIcon size={16} />,
        content: <Panel title="System" body="Mounted on first visit only." />,
      },
    ];
    return <Tabs items={items} lazyMount />;
  },
};

export const FillBoundedParent: Story = {
  render: () => {
    const longBody = Array.from({ length: 30 }, (_, i) => `Log line ${i + 1}`).join('\n');
    const items: TabsItem[] = [
      {
        value: 'logs',
        label: 'Logs',
        content: (
          <ScrollView flex={1} minHeight={0}>
            <Text color="$color11">{longBody}</Text>
          </ScrollView>
        ),
      },
      {
        value: 'settings',
        label: 'Settings',
        content: <Panel title="Settings" body="Short content, same box." />,
      },
    ];
    const Box = ({ children, label }: { children: React.ReactNode; label: string }) => (
      <YStack gap="$2" flex={1} minWidth={0}>
        <Text fontSize="$2" color="$color11">
          {label}
        </Text>
        <YStack
          height={260}
          minHeight={0}
          borderWidth={1}
          borderColor="$color6"
          borderRadius="$4"
          padding="$3"
          overflow="hidden">
          {children}
        </YStack>
      </YStack>
    );
    return (
      <XStack gap="$4" alignItems="stretch">
        <Box label="default — panel sizes to content and overflows the box">
          <Tabs items={items} />
        </Box>
        <Box label="fill — panel takes what the strip leaves and scrolls inside it">
          <Tabs items={items} fill />
        </Box>
      </XStack>
    );
  },
};

export const DisabledStates: Story = {
  render: () => (
    <YStack gap="$6">
      <YStack gap="$2">
        <Text fontSize="$2" color="$color11">
          single disabled tab
        </Text>
        <Tabs items={baseItems} />
      </YStack>
      <YStack gap="$2">
        <Text fontSize="$2" color="$color11">
          whole strip disabled
        </Text>
        <Tabs items={baseItems.slice(0, 3)} disabled />
      </YStack>
    </YStack>
  ),
};

export const CompactAndSize: Story = {
  render: () => (
    <YStack gap="$6">
      <YStack gap="$2">
        <Text fontSize="$2" color="$color11">
          size=$5 (height/type from size)
        </Text>
        <Tabs items={baseItems.slice(0, 3)} size="$5" />
      </YStack>
      <YStack gap="$2">
        <Text fontSize="$2" color="$color11">
          size=$5 compact (density steps pad, size stays)
        </Text>
        <Tabs items={baseItems.slice(0, 3)} size="$5" compact />
      </YStack>
      <YStack gap="$2">
        <Text fontSize="$2" color="$color11">
          nested compact (scale down)
        </Text>
        <YStack backgroundColor="$color3" borderRadius="$4" padding="$3" maxWidth={420}>
          <Tabs items={baseItems.slice(0, 3)} compact variant="contained" />
        </YStack>
      </YStack>
    </YStack>
  ),
};

export const EqualBand: Story = {
  render: () => (
    <YStack width={390} maxWidth="100%">
      <Tabs
        variant="band"
        ariaLabel="Sections"
        items={[
          { value: 'overview', label: 'Overview' },
          { value: 'activity', label: 'Activity' },
          { value: 'resources', label: 'Resources' },
          { value: 'reports', label: 'Reports' },
          { value: 'settings', label: 'Settings' },
        ]}
      />
    </YStack>
  ),
};

export const IntrinsicHorizontalHost: Story = {
  render: () => (
    <ScrollView horizontal width={390} maxWidth="100%">
      <Tabs items={baseItems} ariaLabel="Intrinsic tabs" />
    </ScrollView>
  ),
};

export const EqualSmall: Story = {
  render: () => (
    <YStack width={390} maxWidth="100%">
      <Tabs items={baseItems} distribution="equal" size="$2" ariaLabel="Compact equal sections" />
    </YStack>
  ),
};

export const InitialSixthActive: Story = {
  args: { defaultValue: 'section-6', ariaLabel: 'Example sections' },
  render: (args) => {
    const [wide, setWide] = React.useState(false);
    const [fullLabels, setFullLabels] = React.useState(true);
    const [hidden, setHidden] = React.useState(false);
    const [mount, setMount] = React.useState(0);
    const items: TabsItem[] = Array.from({ length: 6 }, (_, index) => ({
      value: `section-${index + 1}`,
      label: fullLabels ? `Section ${index + 1} overview` : `${index + 1}`,
      content: (
        <Panel
          title={`Section ${index + 1}`}
          body="The selected section stays visible when the strip is measured or resized."
        />
      ),
    }));
    return (
      <YStack gap="$3">
        <XStack gap="$2" flexWrap="wrap">
          <Button
            onPress={() => {
              setWide((value) => !value);
            }}>
            {wide ? 'Set width to 390px' : 'Set width to 800px'}
          </Button>
          <Button
            onPress={() => {
              setFullLabels((value) => !value);
            }}>
            {fullLabels ? 'Use short labels' : 'Load full labels'}
          </Button>
          <Button
            onPress={() => {
              setHidden((value) => !value);
            }}>
            {hidden ? 'Show strip' : 'Hide strip'}
          </Button>
          <Button
            onPress={() => {
              setMount((value) => value + 1);
            }}>
            Reset to sixth tab
          </Button>
        </XStack>
        <Text color="$color11">
          Use short labels, then load full labels to change content width. Hide and show the strip to defer usable
          measurements. Scroll manually after reveal to check that it stays put.
        </Text>
        <YStack width={wide ? 800 : 390} maxWidth="100%" display={hidden ? 'none' : 'flex'}>
          <Tabs key={mount} {...args} items={items} />
        </YStack>
      </YStack>
    );
  },
};
