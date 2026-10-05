import { describe, expect, it } from 'vitest';

import {
  applyTreeMove,
  childrenOf,
  describeTreeCancel,
  describeTreeDragState,
  flattenDndRows,
  indicatorForTarget,
  locateNode,
  resolveTreeDrop,
  subtreeIds,
  toWdIndex,
  treeDropTargetForY,
  treeKeyboardLift,
  treeKeyboardMove,
  wdChildCount,
  type DndTreeNode,
} from './treeViewDnd';

const H = 36;
const getHeight = () => H;

// src/
//   components/
//     button
//     input
//   hooks/          (collapsed in most probes)
//     use-form
//   index
// readme
const tree: DndTreeNode[] = [
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
        ],
      },
      { id: 'hooks', label: 'hooks', children: [{ id: 'use-form', label: 'useForm.ts' }] },
      { id: 'index', label: 'index.ts' },
    ],
  },
  { id: 'readme', label: 'README.md' },
];

const allExpanded = new Set(['src', 'components', 'hooks']);

describe('structure lookups', () => {
  it('locates nodes with parent + index', () => {
    expect(locateNode(tree, 'src')).toMatchObject({ parentId: null, index: 0 });
    expect(locateNode(tree, 'input')).toMatchObject({ parentId: 'components', index: 1 });
    expect(locateNode(tree, 'readme')).toMatchObject({ parentId: null, index: 1 });
    expect(locateNode(tree, 'missing')).toBeNull();
  });

  it('resolves children of a parent (null = roots)', () => {
    expect(childrenOf(tree, null).map((n) => n.id)).toEqual(['src', 'readme']);
    expect(childrenOf(tree, 'components').map((n) => n.id)).toEqual(['button', 'input']);
    expect(childrenOf(tree, 'button')).toEqual([]);
  });

  it('collects the dragged subtree', () => {
    expect([...subtreeIds(tree, 'src')].sort()).toEqual(
      ['components', 'button', 'hooks', 'index', 'input', 'src', 'use-form'].sort(),
    );
    expect([...subtreeIds(tree, 'readme')]).toEqual(['readme']);
  });

  it('flattens visible rows with depth and expansion', () => {
    const rows = flattenDndRows(tree, new Set(['src']));
    expect(rows.map((r) => r.id)).toEqual(['src', 'components', 'hooks', 'index', 'readme']);
    expect(rows[1]).toMatchObject({ parentId: 'src', childIndex: 0, depth: 1, isExpanded: false });
  });

  it('computes wd counts and indexes around the dragged node', () => {
    const session = { nodeId: 'components', sourceParentId: 'src', sourceIndex: 0 };
    expect(wdChildCount(tree, session, 'src')).toBe(2);
    expect(wdChildCount(tree, session, null)).toBe(2);
    expect(toWdIndex(session, 'src', 2)).toBe(1); // index after the dragged slot shifts down
    expect(toWdIndex(session, 'src', 0)).toBe(0);
    expect(toWdIndex(session, null, 1)).toBe(1); // other parents unaffected
  });
});

describe('keyboard drag state machine', () => {
  it('lifts a node at its own position (identity target)', () => {
    const session = treeKeyboardLift(tree, 'input');
    expect(session).toEqual({
      nodeId: 'input',
      sourceParentId: 'components',
      sourceIndex: 1,
      target: { parentId: 'components', index: 1 },
    });
  });

  it('rejects lifting a node that does not exist', () => {
    expect(treeKeyboardLift(tree, 'missing')).toBeNull();
  });

  it('moves up/down within the parent and clamps at boundaries', () => {
    let session = treeKeyboardLift(tree, 'input')!;
    session = treeKeyboardMove(session, tree, 'up');
    expect(session.target).toEqual({ parentId: 'components', index: 0 });
    const clamped = treeKeyboardMove(session, tree, 'up');
    expect(clamped).toBe(session); // boundary no-op returns the same session
    session = treeKeyboardMove(session, tree, 'down');
    expect(session.target).toEqual({ parentId: 'components', index: 1 });
    // components holds 2 children; dragging one leaves wd max = 1
    expect(treeKeyboardMove(session, tree, 'down')).toBe(session);
  });

  it('right nests into the previous sibling as its last child', () => {
    // index (child 2 of src) lifted; position above it is hooks
    let session = treeKeyboardLift(tree, 'index')!;
    session = treeKeyboardMove(session, tree, 'right');
    expect(session.target).toEqual({ parentId: 'hooks', index: 1 }); // hooks has 1 child
  });

  it('right at index 0 is a no-op', () => {
    const session = treeKeyboardLift(tree, 'components')!; // index 0 in src
    expect(treeKeyboardMove(session, tree, 'right')).toBe(session);
  });

  it('left un-nests to after the current parent', () => {
    let session = treeKeyboardLift(tree, 'input')!;
    session = treeKeyboardMove(session, tree, 'left');
    // components is child 0 of src → insert after it
    expect(session.target).toEqual({ parentId: 'src', index: 1 });
    session = treeKeyboardMove(session, tree, 'left');
    // src is root 0 → insert after it at top level
    expect(session.target).toEqual({ parentId: null, index: 1 });
    expect(treeKeyboardMove(session, tree, 'left')).toBe(session); // top level → no-op
  });

  it("un-nest converts the parent's index to wd coordinates", () => {
    // Drag hooks (child 1 of src); un-nest from inside hooks' own parent chain:
    // lift hooks, nest right into components? components is above it.
    let session = treeKeyboardLift(tree, 'hooks')!;
    session = treeKeyboardMove(session, tree, 'right'); // into components (index 1 → prev sibling)
    expect(session.target).toEqual({ parentId: 'components', index: 2 });
    session = treeKeyboardMove(session, tree, 'left'); // back out: after components in src
    // components is child 0 of src; hooks (dragged) was child 1 → wd index of components = 0
    expect(session.target).toEqual({ parentId: 'src', index: 1 });
  });

  it('resolves drops: no-op at origin, commit elsewhere', () => {
    const home = treeKeyboardLift(tree, 'input')!;
    expect(resolveTreeDrop(home).commit).toBe(false);
    const moved = treeKeyboardMove(home, tree, 'up');
    const result = resolveTreeDrop(moved);
    expect(result.commit).toBe(true);
    expect(result.from).toEqual({ parentId: 'components', index: 1 });
    expect(result.to).toEqual({ parentId: 'components', index: 0 });
  });
});

