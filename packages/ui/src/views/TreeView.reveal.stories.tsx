import { Button } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useRef, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';

import { TreeView, type TreeNode, type TreeViewProps } from './TreeView';

const folders: TreeNode[] = [
  {
    id: 'folders',
    label: 'Folders',
    children: [
      {
        id: 'archive',
        label: 'Archive',
        children: Array.from({ length: 500 }, (_, index) => ({
          id: `item-${index}`,
          label: `Item ${String(index).padStart(3, '0')}`,
        })),
      },
    ],
  },
  { id: 'other', label: 'Other', children: [{ id: 'other-item', label: 'Other item' }] },
];

const meta: Meta<typeof TreeView> = {
  title: 'Components/TreeView',
  component: TreeView,
  args: { height: 240, ariaLabel: 'Reveal fixture' },
  parameters: { status: { type: 'stable' } },
};
export default meta;
type Story = StoryObj<typeof TreeView>;

function RevealFixture(args: TreeViewProps) {
  const [nodes, setNodes] = useState(folders);
  const [expandedIds, setExpandedIds] = useState<string[]>(['other']);
  const [selectedId, setSelectedId] = useState<string>();
  const [revealRequest, setRevealRequest] = useState<TreeViewProps['revealRequest']>();
  const [completion, setCompletion] = useState<{
    request: NonNullable<TreeViewProps['revealRequest']>;
    count: number;
  }>();
  const [deferExpansion, setDeferExpansion] = useState(false);
  const [pendingExpansion, setPendingExpansion] = useState<string[]>();
  const [hidden, setHidden] = useState(false);
  const sequence = useRef(0);
  const reveal = (id: string) => {
    setSelectedId(id);
    setRevealRequest({ id, requestId: ++sequence.current });
  };
  return (
    <YStack gap="$3" width="100%" maxWidth={700}>
      <XStack gap="$2" flexWrap="wrap">
        <Button
          onPress={() => {
            reveal('item-499');
          }}>
          Reveal last item
        </Button>
        <Button
          onPress={() => {
            reveal('item-0');
          }}>
          Reveal first item
        </Button>
        <Button
          onPress={() => {
            reveal('other-item');
          }}>
          Reveal other item
        </Button>
        <Button
          onPress={() => {
            setSelectedId('item-499');
          }}>
          Select only
        </Button>
        <Button
          onPress={() => {
            setExpandedIds(['other']);
          }}>
          Collapse archive
        </Button>
      </XStack>
      <XStack gap="$2" flexWrap="wrap">
        <Button
          onPress={() => {
            setNodes([]);
          }}>
          Remove data
        </Button>
        <Button
          onPress={() => {
            setNodes(folders);
          }}>
          Deliver data
        </Button>
        <Button
          onPress={() => {
            setHidden((value) => !value);
          }}>
          {hidden ? 'Show tree' : 'Hide tree'}
        </Button>
        <Button
          onPress={() => {
            setDeferExpansion((value) => !value);
          }}>
          {deferExpansion ? 'Accept expansion immediately' : 'Defer expansion'}
        </Button>
        {pendingExpansion && (
          <Button
            onPress={() => {
              setExpandedIds(pendingExpansion);
              setPendingExpansion(undefined);
            }}>
            Accept pending expansion
          </Button>
        )}
      </XStack>
      <Text>500 variable-height items. Request: {revealRequest?.requestId ?? 'none'}</Text>
      <Text>
        Target: {revealRequest?.id ?? 'none'}. Expanded: {expandedIds.join(', ')}
      </Text>
      <Text>
        Measured completion: {completion ? `${completion.request.id} (${completion.request.requestId})` : 'none'}.
        Callback count: {completion?.count ?? 0}
      </Text>
      <YStack display={hidden ? 'none' : 'flex'}>
        <TreeView
          {...args}
          nodes={nodes}
          expandedIds={expandedIds}
          onExpandedIdsChange={(ids) => {
            if (deferExpansion) {
              setPendingExpansion(ids);
            } else {
              setExpandedIds(ids);
            }
          }}
          selectedId={selectedId}
          revealRequest={revealRequest}
          onRevealComplete={(request) => {
            setCompletion((previous) => ({ request, count: (previous?.count ?? 0) + 1 }));
            args.onRevealComplete?.(request);
          }}
          onNodeSelect={(node) => {
            setSelectedId(node.id);
          }}
          renderNode={(node) => {
            const index = Number(node.id.replace('item-', ''));
            return (
              <YStack minHeight={Number.isFinite(index) && index % 2 ? 80 : 32} justifyContent="center">
                <Text>{node.label}</Text>
                {Number.isFinite(index) && index % 2 === 1 && <Text fontSize="$2">Additional detail</Text>}
              </YStack>
            );
          }}
        />
      </YStack>
    </YStack>
  );
}

