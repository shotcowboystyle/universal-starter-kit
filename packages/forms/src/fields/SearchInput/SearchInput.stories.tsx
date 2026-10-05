import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { Paragraph, YStack } from 'tamagui';

import { SearchInput } from './index';

const meta: Meta<typeof SearchInput> = {
  title: 'Forms/SearchInput',
  component: SearchInput,
  parameters: { status: { type: 'beta' } },
  argTypes: {
    placeholder: { control: 'text' },
    debounceMs: { control: 'number' },
    clearable: { control: 'boolean' },
    disabled: { control: 'boolean' },
    compact: { control: 'boolean' },
    chromeless: { control: 'boolean' },
    size: { control: 'select', options: ['$2', '$3', '$4', '$5'] },
    defaultValue: { control: 'text' },
    label: { control: 'text' },
  },
  args: {
    placeholder: 'Search...',
    debounceMs: 300,
    clearable: true,
  },
};

export default meta;
type Story = StoryObj<typeof SearchInput>;

export const Main: Story = {
  render: (args) => (
    <YStack maxWidth={400}>
      <SearchInput
        {...args}
        onChange={(text) => action('onChange')(text)}
        onSearch={(text) => action('onSearch')(text)}
      />
    </YStack>
  ),
};

export const Debounced: Story = {
  render: () => {
    const Example = () => {
      const [live, setLive] = useState('');
      const [searched, setSearched] = useState('');
      return (
        <YStack gap="$3" maxWidth={400}>
          <SearchInput debounceMs={500} onChange={setLive} onSearch={setSearched} />
          <Paragraph size="$2" color="$color10">
            typing: {live || '(empty)'}
          </Paragraph>
          <Paragraph size="$2" color="$color10">
            searched (500ms debounce): {searched || '(empty)'}
          </Paragraph>
        </YStack>
      );
    };
    return <Example />;
  },
};

export const Controlled: Story = {
  render: () => {
    const Example = () => {
      const [value, setValue] = useState('preset query');
      return (
        <YStack gap="$3" maxWidth={400}>
          <SearchInput value={value} onChange={setValue} onSearch={(text) => action('onSearch')(text)} />
          <Paragraph size="$2" color="$color10">
            value: {value || '(empty)'}
          </Paragraph>
        </YStack>
      );
    };
    return <Example />;
  },
};

export const Filled: Story = {
  args: { defaultValue: 'pikachu' },
  render: (args) => (
    <YStack maxWidth={400}>
      <SearchInput {...args} />
    </YStack>
  ),
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <SearchInput size="$2" placeholder="Small" />
      <SearchInput size="$3" placeholder="Medium (default)" defaultValue="bulbasaur" />
      <SearchInput size="$4" placeholder="Large" />
    </YStack>
  ),
};

export const ToolbarCompact: Story = {
  name: 'Toolbar (compact + chromeless)',
  render: () => (
    <YStack maxWidth={400} backgroundColor="$color3" borderWidth={1} borderColor="$borderColor" padding="$2">
      <SearchInput compact chromeless size="$3" onSearch={(text) => action('onSearch')(text)} />
    </YStack>
  ),
};

export const NotClearable: Story = {
  args: { clearable: false, defaultValue: 'locked in' },
  render: (args) => (
    <YStack maxWidth={400}>
      <SearchInput {...args} />
    </YStack>
  ),
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: 'cannot touch' },
  render: (args) => (
    <YStack maxWidth={400}>
      <SearchInput {...args} />
    </YStack>
  ),
};

/** Loading placeholder — the skeleton mirrors the field's anatomy. */
export const SkeletonState: Story = {
  args: { label: 'Find', skeleton: true },
};

export const WithError: Story = {
  args: { label: 'Find', error: 'Too short', defaultValue: 'ab' },
  render: (args) => (
    <YStack maxWidth={400}>
      <SearchInput {...args} />
    </YStack>
  ),
};