describe('treeDropTargetForY (pointer band model)', () => {
  // Fully expanded flat order: src, components, button, input, hooks, use-form, index, readme
  const rows = flattenDndRows(tree, allExpanded);
  const session = { nodeId: 'readme', sourceParentId: null, sourceIndex: 1 };
  const draggedSubtree = subtreeIds(tree, 'readme');
  const base = { rows, getHeight, session, draggedSubtree };

  it('top band inserts before the row', () => {
    // button is flat row 2 → top band at y = 2H + 2
    const hit = treeDropTargetForY({ ...base, localY: 2 * H + 2 })!;
    expect(hit.target).toEqual({ parentId: 'components', index: 0 });
    expect(hit.indicator).toEqual({ kind: 'line', flatIndex: 2, depth: 2 });
  });

  it('bottom band inserts after the row', () => {
    // button bottom band: y = 2H + 0.9H
    const hit = treeDropTargetForY({ ...base, localY: 2.9 * H })!;
    expect(hit.target).toEqual({ parentId: 'components', index: 1 });
    expect(hit.indicator).toEqual({ kind: 'line', flatIndex: 3, depth: 2 });
  });

  it('bottom band on an expanded branch targets its first-child slot', () => {
    // components is flat row 1 (expanded) → bottom band
    const hit = treeDropTargetForY({ ...base, localY: 1.9 * H })!;
    expect(hit.target).toEqual({ parentId: 'components', index: 0 });
    expect(hit.indicator).toEqual({ kind: 'line', flatIndex: 2, depth: 2 });
  });

  it('middle band nests into the row (parent highlight)', () => {
    // hooks is flat row 4 → middle band
    const hit = treeDropTargetForY({ ...base, localY: 4.5 * H })!;
    expect(hit.target).toEqual({ parentId: 'hooks', index: 1 });
    expect(hit.indicator).toEqual({ kind: 'into', parentId: 'hooks' });
  });

  it('middle band over a leaf nests into it at index 0', () => {
    // index is flat row 6
    const hit = treeDropTargetForY({ ...base, localY: 6.5 * H })!;
    expect(hit.target).toEqual({ parentId: 'index', index: 0 });
    expect(hit.indicator).toEqual({ kind: 'into', parentId: 'index' });
  });

  it('beyond the last row appends at the top level', () => {
    const hit = treeDropTargetForY({ ...base, localY: 99 * H })!;
    expect(hit.target).toEqual({ parentId: null, index: 1 }); // readme dragged → wd root count 1
    expect(hit.indicator).toEqual({ kind: 'line', flatIndex: rows.length, depth: 0 });
  });

  it('returns null over the dragged subtree', () => {
    const srcSession = { nodeId: 'src', sourceParentId: null, sourceIndex: 0 };
    const hit = treeDropTargetForY({
      ...base,
      session: srcSession,
      draggedSubtree: subtreeIds(tree, 'src'),
      localY: 2.5 * H, // over button, inside the dragged subtree
    });
    expect(hit).toBeNull();
  });

  it('wd-adjusts sibling indexes in the source parent', () => {
    // Drag button (child 0 of components); before-input line must be wd index 0.
    const s = { nodeId: 'button', sourceParentId: 'components', sourceIndex: 0 };
    const hit = treeDropTargetForY({
      ...base,
      session: s,
      draggedSubtree: subtreeIds(tree, 'button'),
      localY: 3 * H + 2, // top band of input (flat row 3)
    })!;
    expect(hit.target).toEqual({ parentId: 'components', index: 0 });
  });
});

