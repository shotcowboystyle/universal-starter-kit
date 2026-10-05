import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { TreeView, type TreeNode, type TreeViewProps } from './TreeView';
import { applyTreeMove } from './treeViewDnd';

const nodes: TreeNode[] = [
  {
    id: 'src',
    label: 'src',
    children: [
      {
        id: 'components',
        label: 'components',
        children: [
          { id: 'button', label: 'Button.tsx' },
          { id: 'input', label: 'Input.tsx' },
          { id: 'form', label: 'Form.tsx' },
        ],
      },
      {
        id: 'hooks',
        label: 'hooks',
        children: [
          { id: 'use-form', label: 'useForm.ts' },
          { id: 'use-theme', label: 'useTheme.ts' },
        ],
      },
      { id: 'index', label: 'index.ts' },
    ],
  },
  {
    id: 'tests',
    label: 'tests',
    children: [
      { id: 'button-test', label: 'Button.test.tsx' },
      { id: 'input-test', label: 'Input.test.tsx' },
    ],
  },
  { id: 'readme', label: 'README.md' },
  { id: 'package', label: 'package.json' },
];

const deepNodes: TreeNode[] = [
  {
    id: 'a',
    label: 'workspace',
    children: [
      {
        id: 'b',
        label: 'packages',
        children: [
          {
            id: 'c',
            label: 'components',
            children: [
              {
                id: 'd',
                label: 'src',
                children: [{ id: 'e', label: 'TreeView.tsx' }],
              },
            ],
          },
        ],
      },
    ],
  },
];

const longLabelNodes: TreeNode[] = [
  {
    id: 'long',
    label: 'A very long tree label that must truncate instead of blowing the row (LC-10 frame containment)',
    children: [
      {
        id: 'long-child',
        label: 'another-extremely-long-filename-that-should-ellipsis.tsx',
      },
    ],
  },
];

const meta: Meta<typeof TreeView> = {
  title: 'Components/TreeView',
  component: TreeView,
  args: {
    nodes,
    ariaLabel: 'Project files',
    height: 400,
    defaultExpandedIds: ['src', 'components'],
  },
  parameters: {
    status: { type: 'stable' },
  },
};
export default meta;

type Story = StoryObj<typeof TreeView>;

function SelectableTree(args: TreeViewProps) {
  const [selectedId, setSelectedId] = useState<string | undefined>(args.selectedId ?? 'button');
  return (
    <YStack height={args.height ? Number(args.height) + 20 : 420}>
      <TreeView
        {...args}
        selectedId={selectedId}
        onNodeSelect={(node) => {
          setSelectedId(node.id);
          args.onNodeSelect?.(node);
        }}
      />
    </YStack>
  );
}

export const Default: Story = {
  name: 'Main',
  args: { selectedId: 'button' },
  render: (args) => <SelectableTree {...args} />,
};

export const Compressed: Story = {
  name: 'Compressed',
  args: {
    display: 'compressed',
    showExpansionArrows: true,
    selectedId: undefined,
  },
  render: (args) => <SelectableTree {...args} />,
};

export const ExpandByDefault: Story = {
  name: 'Expand By Default',
  args: {
    expandByDefault: true,
    showExpansionArrows: true,
    defaultExpandedIds: undefined,
    height: 460,
  },
  render: (args) => <SelectableTree {...args} />,
};

/**
 * Drag-reorder enabled via `onNodeMove`: drag the row grip
 * (or long-press on touch) to move nodes between parents; keyboard uses the
 * kanban grammar — Space lifts, arrows move (right nests into the previous
 * sibling, left un-nests), Space drops, Escape cancels — with aria-live
 * position announcements. `applyTreeMove` applies the callback payload.
 */
export const Reorder: Story = {
  name: 'Reorder',
  args: { height: 420, selectedId: undefined },
  render: function ReorderStory(args) {
    const [tree, setTree] = useState<TreeNode[]>(args.nodes ?? nodes);
    const [selectedId, setSelectedId] = useState<string | undefined>();
    return (
      <YStack height={440}>
        <TreeView
          {...args}
          nodes={tree}
          selectedId={selectedId}
          onNodeSelect={(node) => {
            setSelectedId(node.id);
          }}
          onNodeMove={(nodeId, target) => {
            setTree((prev) => applyTreeMove(prev, nodeId, target));
          }}
        />
      </YStack>
    );
  },
};

/**
 * No nodes — neutral empty state via emptyMessage (Axiom 6: empty ≠ error).
 * TreeView has no isLoading/error props; those states cannot be rendered here
 * (component-capability gap).
 */
export const Empty: Story = {
  args: {
    nodes: [],
    ariaLabel: 'Empty tree',
    emptyMessage: 'No files found',
    height: 180,
  },
};

export const DeepNesting: Story = {
  name: 'Deep Nesting',
  args: {
    nodes: deepNodes,
    ariaLabel: 'Deep tree',
    expandByDefault: true,
    defaultExpandedIds: undefined,
    height: 280,
  },
  render: (args) => <SelectableTree {...args} />,
};

export const LongLabels: Story = {
  name: 'Long Labels',
  args: {
    nodes: longLabelNodes,
    ariaLabel: 'Long labels',
    expandByDefault: true,
    defaultExpandedIds: undefined,
    height: 160,
  },
  render: (args) => <SelectableTree {...args} />,
};

/**
 * Carbon: a collapsed ancestor of the selected node keeps a muted fill so
 * the selection is not lost when its parent is closed.
 */
export const ContainsSelection: Story = {
  name: 'Contains Selection',
  args: {
    selectedId: 'button',
    defaultExpandedIds: ['src'],
    height: 260,
    ariaLabel: 'Collapsed ancestor still shows selection',
  },
};
