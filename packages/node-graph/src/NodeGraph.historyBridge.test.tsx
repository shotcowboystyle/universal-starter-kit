import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BuiltinEdgeData } from './edges/edge-kinds';
import type { GraphCommand, GraphDocument } from './model';
import type { NodeGraphNativeProps } from './native/NodeGraph.native';
import { NodeGraph } from './NodeGraph.native';
import { demoDocument, demoSchema } from './react-flow/fixtures';
import type { DemoNodeData } from './react-flow/fixtures';
import { useGraphController } from './react-flow/use-graph-controller';

const host = vi.hoisted(() => ({
  props: undefined as NodeGraphNativeProps | undefined,
}));
vi.mock(import('./native/NodeGraph.native'), () => ({
  NodeGraphNative: (props: NodeGraphNativeProps) => {
    host.props = props;
    return null;
  },
}));

type Command = GraphCommand<DemoNodeData, BuiltinEdgeData>;
const examples: [string, Command[]][] = [
  ['move', [{ t: 'moveNodes', deltas: { a: { x: 10, y: 5 } } }]],
  [
    'coalesced moves',
    [
      { t: 'moveNodes', deltas: { a: { x: 10, y: 5 } } },
      { t: 'moveNodes', deltas: { a: { x: 20, y: 10 } } },
    ],
  ],
  ['connected node removal', [{ t: 'removeNodes', ids: ['a'] }]],
];

describe('NodeGraph.native history bridge', () => {
  afterEach(cleanup);

  describe.each([false, true])('controlled=%s', (controlled) => {
    it.each(examples)(
      `publishes the actual ${controlled ? 'controlled' : 'uncontrolled'} native document for %s undo and redo`,
      (_name, commands) => {
        const initial = demoDocument();
        const schema = demoSchema();
        const onDocumentChange =
          vi.fn<(next: GraphDocument<DemoNodeData, BuiltinEdgeData>, command: Command) => void>();
        const Host = () => {
          const [value, setValue] = useState(initial);
          return (
            <NodeGraph
              schema={schema}
              {...(controlled ? { document: value } : { defaultDocument: initial })}
              onDocumentChange={(next, command) => {
                onDocumentChange(next, command);
                if (controlled) {
                  setValue(next);
                }
              }}
            />
          );
        };
        renderWithProviders(<Host />);
        const { result } = renderHook(() =>
          useGraphController({
            schema,
            defaultDocument: initial,
            history: { now: () => 0 },
            // Match NodeGraphDomInner's real serialized command-only transport.
            onDocumentChange: (_next, command) => {
              host.props!.onCommit?.(host.props!.rev + 1, JSON.stringify([command]));
            },
          }),
        );
        for (const command of commands) {
          act(() => {
            result.current.commit(command);
          });
        }
        const changed = result.current.document;
        expect(changed).not.toStrictEqual(initial);
        expect(onDocumentChange.mock.lastCall?.[0]).toStrictEqual(changed);
        act(() => {
          result.current.undo();
        });
        expect(result.current.document).toStrictEqual(initial);
        expect(onDocumentChange.mock.lastCall?.[0]).toStrictEqual(initial);
        expect(JSON.parse(host.props!.documentJson)).toStrictEqual(initial);
        act(() => {
          result.current.redo();
        });
        expect(result.current.document).toStrictEqual(changed);
        expect(onDocumentChange.mock.lastCall?.[0]).toStrictEqual(changed);
        expect(JSON.parse(host.props!.documentJson)).toStrictEqual(changed);
        expect(onDocumentChange).toHaveBeenCalledTimes(commands.length + 2);
      },
    );
  });
});
