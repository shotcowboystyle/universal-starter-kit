import type { GuardrailSpecimenParameter } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Paragraph, YStack } from 'tamagui';

import { Button } from '../Button';
import { Input } from '../InputParts';

import { ControlGroup } from './index';

const meta: Meta<typeof ControlGroup> = {
  title: 'Forms/ControlGroup',
  component: ControlGroup,
  parameters: { status: { type: 'beta' } },
  argTypes: {
    orientation: { control: 'select', options: ['horizontal', 'vertical'] },
  },
  args: {
    orientation: 'horizontal',
  },
};

export default meta;
type Story = StoryObj<typeof ControlGroup>;

export const Basic: Story = {
  render: (args) => (
    <YStack maxWidth={420}>
      <ControlGroup {...args}>
        <Button>First</Button>
        <Button>Middle</Button>
        <Button>Last</Button>
      </ControlGroup>
    </YStack>
  ),
};

export const Vertical: Story = {
  render: () => (
    <YStack maxWidth={240}>
      <ControlGroup orientation="vertical">
        <Button>Top</Button>
        <Button>Middle</Button>
        <Button>Bottom</Button>
      </ControlGroup>
    </YStack>
  ),
};

export const ChildCounts: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={420}>
      <Paragraph size="$2">empty</Paragraph>
      <ControlGroup>{null}</ControlGroup>
      <Paragraph size="$2">one child</Paragraph>
      <ControlGroup>
        <Button>Only</Button>
      </ControlGroup>
      <Paragraph size="$2">two children</Paragraph>
      <ControlGroup>
        <Button>One</Button>
        <Button>Two</Button>
      </ControlGroup>
      <Paragraph size="$2">five children</Paragraph>
      <ControlGroup>
        <Button>A</Button>
        <Button>B</Button>
        <Button>C</Button>
        <Button>D</Button>
        <Button>E</Button>
      </ControlGroup>
    </YStack>
  ),
};

export const MixedControls: Story = {
  parameters: {
    // Allowlist: the middle group deliberately shows a disabled segment
    // inside a joined strip. ControlGroup styles its DIRECT children by index,
    // so Button's visible disabledReason wrapper cannot ride along without
    // breaking the strip geometry — the same no-room class as icon toolbars.
    guardrailSpecimen: {
      warns: ['bare-disabled'],
      reason: 'Disabled-segment specimen: a joined ControlGroup strip has no room for the visible reason line.',
    } satisfies GuardrailSpecimenParameter,
  },
  render: () => (
    <YStack gap="$4" maxWidth={480}>
      <ControlGroup>
        <Button>Action</Button>
        <Input.Box>
          <Input.Area placeholder="type here" flex={1} />
        </Input.Box>
        <Button>Go</Button>
      </ControlGroup>
      <ControlGroup>
        <Button>Enabled</Button>
        <Button disabled>Disabled middle</Button>
        <Button>Enabled</Button>
      </ControlGroup>
      <ControlGroup>
        <Button>Short</Button>
        <Button>A much much much longer label that may overflow</Button>
        <Button>End</Button>
      </ControlGroup>
    </YStack>
  ),
};

export const Connected: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={480}>
      <ControlGroup>
        <ControlGroup.Addon>@</ControlGroup.Addon>
        <Input.Box>
          <Input.Area placeholder="username" flex={1} />
        </Input.Box>
      </ControlGroup>
      <ControlGroup>
        <ControlGroup.Addon>$</ControlGroup.Addon>
        <Input.Box>
          <Input.Area placeholder="0.00" flex={1} />
        </Input.Box>
        <ControlGroup.Addon>.00</ControlGroup.Addon>
      </ControlGroup>
      <ControlGroup>
        <ControlGroup.Addon>https://</ControlGroup.Addon>
        <Input.Box>
          <Input.Area placeholder="example.com/users" flex={1} />
        </Input.Box>
        <Button>Go</Button>
      </ControlGroup>
      <ControlGroup>
        <Button>Search</Button>
        <Input.Box>
          <Input.Area placeholder="query" flex={1} />
        </Input.Box>
        <Button>Filter</Button>
      </ControlGroup>
    </YStack>
  ),
};

export const RTL: Story = {
  render: () => (
    <div dir="rtl">
      <YStack maxWidth={420} gap="$4">
        <ControlGroup>
          <Button>الأول</Button>
          <Button>الأوسط</Button>
          <Button>الأخير</Button>
        </ControlGroup>
        <ControlGroup>
          <ControlGroup.Addon>@</ControlGroup.Addon>
          <Input.Box>
            <Input.Area placeholder="اسم المستخدم" flex={1} />
          </Input.Box>
        </ControlGroup>
      </YStack>
    </div>
  ),
};
