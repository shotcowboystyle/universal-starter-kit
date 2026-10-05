import { action } from '@repo/storybook';
import { YStack, Text, XStack } from 'tamagui';

import { Timeline, type TimelineEntry } from './Timeline';

export default {
  title: 'Components/Timeline',
  component: Timeline,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'A generic timeline/activity feed component displaying comments, version history, and other activity.',
      },
    },
  },
  argTypes: {
    compact: { control: 'boolean', description: 'Use compact layout' },
    enableAddComment: { control: 'boolean', description: 'Allow adding comments' },
    disabled: { control: 'boolean', description: 'Disable interactions (read-only)' },
  },
};

const sampleEntries: TimelineEntry[] = [
  {
    id: 'entry-1',
    type: 'version',
    author: 'john@example.com',
    timestamp: '2026-01-24T12:00:00Z',
    changes: [
      { field: 'status', old: 'Draft', new: 'Submitted' },
      { field: 'total', old: 1000, new: 1200 },
    ],
  },
  {
    id: 'entry-2',
    type: 'comment',
    content: 'Pricing looks good. Approved!',
    author: 'manager@example.com',
    timestamp: '2026-01-24T11:45:00Z',
  },
  {
    id: 'entry-3',
    type: 'comment',
    content: 'Please review the pricing before approval.',
    author: 'john@example.com',
    timestamp: '2026-01-24T10:30:00Z',
  },
  {
    id: 'entry-4',
    type: 'attachment',
    content: 'Added invoice-draft.pdf',
    author: 'john@example.com',
    timestamp: '2026-01-24T09:15:00Z',
  },
  {
    id: 'entry-5',
    type: 'assignment',
    content: 'Assigned to Finance Team',
    author: 'admin@example.com',
    timestamp: '2026-01-24T08:00:00Z',
  },
];

// Timestamps relative to "now" so the default relative formatter reads naturally.
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const commentFeedEntries: TimelineEntry[] = [
  {
    id: 'c-1',
    type: 'comment',
    author: 'sarah.chen@acme.com',
    content:
      'I walked the customer through the migration plan this morning. They want the cutover moved to the first week of November.',
    timestamp: minutesAgo(120),
  },
  {
    id: 'c-1-r1',
    type: 'comment',
    parentId: 'c-1',
    author: 'marcus@acme.com',
    authorName: 'Marcus Wright',
    content: "November works. I'll update the project schedule today.",
    timestamp: minutesAgo(90),
  },
  {
    id: 'c-1-r2',
    type: 'comment',
    parentId: 'c-1-r1',
    author: 'dev.ops@acme.com',
    content: 'Reminder that the staging freeze starts Oct 28 — plan around it.',
    timestamp: minutesAgo(45),
  },
  {
    id: 's-1',
    type: 'version',
    author: 'sarah.chen@acme.com',
    timestamp: minutesAgo(60 * 5),
    changes: [
      { field: 'status', fieldLabel: 'Status', old: 'Draft', new: 'In Review' },
      { field: 'priority', fieldLabel: 'Priority', old: 'Low', new: 'High' },
    ],
  },
  {
    id: 's-2',
    type: 'attachment',
    author: 'marcus@acme.com',
    authorName: 'Marcus Wright',
    content: 'migration-plan-v2.pdf',
    timestamp: minutesAgo(60 * 8),
  },
  {
    id: 'c-2',
    type: 'comment',
    author: 'priya_patel@acme.com',
    content: "Flagging that the customer's security review is still pending — it could slip the timeline.",
    timestamp: minutesAgo(60 * 24 * 2),
  },
  {
    id: 's-3',
    type: 'assignment',
    author: 'admin@acme.com',
    content: 'sarah.chen@acme.com',
    timestamp: minutesAgo(60 * 24 * 10),
  },
];

export const Comments = () => (
  <Timeline label="Activity" entries={commentFeedEntries} onCommentSubmit={action('onCommentSubmit')} />
);
Comments.parameters = {
  docs: {
    description: {
      story:
        'Desk/GitHub activity feed: comments sit in a card on a vertical spine; system events are compact badge rows on the same rail. Rows are one stacked group (LC-72) — outer corners only, hairlines between items. Composer at the top submits via onCommentSubmit(text, { parentId? }).',
    },
  },
};

