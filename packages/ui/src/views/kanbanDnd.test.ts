import { describe, expect, it } from 'vitest';

import {
  LIST_COLUMN_ID,
  applyReorder,
  autoScrollVelocity,
  describeCancel,
  describeDragState,
  formatListAnnouncement,
  gapPosition,
  insertionIndexForY,
  keyboardLift,
  keyboardMove,
  listBoardSnapshot,
  maxInsertionIndex,
  renumberIdx,
  resolveDrop,
  siblingOffset,
  uniformInsertionIndex,
  type KanbanBoardColumnSnapshot,
} from './kanbanDnd';

const H = 80;

// Column of three cards A(0) B(1) C(2), uniform height H.
const starts = [0, H, 2 * H];
const getStart = (i: number) => starts[i];

describe('siblingOffset', () => {
  describe('source column (dragged card at index 1 of [A,B,C])', () => {
    it('gap above A: A and C both make room, C also closes the origin', () => {
      // final layout: [gap, A, C]
      expect(siblingOffset({ index: 0, sourceIndex: 1, gapIndex: 0, size: H })).toBe(H);
      expect(siblingOffset({ index: 2, sourceIndex: 1, gapIndex: 0, size: H })).toBe(0);
    });

    it('gap at origin: nothing moves', () => {
      expect(siblingOffset({ index: 0, sourceIndex: 1, gapIndex: 1, size: H })).toBe(0);
      expect(siblingOffset({ index: 2, sourceIndex: 1, gapIndex: 1, size: H })).toBe(0);
    });

    it('gap at end: C closes the origin gap upward', () => {
      // final layout: [A, C, gap]
      expect(siblingOffset({ index: 0, sourceIndex: 1, gapIndex: 2, size: H })).toBe(0);
      expect(siblingOffset({ index: 2, sourceIndex: 1, gapIndex: 2, size: H })).toBe(-H);
    });

    it('target moved to another column: cards below origin close the gap', () => {
      expect(siblingOffset({ index: 0, sourceIndex: 1, gapIndex: null, size: H })).toBe(0);
      expect(siblingOffset({ index: 2, sourceIndex: 1, gapIndex: null, size: H })).toBe(-H);
    });

    it('the dragged card itself never receives a sibling offset', () => {
      expect(siblingOffset({ index: 1, sourceIndex: 1, gapIndex: 0, size: H })).toBe(0);
    });
  });

  describe('foreign target column [X,Y]', () => {
    it('cards at/below the gap shift down', () => {
      expect(siblingOffset({ index: 0, sourceIndex: null, gapIndex: 0, size: H })).toBe(H);
      expect(siblingOffset({ index: 1, sourceIndex: null, gapIndex: 0, size: H })).toBe(H);
      expect(siblingOffset({ index: 0, sourceIndex: null, gapIndex: 1, size: H })).toBe(0);
      expect(siblingOffset({ index: 1, sourceIndex: null, gapIndex: 1, size: H })).toBe(H);
    });

    it('gap at end shifts nothing; no gap shifts nothing', () => {
      expect(siblingOffset({ index: 1, sourceIndex: null, gapIndex: 2, size: H })).toBe(0);
      expect(siblingOffset({ index: 1, sourceIndex: null, gapIndex: null, size: H })).toBe(0);
    });
  });
});

describe('gapPosition', () => {
  it('source column: gap above, at, and below the origin', () => {
    const base = { sourceIndex: 1, count: 3, size: H, totalSize: 3 * H, getStart };
    expect(gapPosition({ ...base, gapIndex: 0 })).toBe(0);
    expect(gapPosition({ ...base, gapIndex: 1 })).toBe(H); // origin slot
    expect(gapPosition({ ...base, gapIndex: 2 })).toBe(2 * H); // end
  });

  it('single-card source column keeps the gap at the top', () => {
    expect(
      gapPosition({
        gapIndex: 0,
        sourceIndex: 0,
        count: 1,
        size: H,
        totalSize: H,
        getStart,
      }),
    ).toBe(0);
  });

  it('foreign column: gap before a card and at the end', () => {
    const base = { sourceIndex: null, count: 2, size: H, totalSize: 2 * H, getStart };
    expect(gapPosition({ ...base, gapIndex: 0 })).toBe(0);
    expect(gapPosition({ ...base, gapIndex: 1 })).toBe(H);
    expect(gapPosition({ ...base, gapIndex: 2 })).toBe(2 * H);
  });
});

describe('insertionIndexForY', () => {
  const items = [
    { index: 0, start: 0, size: H },
    { index: 1, start: H, size: H },
    { index: 2, start: 2 * H, size: H },
  ];

  it('foreign column: midpoint rule picks the slot under the pointer', () => {
    const base = { items, sourceIndex: null, count: 3, size: H };
    expect(insertionIndexForY({ ...base, localY: 10 })).toBe(0);
    expect(insertionIndexForY({ ...base, localY: H / 2 + 1 })).toBe(1);
    expect(insertionIndexForY({ ...base, localY: 2.6 * H })).toBe(3);
    expect(insertionIndexForY({ ...base, localY: 99 * H })).toBe(3);
  });

  it('source column: dragged card is removed from the flow before comparing', () => {
    const base = { items, sourceIndex: 1, count: 3, size: H };
    // without-dragged flow: A at 0, C at H
    expect(insertionIndexForY({ ...base, localY: 10 })).toBe(0);
    expect(insertionIndexForY({ ...base, localY: H })).toBe(1);
    expect(insertionIndexForY({ ...base, localY: 1.9 * H })).toBe(2);
  });

  it('empty column drops at index 0', () => {
    expect(insertionIndexForY({ localY: 50, items: [], sourceIndex: null, count: 0, size: H })).toBe(0);
  });
});

