/**
 * Task 1.11, the controller half.
 *
 * Four claims from the plan, each written so it fails for the reason it names:
 *
 *  - controlled and uncontrolled both work;
 *  - passing both warns and CONTROLLED wins;
 *  - a 30-change drag emits exactly ONE `onDocumentChange`;
 *  - `isValidConnection` calls `validateConnection` and NEVER `validateDrop`.
 *
 * The last one is asserted by CONSEQUENCE rather than by spying on the two
 * module functions. A drop-only rule is put on the schema; if the tick path
 * ever reached `validateDrop`, that rule would run. Spying on the import would
 * pass just as happily against a controller that called neither, so the rule is
 * the stronger instrument — it is also exactly the thing design §4.4 splits the
 * two types to protect: an O(V+E) walk on the pointer-tick path.
 *
 * TASK 4.4 adds the relayout half, at the bottom of this file: one
 * `setPositions` command per tidy, one undo that restores every prior
 * position, no coalescing with the drag either side of it, and the commit
 * inside `startTransition`.
 *
 * `startTransition` is asserted by MOCK rather than by spy, because React's
 * module namespace refuses `vi.spyOn` outright ("Cannot redefine property").
 * The mock spreads every real export and replaces one function with a
 * pass-through, so the other thirty-odd cases in this file run against the
 * real React; that they still pass is what makes the mock safe to have here.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BuiltinEdgeData } from '../edges/edge-kinds';
import { resetLayoutRunner } from '../layout/runner';
import type { ConnectionContext, ConnectionVerdict, GraphCommand, GraphDocument, GraphSchema } from '../model/index';
import { createGraphSchema, defaultRules } from '../model/index';

import { demoDocument, demoSchema } from './fixtures';
import type { DemoNodeData } from './fixtures';
import { resetControllerWarnings, useGraphController } from './use-graph-controller';
import type { NodeChange } from './xy';

const transitioned = vi.fn<(scope: () => void) => void>((scope) => {
  scope();
});
vi.mock(import('react'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    startTransition: (scope: () => void) => {
      transitioned(scope);
    },
  };
});

type Doc = GraphDocument<DemoNodeData, BuiltinEdgeData>;
type Schema = GraphSchema<DemoNodeData, BuiltinEdgeData>;
type OnDocumentChange = (document: Doc, command: GraphCommand<DemoNodeData, BuiltinEdgeData>) => void;

/** One drag: `count - 1` moving frames, then the frame React Flow marks as the end. */
const dragChanges = (id: string, from: { x: number; y: number }, count: number): NodeChange[][] =>
  Array.from({ length: count }, (_, index) => [
    {
      type: 'position',
      id,
      position: { x: from.x + (index + 1) * 3, y: from.y + (index + 1) * 2 },
      dragging: index < count - 1,
    } as NodeChange,
  ]);

/** A schema whose drop rule records that it ran. Nothing else refuses. */
const schemaWithDropProbe = (ran: { count: number }): Schema => {
  const base = demoSchema();
  return createGraphSchema<DemoNodeData, BuiltinEdgeData>({
    id: base.id,
    nodes: base.nodes,
    edges: base.edges,
    rules: defaultRules,
    dropRules: [
      (_ctx: ConnectionContext<DemoNodeData, BuiltinEdgeData>) => {
        ran.count += 1;
        return { ok: true } as const;
      },
    ],
  });
};

/**
 * The controller resolves a runner on demand. There is no `Worker` in
 * happy-dom, so every case here runs on the `inline` runner and exercises
 * the same commit path a `worker-blob` result takes — the runner is chosen
 * behind `layout()` and the controller cannot tell which answered.
 */
const scrambled = (): Doc => {
  const base = demoDocument();
  return {
    ...base,
    nodes: base.nodes.map((node, index) => ({
      ...node,
      position: { x: 1000 - index * 7, y: 33 + index * 11 },
    })),
  } as Doc;
};