describe('indicatorForTarget (keyboard indicator)', () => {
  const rows = flattenDndRows(tree, allExpanded);

  it('points at the sibling row the target displaces', () => {
    const session = treeKeyboardLift(tree, 'input')!;
    const moved = treeKeyboardMove(session, tree, 'up');
    // target components[0] → line above button (flat row 2)
    expect(indicatorForTarget(rows, moved, moved.target)).toEqual({
      kind: 'line',
      flatIndex: 2,
      depth: 2,
    });
  });

  it("append positions land after the last visible sibling's subtree", () => {
    const session = treeKeyboardLift(tree, 'readme')!;
    // target = top level index 1 (after src's whole subtree)
    expect(indicatorForTarget(rows, session, { parentId: null, index: 1 })).toEqual({
      kind: 'line',
      flatIndex: 7, // after src + its 6 visible descendants
      depth: 0,
    });
  });

  it('falls back to the parent highlight when no children are visible', () => {
    const collapsedRows = flattenDndRows(tree, new Set(['src']));
    const session = treeKeyboardLift(tree, 'index')!;
    const nested = treeKeyboardMove(session, tree, 'right'); // into hooks (collapsed)
    expect(indicatorForTarget(collapsedRows, nested, nested.target)).toEqual({
      kind: 'into',
      parentId: 'hooks',
    });
  });
});

describe('applyTreeMove', () => {
  it('reorders within a parent using wd coordinates', () => {
    const next = applyTreeMove(tree, 'input', { parentId: 'components', index: 0 });
    expect(childrenOf(next, 'components').map((n) => n.id)).toEqual(['button', 'input'].reverse());
  });

  it('moves a node (with its subtree) to another parent', () => {
    const next = applyTreeMove(tree, 'components', { parentId: 'hooks', index: 1 });
    expect(childrenOf(next, 'src').map((n) => n.id)).toEqual(['hooks', 'index']);
    expect(childrenOf(next, 'hooks').map((n) => n.id)).toEqual(['use-form', 'components']);
    expect(childrenOf(next, 'components').map((n) => n.id)).toEqual(['button', 'input']);
  });

  it('moves to the top level', () => {
    const next = applyTreeMove(tree, 'input', { parentId: null, index: 2 });
    expect(next.map((n) => n.id)).toEqual(['src', 'readme', 'input']);
  });

  it('nests into a leaf, creating its children array', () => {
    const next = applyTreeMove(tree, 'readme', { parentId: 'index', index: 0 });
    expect(childrenOf(next, 'index').map((n) => n.id)).toEqual(['readme']);
  });

  it('refuses to move a node into its own subtree', () => {
    const next = applyTreeMove(tree, 'src', { parentId: 'components', index: 0 });
    expect(next.map((n) => n.id)).toEqual(['src', 'readme']);
    expect(childrenOf(next, 'components').map((n) => n.id)).toEqual(['button', 'input']);
  });

  it('refuses unknown nodes and unknown targets', () => {
    expect(applyTreeMove(tree, 'missing', { parentId: null, index: 0 }).map((n) => n.id)).toEqual(['src', 'readme']);
    expect(applyTreeMove(tree, 'readme', { parentId: 'missing', index: 0 }).map((n) => n.id)).toEqual([
      'src',
      'readme',
    ]);
  });

  it('does not mutate the input tree', () => {
    const snapshot = JSON.stringify(tree);
    applyTreeMove(tree, 'input', { parentId: null, index: 0 });
    expect(JSON.stringify(tree)).toBe(snapshot);
  });
});

describe('announcements', () => {
  it('announces lift, move, drop with 1-based positions and parent labels', () => {
    let session = treeKeyboardLift(tree, 'input')!;
    expect(describeTreeDragState('lift', session, tree, 'Input.tsx')).toEqual({
      type: 'lift',
      node: 'Input.tsx',
      parent: 'components',
      position: 2,
      count: 2,
    });
    session = treeKeyboardMove(session, tree, 'left');
    expect(describeTreeDragState('move', session, tree, 'Input.tsx')).toEqual({
      type: 'move',
      node: 'Input.tsx',
      parent: 'src',
      position: 2,
      count: 4,
    });
    expect(describeTreeDragState('drop', session, tree, 'Input.tsx')).toMatchObject({
      type: 'drop',
      parent: 'src',
      position: 2,
    });
  });

  it('announces top-level targets with a null parent', () => {
    const session = treeKeyboardLift(tree, 'readme')!;
    expect(describeTreeDragState('lift', session, tree, 'README.md')).toMatchObject({
      parent: null,
      position: 2,
      count: 2,
    });
    expect(describeTreeCancel(session, tree, 'README.md')).toEqual({
      type: 'cancel',
      node: 'README.md',
      parent: null,
    });
  });
});