describe('uniformInsertionIndex', () => {
  it('matches the midpoint rule for uniform sizes', () => {
    expect(uniformInsertionIndex(10, H, 3)).toBe(0);
    expect(uniformInsertionIndex(H / 2 + 1, H, 3)).toBe(1);
    expect(uniformInsertionIndex(2.6 * H, H, 3)).toBe(3);
    expect(uniformInsertionIndex(99 * H, H, 3)).toBe(3);
    expect(uniformInsertionIndex(-5, H, 3)).toBe(0);
  });

  it('degrades safely on empty lists and zero sizes', () => {
    expect(uniformInsertionIndex(50, H, 0)).toBe(0);
    expect(uniformInsertionIndex(50, 0, 3)).toBe(0);
  });
});

describe('autoScrollVelocity', () => {
  const zone = { start: 0, end: 400, edge: 48, maxSpeed: 16 };

  it('is zero away from the edges', () => {
    expect(autoScrollVelocity({ ...zone, pos: 200 })).toBe(0);
  });

  it('ramps with proximity and saturates at the edge', () => {
    const half = autoScrollVelocity({ ...zone, pos: 24 });
    expect(half).toBeCloseTo(-8);
    expect(autoScrollVelocity({ ...zone, pos: 0 })).toBe(-16);
    expect(autoScrollVelocity({ ...zone, pos: -20 })).toBe(-16); // past the edge stays saturated
    expect(autoScrollVelocity({ ...zone, pos: 376 })).toBeCloseTo(8);
    expect(autoScrollVelocity({ ...zone, pos: 400 })).toBe(16);
  });

  it('degrades gracefully on tiny viewports', () => {
    expect(autoScrollVelocity({ pos: 10, start: 0, end: 60, edge: 48, maxSpeed: 16 })).toBeLessThan(0);
    expect(autoScrollVelocity({ pos: 30, start: 0, end: 60, edge: 48, maxSpeed: 16 })).toBe(0);
  });
});

describe('keyboard drag state machine', () => {
  const board: KanbanBoardColumnSnapshot[] = [
    { id: 'todo', title: 'To Do', count: 3 },
    { id: 'review', title: 'Review', count: 2 },
    { id: 'done', title: 'Done', count: 0 },
  ];

  it('lifts a card at its own position', () => {
    const drag = keyboardLift(board, 'todo', 1);
    expect(drag).toEqual({
      sourceColumnId: 'todo',
      sourceIndex: 1,
      target: { columnId: 'todo', index: 1 },
    });
  });

  it('rejects lifting a card that does not exist', () => {
    expect(keyboardLift(board, 'todo', 3)).toBeNull();
    expect(keyboardLift(board, 'missing', 0)).toBeNull();
  });

  it('moves up/down within the column and clamps at boundaries', () => {
    let drag = keyboardLift(board, 'todo', 1)!;
    drag = keyboardMove(drag, board, 'up');
    expect(drag.target).toEqual({ columnId: 'todo', index: 0 });
    const clamped = keyboardMove(drag, board, 'up');
    expect(clamped).toBe(drag); // boundary no-op returns the same session
    drag = keyboardMove(drag, board, 'down');
    drag = keyboardMove(drag, board, 'down');
    expect(drag.target).toEqual({ columnId: 'todo', index: 2 });
    // source column of 3 has wd insertion range 0..2
    expect(keyboardMove(drag, board, 'down')).toBe(drag);
  });

  it('moves across columns, clamping the index to the destination size', () => {
    let drag = keyboardLift(board, 'todo', 2)!;
    drag = keyboardMove(drag, board, 'right');
    expect(drag.target).toEqual({ columnId: 'review', index: 2 }); // review holds 2 cards → max 2
    drag = keyboardMove(drag, board, 'right');
    expect(drag.target).toEqual({ columnId: 'done', index: 0 }); // empty column → index 0
    expect(keyboardMove(drag, board, 'right')).toBe(drag); // last column no-op
    drag = keyboardMove(drag, board, 'left');
    expect(drag.target).toEqual({ columnId: 'review', index: 0 });
  });

  it('computes max insertion for source vs foreign columns', () => {
    const drag = keyboardLift(board, 'todo', 0)!;
    expect(maxInsertionIndex(board, drag, 'todo')).toBe(2);
    expect(maxInsertionIndex(board, drag, 'review')).toBe(2);
    expect(maxInsertionIndex(board, drag, 'done')).toBe(0);
  });

  it('resolves drops: no-op at origin, commit elsewhere', () => {
    const home = keyboardLift(board, 'todo', 1)!;
    expect(resolveDrop(home).commit).toBe(false);

    const moved = keyboardMove(home, board, 'right');
    const result = resolveDrop(moved);
    expect(result.commit).toBe(true);
    expect(result.from).toEqual({ columnId: 'todo', index: 1 });
    expect(result.to).toEqual({ columnId: 'review', index: 1 });
  });

  it('announces lift, move, drop, and cancel with 1-based positions', () => {
    let drag = keyboardLift(board, 'todo', 1)!;
    expect(describeDragState('lift', drag, board, 'Fix login bug')).toEqual({
      type: 'lift',
      card: 'Fix login bug',
      column: 'To Do',
      position: 2,
      count: 3,
    });

    drag = keyboardMove(drag, board, 'right');
    expect(describeDragState('move', drag, board, 'Fix login bug')).toEqual({
      type: 'move',
      card: 'Fix login bug',
      column: 'Review',
      position: 2,
      count: 3,
    });

    expect(describeDragState('drop', drag, board, 'Fix login bug')).toMatchObject({
      type: 'drop',
      column: 'Review',
      position: 2,
    });

    expect(describeCancel(drag, board, 'Fix login bug')).toEqual({
      type: 'cancel',
      card: 'Fix login bug',
      column: 'To Do',
    });
  });
});

