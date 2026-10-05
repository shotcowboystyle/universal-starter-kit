import { useState, type ComponentProps } from 'react';
import { YStack, Text } from 'tamagui';

import { Tags, type TagItem } from './Tags';

export default {
  title: 'Components/Tags',
  component: Tags,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Token-field tags (Polariss Combobox + GitHub TokenInput): chips live in one input-surface, type/Enter/comma to add, Backspace removes the last tag.',
      },
    },
  },
  argTypes: {
    enableAdd: { control: 'boolean', description: 'Allow adding new tags' },
    enableRemove: { control: 'boolean', description: 'Allow removing tags' },
    maxTags: { control: 'number', description: 'Maximum number of tags' },
    compact: { control: 'boolean', description: 'Use compact layout' },
    disabled: { control: 'boolean', description: 'Disable all interactions' },
  },
};

const sampleTags: TagItem[] = [
  { id: 'tag-1', label: 'urgent' },
  { id: 'tag-2', label: 'important' },
  { id: 'tag-3', label: 'review' },
];

const allSuggestions: TagItem[] = [
  { id: 'sug-1', label: 'follow-up' },
  { id: 'sug-2', label: 'completed' },
  { id: 'sug-3', label: 'pending' },
  { id: 'sug-4', label: 'bug' },
];

function TagsPlayground({
  initialTags = sampleTags,
  ...props
}: Partial<ComponentProps<typeof Tags>> & { initialTags?: TagItem[] }) {
  const [tags, setTags] = useState<TagItem[]>(initialTags);
  return (
    <Tags
      tags={tags}
      suggestions={allSuggestions}
      onAdd={(name) => {
        const id = `tag-${name.toLowerCase().replace(/\s+/g, '-')}-${tags.length}`;
        setTags((prev) => [...prev, { id, label: name }]);
      }}
      onRemove={(tag) => {
        setTags((prev) => prev.filter((item) => item.id !== tag.id));
      }}
      {...props}
    />
  );
}

export const Default = () => <TagsPlayground />;
Default.storyName = 'Main';
Default.parameters = {
  docs: {
    description: {
      story: 'Token field with add, remove, and suggestion listbox.',
    },
  },
};

export const ReadOnly = () => <Tags tags={sampleTags} enableAdd={false} enableRemove={false} />;
ReadOnly.parameters = {
  docs: {
    description: {
      story: 'Read-only tags without add or remove options.',
    },
  },
};

export const CompactMode = () => <TagsPlayground compact />;
CompactMode.parameters = {
  docs: {
    description: {
      story: 'Compact layout for smaller UI spaces.',
    },
  },
};

export const Empty = () => <TagsPlayground initialTags={[]} placeholder="Add your first tag..." />;
Empty.parameters = {
  docs: {
    description: {
      story: 'Empty token field ready for adding tags.',
    },
  },
};

export const AllStates = () => (
  <YStack gap="$6" width="100%" maxWidth={480}>
    <YStack gap="$2">
      <Text fontWeight="600">With Tags</Text>
      <TagsPlayground />
    </YStack>

    <YStack gap="$2">
      <Text fontWeight="600">Empty</Text>
      <TagsPlayground initialTags={[]} placeholder="Add tag..." />
    </YStack>

    <YStack gap="$2">
      <Text fontWeight="600">Read Only</Text>
      <Tags tags={sampleTags.slice(0, 2)} enableAdd={false} enableRemove={false} />
    </YStack>

    <YStack gap="$2">
      <Text fontWeight="600">Disabled</Text>
      <Tags tags={sampleTags.slice(0, 1)} disabled />
    </YStack>

    <YStack gap="$2">
      <Text fontWeight="600">Compact</Text>
      <TagsPlayground compact />
    </YStack>
  </YStack>
);
AllStates.parameters = {
  docs: {
    description: {
      story: 'All states of the Tags token field.',
    },
  },
};