export const Default = () => (
  <Timeline
    entries={sampleEntries}
    onCommentAdded={(content) => {
      console.log('Comment:', content);
    }}
  />
);

export const Playground = {
  args: { compact: false, disabled: false, enableAddComment: true },
  render: (args: { compact?: boolean; disabled?: boolean; enableAddComment?: boolean }) => (
    <Timeline
      entries={sampleEntries}
      onCommentAdded={(content) => {
        console.log('Comment:', content);
      }}
      {...args}
    />
  ),
};
Default.storyName = 'Main';
Default.parameters = {
  docs: {
    description: {
      story: 'Mixed comments and system events on the activity spine.',
    },
  },
};

export const CommentsOnly = () => (
  <Timeline
    entries={sampleEntries.filter((e) => e.type === 'comment')}
    onCommentAdded={(content) => {
      console.log('Comment:', content);
    }}
  />
);
CommentsOnly.parameters = {
  docs: {
    description: {
      story: 'Timeline showing only comment entries.',
    },
  },
};

export const CompactMode = () => (
  <Timeline
    entries={sampleEntries}
    compact
    onCommentAdded={(content) => {
      console.log('Comment:', content);
    }}
  />
);
CompactMode.parameters = {
  docs: {
    description: {
      story: 'Compact layout for smaller UI spaces.',
    },
  },
};

export const Empty = () => (
  <Timeline
    entries={[]}
    onCommentAdded={(content) => {
      console.log('Comment:', content);
    }}
  />
);
Empty.parameters = {
  docs: {
    description: {
      story: 'Empty timeline with no activity.',
    },
  },
};

export const Loading = () => (
  <Timeline label="Activity" entries={[]} isLoading onCommentSubmit={action('onCommentSubmit')} />
);
Loading.parameters = {
  docs: {
    description: {
      story:
        'Entries still loading — the comment-row skeleton twin (avatar block + name/body lines) renders instead of the feed, never the empty chrome (LC-20 / DG-ST-02).',
    },
  },
};

export const Error = () => (
  <Timeline
    label="Activity"
    entries={[]}
    error="The activity feed could not be loaded."
    onRetry={action('onRetry')}
    onCommentSubmit={action('onCommentSubmit')}
  />
);
Error.parameters = {
  docs: {
    description: {
      story:
        'Failed load wins over empty — error chrome with Retry, never "No activity yet"; the composer and entry count hide so a failed feed can\'t invite comments or lie about counts (DG-ST-01 / DG-ST-04 / Axiom 6).',
    },
  },
};

export const CustomEntryRenderer = () => (
  <Timeline
    entries={sampleEntries}
    renderEntry={(entry: TimelineEntry, defaultContent) => (
      <YStack key={entry.id} paddingBottom="$2">
        <YStack
          padding="$3"
          gap="$1"
          backgroundColor={entry.type === 'comment' ? '$blue2' : '$gray2'}
          borderRadius="$3">
          <XStack justifyContent="space-between">
            <Text fontSize="$2" fontWeight="600">
              {entry.author}
            </Text>
            <Text fontSize="$1" color="$gray10">
              {entry.type}
            </Text>
          </XStack>
          {defaultContent}
        </YStack>
      </YStack>
    )}
  />
);
CustomEntryRenderer.parameters = {
  docs: {
    description: {
      story: 'Timeline with custom entry styling based on entry type.',
    },
  },
};

export const AllStates = () => (
  <YStack gap="$6">
    <YStack gap="$2">
      <Text fontWeight="600">With Activity</Text>
      <Timeline entries={sampleEntries} />
    </YStack>

    <YStack gap="$2">
      <Text fontWeight="600">Empty</Text>
      <Timeline
        entries={[]}
        onCommentAdded={(content) => {
          console.log('Comment:', content);
        }}
      />
    </YStack>

    <YStack gap="$2">
      <Text fontWeight="600">Compact</Text>
      <Timeline entries={sampleEntries.slice(0, 2)} compact />
    </YStack>
  </YStack>
);
AllStates.parameters = {
  docs: {
    description: {
      story: 'All states of the Timeline component.',
    },
  },
};