describe('flat-list reorder (one machine for List, DataTable, ChildTable)', () => {
  const labels = ['Monday standup', 'Tuesday review', 'Deploy window', 'Retro notes'];

  it('models a flat list as a single-column board and reuses keyboardLift/Move', () => {
    const board = listBoardSnapshot(labels.length);
    let drag = keyboardLift(board, LIST_COLUMN_ID, 1);
    expect(drag).toEqual({
      sourceColumnId: LIST_COLUMN_ID,
      sourceIndex: 1,
      target: { columnId: LIST_COLUMN_ID, index: 1 },
    });
    drag = keyboardMove(drag!, board, 'down');
    expect(drag.target.index).toBe(2);
    const boundary = keyboardMove(keyboardMove(drag, board, 'down'), board, 'down');
    expect(boundary.target.index).toBe(3);
    expect(keyboardMove(boundary, board, 'down')).toBe(boundary);
  });

  it('applyReorder uses resolveDrop coordinates so List / DataTable / ChildTable share one write', () => {
    const listItems = labels.map((title) => ({ title }));
    const tableRows = labels.map((pipeline, i) => ({ id: `r${i}`, pipeline, idx: i + 1 }));
    const childRows = labels.map((task, i) => ({ name: task, idx: i + 1 }));

    const board = listBoardSnapshot(4);
    const dropped = keyboardMove(keyboardMove(keyboardLift(board, LIST_COLUMN_ID, 1)!, board, 'down'), board, 'down');
    const result = resolveDrop(dropped);
    expect(result.commit).toBe(true);

    expect(applyReorder(listItems, result.from.index, result.to.index).map((r) => r.title)).toEqual([
      'Monday standup',
      'Deploy window',
      'Retro notes',
      'Tuesday review',
    ]);
    expect(applyReorder(tableRows, result.from.index, result.to.index).map((r) => r.pipeline)).toEqual([
      'Monday standup',
      'Deploy window',
      'Retro notes',
      'Tuesday review',
    ]);
    const numbered = renumberIdx(applyReorder(childRows, result.from.index, result.to.index));
    expect(numbered.map((r) => ({ name: r.name, idx: r.idx }))).toEqual([
      { name: 'Monday standup', idx: 1 },
      { name: 'Deploy window', idx: 2 },
      { name: 'Retro notes', idx: 3 },
      { name: 'Tuesday review', idx: 4 },
    ]);
  });

  it('formats board-03 aria-live lines from describeDragState / describeCancel', () => {
    const board = listBoardSnapshot(4);
    let drag = keyboardLift(board, LIST_COLUMN_ID, 1)!;
    expect(formatListAnnouncement(describeDragState('lift', drag, board, 'Tuesday review'))).toBe(
      'Lifted “Tuesday review”, position 2 of 4. Use arrow keys to move, space to drop, escape to cancel.',
    );
    drag = keyboardMove(drag, board, 'down');
    expect(formatListAnnouncement(describeDragState('move', drag, board, 'Tuesday review'))).toBe(
      'Moved “Tuesday review”, position 3 of 4.',
    );
    drag = keyboardMove(drag, board, 'down');
    expect(formatListAnnouncement(describeDragState('move', drag, board, 'Tuesday review'))).toBe(
      'Moved “Tuesday review”, position 4 of 4.',
    );
    expect(formatListAnnouncement(describeDragState('drop', drag, board, 'Tuesday review'))).toBe(
      'Dropped “Tuesday review”, position 4 of 4.',
    );
    expect(
      formatListAnnouncement(describeCancel(drag, board, 'Tuesday review'), {
        sourcePosition: drag.sourceIndex + 1,
      }),
    ).toBe('Reorder cancelled. “Tuesday review” returned to position 2.');
  });
});
