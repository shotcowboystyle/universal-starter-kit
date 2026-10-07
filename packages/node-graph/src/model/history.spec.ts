/**
 * The undo journal, design §4.5.
 *
 * "A drag is one undo. A relayout is one undo, and it never coalesces with a
 * drag." Both halves are here, and so is the reason the second half is not
 * automatic: a pointer drag emits a `moveNodes` per frame, so without
 * coalescing a two-second drag buries the stack under 120 entries and undo
 * becomes useless. Coalescing too eagerly is the opposite failure — a tidy
 * swallowed into the drag before it, and one undo that cannot get the old
 * arrangement back.
 *
 * Time is injected rather than faked globally: the module is pure, so a `now`
 * function is a smaller seam than `vi.useFakeTimers` and it cannot leak.
 */

import { describe, expect, it, test } from 'vitest';

import { applyCommand } from './commands';
import type { GraphCommand } from './commands';
import type { GraphDocument } from './document';
import { createHistory } from './history';

interface Nodes {
  readonly task: { readonly title: string };
}
interface Edges {
  readonly flow: Record<string, never>;
}
type Doc = GraphDocument<Nodes, Edges>;

const doc: Doc = {
  version: 1,
  nodes: [
    { id: 'a', kind: 'task', position: { x: 0, y: 0 }, data: { title: 'a' } },
    { id: 'b', kind: 'task', position: { x: 100, y: 0 }, data: { title: 'b' } },
  ],
  edges: [],
};

function clock(start = 1000) {
  let t = start;
  return { now: () => t, tick: (ms: number) => (t += ms) };
}

const drag = (dx: number): GraphCommand<Nodes, Edges> => ({
  t: 'moveNodes',
  deltas: { a: { x: dx, y: 0 }, b: { x: dx, y: 0 } },
});

const relayout: GraphCommand<Nodes, Edges> = {
  t: 'setPositions',
  positions: { a: { x: 0, y: 0 }, b: { x: 0, y: 60 } },
};

test('reports the applied history command without notifying for an empty stack', () => {
  const history = createHistory<Nodes, Edges>();
  const applied: [Doc, GraphCommand<Nodes, Edges>][] = [];
  const observe = (next: Doc, command: GraphCommand<Nodes, Edges>) => applied.push([next, command]);
  expect(history.undo(doc, observe)).toBe(doc);
  expect(history.redo(doc, observe)).toBe(doc);
  expect(applied).toEqual([]);
  const changed = history.commit(doc, drag(6));
  const undone = history.undo(changed, observe);
  expect(undone).toEqual(doc);
  expect(history.redo(undone, observe)).toEqual(changed);
  expect(applied).toEqual([
    [doc, drag(-6)],
    [changed, drag(6)],
  ]);
  history.redo(changed, observe);
  expect(applied).toHaveLength(2);
});

describe('a 30-step drag', () => {
  // 20 ms a step, so the gesture runs 580 ms — LONGER than the 400 ms default.
  // That is deliberate: the window measures the gap since the last movement,
  // not since the gesture began, and a fixed window would break this drag into
  // 21 entries while a 290 ms one would pass either way.
  it('coalesces to one entry', () => {
    const time = clock();
    const history = createHistory<Nodes, Edges>({ now: time.now });
    let current = doc;
    for (let i = 0; i < 30; i++) {
      current = history.commit(current, drag(1));
      time.tick(20);
    }
    expect(history.depth()).toBe(1);
  });

  it('composes the deltas by addition', () => {
    const time = clock();
    const history = createHistory<Nodes, Edges>({ now: time.now });
    let current = doc;
    for (let i = 0; i < 30; i++) {
      current = history.commit(current, drag(1));
      time.tick(20);
    }
    expect(current.nodes.map((n) => n.position.x)).toEqual([30, 130]);
    const entry = history.entries()[0];
    expect(entry.redo).toEqual({
      t: 'moveNodes',
      deltas: { a: { x: 30, y: 0 }, b: { x: 30, y: 0 } },
    });
    expect(entry.undo).toEqual({
      t: 'moveNodes',
      deltas: { a: { x: -30, y: 0 }, b: { x: -30, y: 0 } },
    });
  });

  it('is one undo, all the way back', () => {
    const time = clock();
    const history = createHistory<Nodes, Edges>({ now: time.now });
    let current = doc;
    for (let i = 0; i < 30; i++) {
      current = history.commit(current, drag(1));
      time.tick(20);
    }
    expect(history.undo(current)).toEqual(doc);
  });

  it('starts a new entry once the pointer has been still longer than coalesceMs', () => {
    const time = clock();
    const history = createHistory<Nodes, Edges>({ now: time.now, coalesceMs: 400 });
    let current = history.commit(doc, drag(1));
    time.tick(401);
    current = history.commit(current, drag(1));
    expect(history.depth()).toBe(2);
  });

  it('does not coalesce two drags of DIFFERENT node sets', () => {
    // Two nodes dragged one after the other is two undos, not one.
    const time = clock();
    const history = createHistory<Nodes, Edges>({ now: time.now });
    let current = history.commit(doc, { t: 'moveNodes', deltas: { a: { x: 1, y: 0 } } });
    time.tick(10);
    current = history.commit(current, { t: 'moveNodes', deltas: { b: { x: 1, y: 0 } } });
    expect(history.depth()).toBe(2);
  });
});

