import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { MentionInput } from './index';
import type { MentionConfig } from './index';

const meta: Meta<typeof MentionInput> = {
  title: 'Forms/MentionInput',
  component: MentionInput,
  parameters: {
    docs: {
      description: {
        component:
          'A text input component with @mention support for tagging users, hashtags, or other entities with autocomplete suggestions.',
      },
    },
  },
  argTypes: {
    label: { control: 'text', description: 'Field label' },
    placeholder: { control: 'text', description: 'Placeholder text' },
    helperText: { control: 'text', description: 'Helper text below the field' },
    error: { control: 'text', description: 'Error message' },
    required: { control: 'boolean', description: 'Mark field as required' },
    disabled: { control: 'boolean', description: 'Disable the input' },
    readOnly: { control: 'boolean', description: 'Read-only display' },
    compact: { control: 'boolean', description: 'Use compact density (tighter layout gaps)' },
    size: { control: 'select', options: ['$2', '$3', '$4'], description: 'Field size' },
    minHeight: { control: 'number', description: 'Minimum height of input' },
    maxHeight: { control: 'number', description: 'Maximum height of input' },
  },
};

export default meta;
type Story = StoryObj<typeof MentionInput>;

const userMentions: MentionConfig = {
  trigger: '@',
  data: [
    {
      id: '1',
      display: 'John Doe',
      avatar: 'https://i.pravatar.cc/150?img=1',
      description: 'Software Engineer',
    },
    {
      id: '2',
      display: 'Jane Smith',
      avatar: 'https://i.pravatar.cc/150?img=2',
      description: 'Product Manager',
    },
    {
      id: '3',
      display: 'Bob Johnson',
      avatar: 'https://i.pravatar.cc/150?img=3',
      description: 'Designer',
    },
    {
      id: '4',
      display: 'Alice Williams',
      avatar: 'https://i.pravatar.cc/150?img=4',
      description: 'Marketing',
    },
    {
      id: '5',
      display: 'Charlie Brown',
      avatar: 'https://i.pravatar.cc/150?img=5',
      description: 'Developer',
    },
  ],
  allowSpace: false,
  insertSpace: true,
};

const hashtagMentions: MentionConfig = {
  trigger: '#',
  data: [
    { id: 'react', display: 'react' },
    { id: 'javascript', display: 'javascript' },
    { id: 'typescript', display: 'typescript' },
    { id: 'webdev', display: 'webdev' },
    { id: 'programming', display: 'programming' },
  ],
  allowSpace: false,
  insertSpace: true,
};

export const Main: Story = {
  name: 'Main',
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: {
          comment: { text: '', mentions: [] },
          message: { text: '', mentions: [] },
        },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });

      return (
        <Form form={form}>
          <YStack gap="$4">
            <MentionInput
              label="Comment"
              name="comment"
              mentions={[userMentions]}
              helperText="Type @ to mention team members"
              onMentionSelect={(mention) => action('mentionSelected')(mention)}
              placeholder="Type @ to mention someone"
            />
            <MentionInput
              label="Message"
              name="message"
              mentions={[userMentions]}
              helperText="Write a message to your team"
              placeholder="Type @ to mention someone"
            />
            <Button action="submit">Submit</Button>
          </YStack>
        </Form>
      );
    };
    return <FormExample />;
  },
};

export const Standalone: Story = {
  args: {
    label: 'Comment',
    placeholder: 'Type @ to mention...',
    helperText: 'Mention people with @',
  },
  render: (args) => <MentionInput {...args} mentions={[userMentions]} />,
};

export const Basic: Story = {
  render: (args) => (
    <MentionInput
      {...args}
      mentions={[userMentions]}
      onMentionSelect={(mention, trigger) => action('onMentionSelect')(mention, trigger)}
    />
  ),
  args: {
    label: 'Comment',
    placeholder: 'Type @ to mention someone',
    disabled: false,
    minHeight: undefined,
    maxHeight: undefined,
  },
};

export const Disabled: Story = {
  render: (args) => <MentionInput {...args} mentions={[userMentions]} />,
  args: {
    label: 'Disabled Mention',
    disabled: true,
    placeholder: 'Cannot interact',
  },
};

export const WithError: Story = {
  render: (args) => <MentionInput {...args} mentions={[userMentions]} />,
  args: {
    label: 'Required Comment',
    error: 'This field is required',
    required: true,
    placeholder: 'Type @ to mention someone',
  },
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <MentionInput label="Small" size="$2" mentions={[userMentions]} placeholder="Type @ to mention" />
      <MentionInput label="Medium (default)" size="$3" mentions={[userMentions]} placeholder="Type @ to mention" />
      <MentionInput label="Large" size="$4" mentions={[userMentions]} placeholder="Type @ to mention" />
    </YStack>
  ),
};

export const Interactive: Story = {
  render: () => {
    const InteractiveExample = () => {
      const [value, setValue] = useState('');
      return (
        <YStack gap="$4" maxWidth={400}>
          <MentionInput
            label="Comment"
            defaultValue={value}
            onChange={(val) => {
              setValue(val.text);
              action('onChange')(val);
            }}
            mentions={[userMentions]}
            placeholder="Type @ to mention someone"
            helperText={value ? `Current text: ${value}` : 'Start typing...'}
          />
        </YStack>
      );
    };
    return <InteractiveExample />;
  },
};

export const MultipleTriggersStory: Story = {
  render: (args) => {
    const MultipleTriggersComponent = () => {
      const form = useForm({
        defaultValues: {
          post: { text: '', mentions: [] },
        },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });

      return (
        <YStack gap="$4">
          <MentionInput
            label="Create Post"
            name="post"
            form={form}
            mentions={[userMentions, hashtagMentions]}
            helperText="Use @ to mention team members and # for hashtags"
            onMentionSelect={(mention, trigger) => action('mentionSelected')(mention, trigger)}
            placeholder={args.placeholder}
            minHeight={args.minHeight}
            maxHeight={args.maxHeight}
            disabled={args.disabled}
          />
          <Button form={form as unknown as import('../../types').AnyFormApi} action="submit">
            Post
          </Button>
        </YStack>
      );
    };
    return <MultipleTriggersComponent />;
  },
  args: {
    placeholder: 'Type @ to mention users or # for hashtags',
    minHeight: 150,
    maxHeight: undefined,
    disabled: false,
  },
};

/** Loading placeholder — the skeleton mirrors the field's anatomy. */
export const SkeletonState: Story = {
  render: () => <MentionInput label="Comment" mentions={[userMentions]} skeleton />,
};

// >5 users so the mention list clears `select-too-few-options` (UX-P19).
const inTableMentionUsers = [...userMentions.data, { id: '6', display: 'Dana Lee', description: 'Support' }];