export const ControlledReveal: Story = {
  name: 'Controlled reveal with 500 variable-height items',
  render: (args) => <RevealFixture {...args} />,
};

function RetainedScrollFixture(args: TreeViewProps) {
  const [mounted, setMounted] = useState(true);
  const [generation, setGeneration] = useState(0);
  const [nodes, setNodes] = useState(folders);
  const [hidden, setHidden] = useState(false);
  const [taller, setTaller] = useState(false);
  const [savedOffset, setSavedOffset] = useState<number>();
  const [observations, setObservations] = useState(0);
  const [expandedIds, setExpandedIds] = useState(['folders', 'archive', 'other']);
  const [revealRequest, setRevealRequest] = useState<TreeViewProps['revealRequest']>();
  const [completion, setCompletion] = useState<string>();
  const sequence = useRef(0);
  const revealLast = () => {
    setRevealRequest({ id: 'item-499', requestId: ++sequence.current });
  };
  return (
    <YStack gap="$3" width="100%" maxWidth={700}>
      <Text>
        Scroll manually, unmount, then mount. The observed offset and expansion survive outside the tree. Remount with
        delayed data or a hidden host to check deferred restoration.
      </Text>
      <XStack gap="$2" flexWrap="wrap">
        <Button
          onPress={() => {
            setMounted((value) => !value);
          }}>
          {mounted ? 'Unmount tree' : 'Mount tree'}
        </Button>
        <Button
          onPress={() => {
            setNodes([]);
            setMounted(true);
            setGeneration((value) => value + 1);
          }}>
          Remount without data
        </Button>
        <Button
          onPress={() => {
            setNodes(folders);
          }}>
          Deliver data
        </Button>
        <Button
          onPress={() => {
            setHidden(true);
            setMounted(true);
            setGeneration((value) => value + 1);
          }}>
          Remount hidden
        </Button>
        <Button
          onPress={() => {
            setHidden((value) => !value);
          }}>
          {hidden ? 'Show tree' : 'Hide tree'}
        </Button>
      </XStack>
      <XStack gap="$2" flexWrap="wrap">
        <Button onPress={revealLast}>Reveal last item</Button>
        <Button
          onPress={() => {
            revealLast();
            setMounted(true);
            setGeneration((value) => value + 1);
          }}>
          Remount with reveal
        </Button>
        <Button
          onPress={() => {
            setTaller((value) => !value);
          }}>
          {taller ? 'Use configured height' : 'Double viewport height'}
        </Button>
      </XStack>
      <Text>
        Retained observed offset: {savedOffset ?? 'none'}. Observations: {observations}.
      </Text>
      <Text>
        Initial fallback: {args.initialScrollOffset ?? 'none'}. Mounted: {String(mounted)}.
      </Text>
      <Text>
        Pending reveal: {revealRequest?.requestId ?? 'none'}. Measured completion: {completion ?? 'none'}.
      </Text>
      <YStack display={hidden ? 'none' : 'flex'}>
        {mounted && (
          <TreeView
            {...args}
            key={generation}
            nodes={nodes}
            height={taller ? (args.height ?? 240) * 2 : args.height}
            expandedIds={expandedIds}
            onExpandedIdsChange={setExpandedIds}
            initialScrollOffset={savedOffset ?? args.initialScrollOffset}
            onScrollOffsetChange={(offset) => {
              setSavedOffset(offset);
              setObservations((value) => value + 1);
              args.onScrollOffsetChange?.(offset);
            }}
            revealRequest={revealRequest}
            onRevealComplete={(request) => {
              setCompletion(`${request.id} (${request.requestId})`);
              setRevealRequest((pending) => (pending?.requestId === request.requestId ? undefined : pending));
              args.onRevealComplete?.(request);
            }}
            renderNode={(node) => {
              const index = Number(node.id.replace('item-', ''));
              return (
                <YStack minHeight={Number.isFinite(index) && index % 2 ? 80 : 32} justifyContent="center">
                  <Text>{node.label}</Text>
                  {Number.isFinite(index) && index % 2 === 1 && <Text fontSize="$2">Additional detail</Text>}
                </YStack>
              );
            }}
          />
        )}
      </YStack>
    </YStack>
  );
}

export const RetainedScroll: Story = {
  name: 'Retained scroll across unmount and delayed layout',
  args: { initialScrollOffset: 640.5, ariaLabel: 'Retained scroll fixture' },
  render: (args) => <RetainedScrollFixture {...args} />,
};