describe('use-graph-controller', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // The dedupe set is MODULE level, so without this the first test to pass
    // both props consumes the only warning and the test that asserts it passes
    // for free. Found by a mutation run: every mutation made the warning test
    // fail, whatever it mutated, because test ORDER was doing the work.
    resetControllerWarnings();
    resetLayoutRunner();
    transitioned.mockClear();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    vi.restoreAllMocks();
  });

  describe('uncontrolled', () => {
    it('seeds from defaultDocument and owns the document after a commit', () => {
      const onDocumentChange = vi.fn<OnDocumentChange>();
      const { result } = renderHook(() =>
        useGraphController({
          schema: demoSchema(),
          defaultDocument: demoDocument(),
          onDocumentChange,
        }),
      );

      expect(result.current.document.nodes.map((node) => node.id)).toStrictEqual(['a', 'b', 'c']);

      act(() => {
        result.current.commit({ t: 'moveNodes', deltas: { a: { x: 10, y: 5 } } });
      });

      expect(result.current.document.nodes[0].position).toStrictEqual({ x: 10, y: 5 });
      expect(onDocumentChange).toHaveBeenCalledOnce();
      expect(onDocumentChange.mock.calls[0][1]).toStrictEqual({
        t: 'moveNodes',
        deltas: { a: { x: 10, y: 5 } },
      });
    });

    it('undoes and redoes its own commit', () => {
      const { result } = renderHook(() =>
        useGraphController({ schema: demoSchema(), defaultDocument: demoDocument() }),
      );

      act(() => {
        result.current.commit({ t: 'moveNodes', deltas: { a: { x: 10, y: 5 } } });
      });
      expect(result.current.canUndo).toBe(true);

      act(() => {
        result.current.undo();
      });
      expect(result.current.document.nodes[0].position).toStrictEqual({ x: 0, y: 0 });

      act(() => {
        result.current.redo();
      });
      expect(result.current.document.nodes[0].position).toStrictEqual({ x: 10, y: 5 });
    });
  });

  describe('controlled', () => {
    it('never moves its own document — the prop is the authority', () => {
      const onDocumentChange = vi.fn<OnDocumentChange>();
      const document = demoDocument();
      const { result } = renderHook(() => useGraphController({ schema: demoSchema(), document, onDocumentChange }));

      act(() => {
        result.current.commit({ t: 'moveNodes', deltas: { a: { x: 10, y: 5 } } });
      });

      // The parent was told what the next document is; it has not sent one back,
      // so the controller still shows the one it was given.
      expect(onDocumentChange).toHaveBeenCalledOnce();
      expect(onDocumentChange.mock.calls[0][0].nodes[0].position).toStrictEqual({ x: 10, y: 5 });
      expect(result.current.document).toBe(document);
    });

    it('keeps no shadow document, which a switch to uncontrolled reveals', () => {
      // A mutation that wrote local state on every controlled commit SURVIVED the
      // first version of this file: with `document` set, the local copy is never
      // read, so nothing could see it. It is not harmless — it is a second copy
      // of the document written on every drag end, and the moment a consumer
      // drops the `document` prop the graph would jump to it.
      //
      // So the rule is written down and made observable: controlled mode holds
      // NOTHING. Going uncontrolled falls back to the seed, because that is what
      // "uncontrolled starts from `defaultDocument`" has to mean.
      const first = demoDocument();
      const { result, rerender } = renderHook(
        ({ document }: { document?: Doc }) =>
          useGraphController({ schema: demoSchema(), document, defaultDocument: first }),
        { initialProps: { document: first as Doc | undefined } },
      );

      act(() => {
        result.current.commit({ t: 'moveNodes', deltas: { a: { x: 40, y: 40 } } });
      });
      expect(result.current.document.nodes[0].position).toStrictEqual({ x: 0, y: 0 });

      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- dropping the controlled prop IS the case under test
      rerender({ document: undefined });
      expect(result.current.document.nodes[0].position).toStrictEqual({ x: 0, y: 0 });
    });

    it('follows a new document prop', () => {
      const first = demoDocument();
      const second: Doc = {
        ...first,
        nodes: first.nodes.map((node) => (node.id === 'a' ? { ...node, position: { x: 99, y: 99 } } : node)),
      };
      const { result, rerender } = renderHook(
        ({ document }: { document: Doc }) => useGraphController({ schema: demoSchema(), document }),
        { initialProps: { document: first } },
      );

      expect(result.current.document.nodes[0].position).toStrictEqual({ x: 0, y: 0 });
      rerender({ document: second });
      expect(result.current.document.nodes[0].position).toStrictEqual({ x: 99, y: 99 });
      expect(result.current.nodes.find((node) => node.id === 'a')?.position).toStrictEqual({
        x: 99,
        y: 99,
      });
    });
  });

  describe('both at once', () => {
    it('warns and lets the controlled document win', () => {
      const controlled = demoDocument();
      const uncontrolled: Doc = {
        ...controlled,
        nodes: controlled.nodes.map((node) => ({ ...node, position: { x: -1, y: -1 } })),
      };

      const { result, rerender } = renderHook(() =>
        useGraphController({
          schema: demoSchema(),
          document: controlled,
          defaultDocument: uncontrolled,
        }),
      );

      expect(result.current.document).toBe(controlled);
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0][0])).toMatch(/document.*defaultDocument/iu);

      // Once, not once per render: a warning on every frame of a drag is noise
      // that trains people to ignore the console.
      rerender();
      rerender();
      expect(warn).toHaveBeenCalledOnce();
    });
  });

  describe('a drag is one commit', () => {
    it('emits exactly one onDocumentChange across 30 position changes', () => {
      const onDocumentChange = vi.fn<OnDocumentChange>();
      const { result } = renderHook(() =>
        useGraphController({
          schema: demoSchema(),
          defaultDocument: demoDocument(),
          onDocumentChange,
        }),
      );

      const frames = dragChanges('a', { x: 0, y: 0 }, 30);
      for (const changes of frames) {
        act(() => {
          result.current.onNodesChange(changes);
        });
      }

      expect(frames).toHaveLength(30);
      expect(onDocumentChange).toHaveBeenCalledOnce();
      expect(onDocumentChange.mock.calls[0][1]).toStrictEqual({
        t: 'moveNodes',
        deltas: { a: { x: 90, y: 60 } },
      });
      expect(result.current.document.nodes[0].position).toStrictEqual({ x: 90, y: 60 });
    });

    it('still moves the rendered node on every frame, so the drag is not laggy', () => {
      const { result } = renderHook(() =>
        useGraphController({ schema: demoSchema(), defaultDocument: demoDocument() }),
      );

      act(() => {
        result.current.onNodesChange(dragChanges('a', { x: 0, y: 0 }, 30)[4]);
      });

      expect(result.current.nodes.find((node) => node.id === 'a')?.position).toStrictEqual({
        x: 15,
        y: 10,
      });
      // …while the document has not moved: mid-drag is not a document state.
      expect(result.current.document.nodes[0].position).toStrictEqual({ x: 0, y: 0 });
    });

    it('does not deselect a node when the drag it was not part of commits', () => {
      // Selection lives in React Flow's array, not in the document, so a commit
      // re-derives it away unless it is carried across. Dropping that carry
      // SURVIVED the first version of this file, because the only selection test
      // never committed anything.
      const { result } = renderHook(() =>
        useGraphController({ schema: demoSchema(), defaultDocument: demoDocument() }),
      );

      act(() => {
        result.current.onNodesChange([{ type: 'select', id: 'a', selected: true } as NodeChange]);
      });
      expect(result.current.nodes.find((node) => node.id === 'a')?.selected).toBe(true);

      for (const changes of dragChanges('b', { x: 260, y: 0 }, 5)) {
        act(() => {
          result.current.onNodesChange(changes);
        });
      }

      expect(result.current.document.nodes[1].position).not.toStrictEqual({ x: 260, y: 0 });
      expect(result.current.nodes.find((node) => node.id === 'a')?.selected).toBe(true);
    });

    it('is one undo, not thirty', () => {
      const { result } = renderHook(() =>
        useGraphController({ schema: demoSchema(), defaultDocument: demoDocument() }),
      );

      for (const changes of dragChanges('a', { x: 0, y: 0 }, 30)) {
        act(() => {
          result.current.onNodesChange(changes);
        });
      }
      act(() => {
        result.current.undo();
      });

      expect(result.current.document.nodes[0].position).toStrictEqual({ x: 0, y: 0 });
      expect(result.current.canUndo).toBe(false);
    });

    it('commits nothing when the drag ends where it started', () => {
      const onDocumentChange = vi.fn<OnDocumentChange>();
      const { result } = renderHook(() =>
        useGraphController({
          schema: demoSchema(),
          defaultDocument: demoDocument(),
          onDocumentChange,
        }),
      );

      act(() => {
        result.current.onNodesChange([
          { type: 'position', id: 'a', position: { x: 0, y: 0 }, dragging: false } as NodeChange,
        ]);
      });

      expect(onDocumentChange).not.toHaveBeenCalled();
      expect(result.current.canUndo).toBe(false);
    });
  });

  describe('connection validation', () => {
    it('runs the tick-safe rules on isValidConnection and no drop rule', () => {
      const ran = { count: 0 };
      const { result } = renderHook(() =>
        useGraphController({
          schema: schemaWithDropProbe(ran),
          defaultDocument: demoDocument(),
        }),
      );

      // `b:ok -> c:in`, not `a:rows -> b:in`: the fixture ALREADY carries that
      // edge, and `refuseDuplicate` is one of `defaultRules`. Asserting `true`
      // on a connection the rules are right to refuse is how a spec ends up
      // measuring its own fixture instead of the code.
      const legal = result.current.isValidConnection({
        source: 'b',
        sourceHandle: 'ok',
        target: 'c',
        targetHandle: 'in',
      });
      expect(legal).toBe(true);
      expect(ran.count, 'validateDrop ran on the pointer-tick path').toBe(0);

      // The tick rules ARE running: a self-loop is refused by `refuseSelfLoop`,
      // which is one of `defaultRules`. Without this the test above would pass
      // against a controller that validated nothing at all.
      const illegal = result.current.isValidConnection({
        source: 'a',
        sourceHandle: 'rows',
        target: 'a',
        targetHandle: 'in',
      });
      expect(illegal).toBe(false);
      expect(ran.count).toBe(0);
    });

    it('runs the drop rules on onConnect, and adds the edge', () => {
      const ran = { count: 0 };
      const onDocumentChange = vi.fn<OnDocumentChange>();
      const { result } = renderHook(() =>
        useGraphController({
          schema: schemaWithDropProbe(ran),
          defaultDocument: demoDocument(),
          onDocumentChange,
        }),
      );

      act(() => {
        result.current.onConnect({
          source: 'b',
          sourceHandle: 'ok',
          target: 'c',
          targetHandle: 'in',
        });
      });

      expect(ran.count).toBe(1);
      expect(result.current.document.edges).toHaveLength(2);
      expect(onDocumentChange).toHaveBeenCalledOnce();
    });

    it('reports a refusal instead of adding a broken edge', () => {
      const onConnectionRefused = vi.fn<(verdict: ConnectionVerdict) => void>();
      const { result } = renderHook(() =>
        useGraphController({
          schema: demoSchema(),
          defaultDocument: demoDocument(),
          onConnectionRefused,
        }),
      );

      act(() => {
        result.current.onConnect({
          source: 'a',
          sourceHandle: 'rows',
          target: 'a',
          targetHandle: 'in',
        });
      });

      expect(result.current.document.edges).toHaveLength(1);
      expect(onConnectionRefused).toHaveBeenCalledOnce();
      expect(onConnectionRefused.mock.calls[0][0]).toMatchObject({ ok: false, code: expect.any(String) });
    });

    it('refuses a half-built connection rather than guessing a port', () => {
      const { result } = renderHook(() =>
        useGraphController({ schema: demoSchema(), defaultDocument: demoDocument() }),
      );
      expect(
        result.current.isValidConnection({
          source: 'a',
          sourceHandle: null,
          target: 'b',
          targetHandle: 'in',
        }),
      ).toBe(false);

      act(() => {
        result.current.onConnect({
          source: 'b',
          sourceHandle: null,
          target: 'c',
          targetHandle: 'in',
        });
      });
      expect(result.current.document.edges).toHaveLength(1);
    });

    it('still refuses it when the schema carries no rules at all', () => {
      // Removing the null-handle guard SURVIVED twice: `defaultRules` refuse an
      // unresolvable port on their own, so both assertions above passed against
      // a controller that had stopped checking. But `createGraphSchema` does NOT
      // default `rules` (task 1.3's deliberate choice), so a schema can legally
      // have none — and then the guard is the only thing between a half-built
      // drag and an edge stored with `port: null`, which nothing downstream can
      // resolve. THIS is the case the guard exists for.
      const base = demoSchema();
      const ruleless = createGraphSchema<DemoNodeData, BuiltinEdgeData>({
        id: 'node-graph-demo-ruleless',
        nodes: base.nodes,
        edges: base.edges,
      });
      const { result } = renderHook(() => useGraphController({ schema: ruleless, defaultDocument: demoDocument() }));

      act(() => {
        result.current.onConnect({
          source: 'b',
          sourceHandle: null,
          target: 'c',
          targetHandle: 'in',
        });
      });
      expect(result.current.document.edges).toHaveLength(1);

      // …while a fully specified connection still lands, so the guard is a guard
      // and not a blanket refusal.
      act(() => {
        result.current.onConnect({
          source: 'b',
          sourceHandle: 'ok',
          target: 'c',
          targetHandle: 'in',
        });
      });
      expect(result.current.document.edges).toHaveLength(2);
    });
  });

  describe('readOnly', () => {
    it('drops every change and every connection on the floor', () => {
      const onDocumentChange = vi.fn<OnDocumentChange>();
      const { result } = renderHook(() =>
        useGraphController({
          schema: demoSchema(),
          defaultDocument: demoDocument(),
          onDocumentChange,
          readOnly: true,
        }),
      );

      for (const changes of dragChanges('a', { x: 0, y: 0 }, 30)) {
        act(() => {
          result.current.onNodesChange(changes);
        });
      }
      act(() => {
        result.current.onConnect({
          source: 'b',
          sourceHandle: 'ok',
          target: 'c',
          targetHandle: 'in',
        });
      });

      expect(onDocumentChange).not.toHaveBeenCalled();
      expect(result.current.document.nodes[0].position).toStrictEqual({ x: 0, y: 0 });
      expect(result.current.document.edges).toHaveLength(1);
      expect(
        result.current.isValidConnection({
          source: 'b',
          sourceHandle: 'ok',
          target: 'c',
          targetHandle: 'in',
        }),
      ).toBe(false);
    });

    it('still lets selection through, because reading a graph means picking things in it', () => {
      const { result } = renderHook(() =>
        useGraphController({
          schema: demoSchema(),
          defaultDocument: demoDocument(),
          readOnly: true,
        }),
      );

      act(() => {
        result.current.onNodesChange([{ type: 'select', id: 'a', selected: true } as NodeChange]);
      });

      expect(result.current.nodes.find((node) => node.id === 'a')?.selected).toBe(true);
    });
  });

  describe('the React Flow arrays', () => {
    it('seeds every node with its measure before first paint (design §5)', () => {
      const { result } = renderHook(() =>
        useGraphController({ schema: demoSchema(), defaultDocument: demoDocument() }),
      );

      for (const node of result.current.nodes) {
        expect(node.initialWidth, node.id).toBeGreaterThan(0);
        expect(node.initialHeight, node.id).toBeGreaterThan(0);
        // NOT `width` / `height`. Those are user-set dimensions and React Flow
        // writes them as a hard CSS size; a seeded one clamps the Tamagui body
        // and it paints out through the bottom of its own frame. Measured in
        // Chrome, not reasoned about.
        expect(node.width, node.id).toBeUndefined();
        expect(node.height, node.id).toBeUndefined();
      }
      // `transform` carries three ports on two sides; its busiest edge is two
      // ports, so its floor is the declared 72 rather than 3 × the pitch.
      expect(result.current.nodes.find((node) => node.id === 'b')?.initialWidth).toBe(190);
    });

    it('hands every edge the one registered type and its kind in data', () => {
      const { result } = renderHook(() =>
        useGraphController({ schema: demoSchema(), defaultDocument: demoDocument() }),
      );

      const [edge] = result.current.edges;
      expect(edge.id).toBe('a->b');
      expect(edge.source).toBe('a');
      expect(edge.sourceHandle).toBe('rows');
      expect(edge.target).toBe('b');
      expect(edge.targetHandle).toBe('in');
      expect((edge.data as { kind?: string }).kind).toBe('flow');
      // The marker rides on the edge object: React Flow builds its defs from the
      // edges array, so choosing it in the component is too late.
      expect(edge.markerEnd).toBeDefined();
    });

    it('passes each node its resolved ports, not the raw kind', () => {
      const { result } = renderHook(() =>
        useGraphController({ schema: demoSchema(), defaultDocument: demoDocument() }),
      );

      const data = result.current.nodes.find((node) => node.id === 'b')?.data as {
        ports?: readonly { id: string }[];
      };
      expect(data.ports?.map((port) => port.id)).toStrictEqual(['in', 'ok', 'err']);
    });
  });

  describe('relayout — task 4.4', () => {
    it('emits exactly ONE setPositions command for a whole relayout', async () => {
      const onDocumentChange = vi.fn<OnDocumentChange>();
      const { result } = renderHook(() =>
        useGraphController({
          schema: demoSchema(),
          defaultDocument: scrambled(),
          onDocumentChange,
        }),
      );

      await act(async () => {
        await result.current.relayout();
      });

      expect(onDocumentChange).toHaveBeenCalledOnce();
      expect(onDocumentChange.mock.calls[0][1]).toMatchObject({ t: 'setPositions' });
      const [[, command]] = onDocumentChange.mock.calls;
      const positions = command.t === 'setPositions' ? command.positions : {};
      expect(Object.keys(positions).toSorted()).toStrictEqual(['a', 'b', 'c']);
    });

    it('actually moves the graph — a tidy is not a no-op commit', async () => {
      const before = scrambled();
      const { result } = renderHook(() => useGraphController({ schema: demoSchema(), defaultDocument: before }));

      await act(async () => {
        await result.current.relayout();
      });

      const after = result.current.document.nodes;
      expect(after.map((node) => node.position)).not.toStrictEqual(before.nodes.map((n) => n.position));
      // dagre in TB: `a -> b` means b sits below a.
      const at = (id: string) => after.find((node) => node.id === id)!.position;
      expect(at('b').y).toBeGreaterThan(at('a').y);
    });

    it('ONE undo restores every prior position', async () => {
      const before = scrambled();
      const { result } = renderHook(() => useGraphController({ schema: demoSchema(), defaultDocument: before }));

      await act(async () => {
        await result.current.relayout();
      });
      act(() => {
        result.current.undo();
      });

      expect(result.current.document.nodes.map((node) => ({ id: node.id, ...node.position }))).toStrictEqual(
        before.nodes.map((node) => ({ id: node.id, ...node.position })),
      );
      expect(result.current.canUndo).toBe(false);
    });

    it('never coalesces with the drag before it, however close in time', async () => {
      const onDocumentChange = vi.fn<OnDocumentChange>();
      const { result } = renderHook(() =>
        useGraphController({
          schema: demoSchema(),
          defaultDocument: scrambled(),
          onDocumentChange,
          // A window wide enough that two moveNodes WOULD merge. If setPositions
          // could coalesce, it would here.
          history: { coalesceMs: 100_000 },
        }),
      );

      for (const changes of dragChanges('a', { x: 1000, y: 33 }, 5)) {
        act(() => {
          result.current.onNodesChange(changes);
        });
      }
      await act(async () => {
        await result.current.relayout();
      });

      expect(onDocumentChange).toHaveBeenCalledTimes(2);
      expect(onDocumentChange.mock.calls[0][1]).toMatchObject({ t: 'moveNodes' });
      expect(onDocumentChange.mock.calls[1][1]).toMatchObject({ t: 'setPositions' });
      // Two entries, so two undos: the tidy first, then the drag.
      act(() => {
        result.current.undo();
      });
      expect(result.current.canUndo).toBe(true);
    });

    it('a drag AFTER a relayout is still its own entry', async () => {
      const { result } = renderHook(() =>
        useGraphController({
          schema: demoSchema(),
          defaultDocument: scrambled(),
          history: { coalesceMs: 100_000 },
        }),
      );

      await act(async () => {
        await result.current.relayout();
      });
      for (const changes of dragChanges('a', result.current.document.nodes[0].position, 5)) {
        act(() => {
          result.current.onNodesChange(changes);
        });
      }
      act(() => {
        result.current.undo();
      });
      expect(result.current.canUndo).toBe(true);
    });

    it('applies the result inside startTransition', async () => {
      const { result } = renderHook(() => useGraphController({ schema: demoSchema(), defaultDocument: scrambled() }));

      expect(transitioned).not.toHaveBeenCalled();
      await act(async () => {
        await result.current.relayout();
      });
      expect(transitioned).toHaveBeenCalledOnce();
    });

    it('reports the runner and the engine time it took', async () => {
      const { result } = renderHook(() => useGraphController({ schema: demoSchema(), defaultDocument: scrambled() }));

      expect(result.current.layoutRunner).toBe('none');
      await act(async () => {
        await result.current.relayout();
      });
      expect(result.current.layoutRunner).toBe('inline');
      expect(result.current.lastLayoutMs).toBeGreaterThanOrEqual(0);
    });

    it('commits nothing in readOnly', async () => {
      const onDocumentChange = vi.fn<OnDocumentChange>();
      const { result } = renderHook(() =>
        useGraphController({
          schema: demoSchema(),
          defaultDocument: scrambled(),
          onDocumentChange,
          readOnly: true,
        }),
      );

      await act(async () => {
        await result.current.relayout();
      });
      expect(onDocumentChange).not.toHaveBeenCalled();
    });

    it('commits nothing for an empty document rather than an empty entry', async () => {
      const onDocumentChange = vi.fn<OnDocumentChange>();
      const { result } = renderHook(() =>
        useGraphController({
          schema: demoSchema(),
          defaultDocument: { version: 1, nodes: [], edges: [] } as Doc,
          onDocumentChange,
        }),
      );

      await act(async () => {
        await result.current.relayout();
      });
      expect(onDocumentChange).not.toHaveBeenCalled();
      expect(result.current.canUndo).toBe(false);
    });

    it('`subset` tidies the named nodes and leaves the rest exactly where they were', async () => {
      const before = scrambled();
      const { result } = renderHook(() => useGraphController({ schema: demoSchema(), defaultDocument: before }));

      await act(async () => {
        await result.current.relayout({ subset: ['a', 'b'] });
      });

      const fixed = result.current.document.nodes.find((node) => node.id === 'c')!;
      expect(fixed.position).toStrictEqual(before.nodes[2].position);
    });

    describe('the generation guard', () => {
      it('drops a node the user touched while the layout was in flight', async () => {
        const { result } = renderHook(() => useGraphController({ schema: demoSchema(), defaultDocument: scrambled() }));

        let pending: Promise<unknown>;
        await act(async () => {
          pending = result.current.relayout();
          // Mid-flight: React Flow reports a finished drag on `c`.
          result.current.onNodesChange([
            { type: 'position', id: 'c', position: { x: 5, y: 6 }, dragging: false } as NodeChange,
          ]);
          await pending;
        });

        // Design §8: the result still lands on everything else. Discarding the
        // whole thing makes a relayout feel like it silently failed.
        const at = (id: string) => result.current.document.nodes.find((n) => n.id === id)!.position;
        expect(at('c')).toStrictEqual({ x: 5, y: 6 });
        expect(at('a')).not.toStrictEqual(scrambled().nodes[0].position);
      });

      it('a newer relayout supersedes an older one rather than both landing', async () => {
        const onDocumentChange = vi.fn<OnDocumentChange>();
        const { result } = renderHook(() =>
          useGraphController({
            schema: demoSchema(),
            defaultDocument: scrambled(),
            onDocumentChange,
          }),
        );

        await act(async () => {
          const first = result.current.relayout();
          const second = result.current.relayout({ direction: 'LR' });
          await Promise.all([first, second]);
        });

        expect(onDocumentChange).toHaveBeenCalledOnce();
      });
    });
  });
});
