import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import { SvgUri } from './index';

const meta: Meta<typeof SvgUri> = {
  title: 'Components/SvgUri',
  component: SvgUri,
  tags: ['!test'],
  parameters: {
    docs: {
      description: {
        component:
          'Remote SVG loader. Paint belongs to the document (caller-owned). The primitive owns no chrome and adds no hardcoded colors; currentColor follows `$color`.',
      },
    },
  },
  argTypes: {
    uri: {
      control: 'text',
      description: 'URL of the SVG image',
    },
    width: {
      control: 'number',
      description: 'Width of the SVG',
    },
    height: {
      control: 'number',
      description: 'Height of the SVG',
    },
  },
};

export default meta;
type Story = StoryObj<typeof SvgUri>;

export const Basic: Story = {
  name: 'Main',
  args: {
    uri: 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/react.svg',
    width: 100,
    height: 100,
  },
  render: (args) => <SvgUri {...args} />,
};

export const WidthOnly: Story = {
  args: {
    uri: 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/react.svg',
    width: 120,
  },
  render: (args) => <SvgUri {...args} />,
};

export const HeightOnly: Story = {
  args: {
    uri: 'https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/react.svg',
    height: 120,
  },
  render: (args) => <SvgUri {...args} />,
};

export const DifferentSizes = () => (
  <YStack gap="$4">
    <SvgUri
      uri="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/typescript.svg"
      width={50}
      height={50}
    />
    <SvgUri
      uri="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/typescript.svg"
      width={100}
      height={100}
    />
    <SvgUri
      uri="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/typescript.svg"
      width={150}
      height={150}
    />
  </YStack>
);

export const MultipleSvgs = () => (
  <YStack gap="$4">
    <SvgUri
      uri="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/github.svg"
      width={80}
      height={80}
    />
    <SvgUri
      uri="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/gitlab.svg"
      width={80}
      height={80}
    />
    <SvgUri
      uri="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/bitbucket.svg"
      width={80}
      height={80}
    />
  </YStack>
);

export const InvalidUri: Story = {
  render: () => (
    <YStack gap="$4">
      <SvgUri uri="not-a-valid-url" width={100} height={100} />
      <SvgUri uri="" width={100} height={100} />
    </YStack>
  ),
};

export const CustomDimensions: Story = {
  render: () => (
    <SvgUri
      uri="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/javascript.svg"
      width={200}
      height={100}
    />
  ),
};