describe('a relayout', () => {
  it('is one entry', () => {
    const history = createHistory<Nodes, Edges>({ now: clock().now });
    history.commit(doc, relayout);
    expect(history.depth()).toBe(1);
  });

  it('never coalesces with the drag before it, even inside coalesceMs', () => {
    const time = clock();
    const history = createHistory<Nodes, Edges>({ now: time.now, coalesceMs: 400 });
    let current = history.commit(doc, drag(5));
    time.tick(1);
    current = history.commit(current, relayout);
    expect(history.depth()).toBe(2);
  });

  it('never coalesces with the drag after it either', () => {
    const time = clock();
    const history = createHistory<Nodes, Edges>({ now: time.now, coalesceMs: 400 });
    let current = history.commit(doc, relayout);
    time.tick(1);
    current = history.commit(current, drag(5));
    expect(history.depth()).toBe(2);
  });

  it('never coalesces with another relayout', () => {
    const time = clock();
    const history = createHistory<Nodes, Edges>({ now: time.now, coalesceMs: 400 });
    let current = history.commit(doc, relayout);
    time.tick(1);
    current = history.commit(current, relayout);
    expect(history.depth()).toBe(2);
  });

  it('restores the whole pre-layout arrangement in one undo', () => {
    const time = clock();
    const history = createHistory<Nodes, Edges>({ now: time.now });
    const scattered = applyCommand(doc, {
      t: 'setPositions',
      positions: { a: { x: 7, y: 7 }, b: { x: 9, y: 9 } },
    });
    const tidied = history.commit(scattered, relayout);
    expect(tidied.nodes.map((n) => n.position)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 60 },
    ]);
    expect(history.undo(tidied)).toEqual(scattered);
  });
});

describe('the limit', () => {
  it('evicts the oldest entry', () => {
    const time = clock();
    const history = createHistory<Nodes, Edges>({ now: time.now, limit: 3 });
    let current = doc;
    for (let i = 0; i < 5; i++) {
      current = history.commit(current, drag(1));
      time.tick(1000);
    }
    expect(history.depth()).toBe(3);
  });

  it('cannot undo past what it evicted', () => {
    // Powers of two, not five identical steps: with 1,1,1,1,1 the sum of the
    // last three equals the sum of the first three, so evicting the WRONG end
    // lands on the same number and the test proves nothing.
    const time = clock();
    const history = createHistory<Nodes, Edges>({ now: time.now, limit: 3 });
    let current = doc;
    for (const step of [1, 2, 4, 8, 16]) {
      current = history.commit(current, drag(step));
      time.tick(1000);
    }
    expect(current.nodes[0].position.x).toBe(31);
    for (let i = 0; i < 3; i++) {
      current = history.undo(current);
    }
    expect(history.canUndo()).toBe(false);
    // 4, 8 and 16 are undoable; 1 and 2 were evicted and are gone for good.
    expect(current.nodes[0].position.x).toBe(3);
  });
});

describe('redo', () => {
  it('comes back to where undo left', () => {
    const time = clock();
    const history = createHistory<Nodes, Edges>({ now: time.now });
    const moved = history.commit(doc, drag(5));
    const undone = history.undo(moved);
    expect(undone).toEqual(doc);
    expect(history.canRedo()).toBe(true);
    expect(history.redo(undone)).toEqual(moved);
  });

  it('clears on a new command', () => {
    const time = clock();
    const history = createHistory<Nodes, Edges>({ now: time.now });
    const moved = history.commit(doc, drag(5));
    const undone = history.undo(moved);
    expect(history.canRedo()).toBe(true);
    time.tick(1000);
    history.commit(undone, drag(2));
    expect(history.canRedo()).toBe(false);
  });

  it('does not coalesce into an earlier entry when a redo is pending', () => {
    // The guard only matters when the past is non-empty TOO. A drag on `a`, a
    // drag on `b`, one undo, then another drag on `a` inside coalesceMs of the
    // first: without the guard that folds into entry A while B still sits on
    // the redo stack, and redo would then replay B onto a document that never
    // had it.
    const time = clock();
    const history = createHistory<Nodes, Edges>({ now: time.now, coalesceMs: 400 });
    const onlyA = (dx: number): GraphCommand<Nodes, Edges> => ({
      t: 'moveNodes',
      deltas: { a: { x: dx, y: 0 } },
    });
    let current = history.commit(doc, onlyA(5));
    time.tick(1);
    current = history.commit(current, { t: 'moveNodes', deltas: { b: { x: 5, y: 0 } } });
    expect(history.depth()).toBe(2);
    current = history.undo(current);
    expect(history.canRedo()).toBe(true);
    time.tick(1);
    current = history.commit(current, onlyA(2));
    expect(history.depth()).toBe(2);
    expect(history.canRedo()).toBe(false);
    current = history.undo(current);
    current = history.undo(current);
    expect(current).toEqual(doc);
  });

  it('does not coalesce a new command into an entry the user has undone past', () => {
    // Otherwise a drag, an undo, and another drag inside coalesceMs would fold
    // into the entry that is no longer applied and the document would drift.
    const time = clock();
    const history = createHistory<Nodes, Edges>({ now: time.now, coalesceMs: 400 });
    const moved = history.commit(doc, drag(5));
    const undone = history.undo(moved);
    time.tick(1);
    const again = history.commit(undone, drag(2));
    expect(history.depth()).toBe(1);
    expect(again.nodes[0].position.x).toBe(2);
    expect(history.undo(again)).toEqual(doc);
  });
});

describe('nothing to do', () => {
  it('returns the same document when there is nothing to undo or redo', () => {
    const history = createHistory<Nodes, Edges>({ now: clock().now });
    expect(history.canUndo()).toBe(false);
    expect(history.undo(doc)).toBe(doc);
    expect(history.redo(doc)).toBe(doc);
  });

  it('clear() empties both stacks', () => {
    const history = createHistory<Nodes, Edges>({ now: clock().now });
    const moved = history.commit(doc, drag(5));
    history.undo(moved);
    history.clear();
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });
});
