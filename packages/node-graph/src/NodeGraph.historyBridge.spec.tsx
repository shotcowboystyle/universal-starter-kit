import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi, test } from 'vitest';

import type { BuiltinEdgeData } from './edges/edgeKinds';
import type { GraphCommand } from './model';
import { NodeGraph } from './NodeGraph.native';
import { demoDocument, demoSchema } from './react-flow/fixtures';
import type { DemoNodeData } from './react-flow/fixtures';
import { useGraphController } from './react-flow/useGraphController';

const host = vi.hoisted(() => ({
  props: undefined as
    | undefined
    | {
        rev: number;
        documentJson: string;
        onCommit: (rev: number, commandsJson: string) => void;
      },
}));
vi.mock(import('./native/NodeGraph.native'), () => ({
  NodeGraphNative: (props: NonNullable<typeof host.props>) => {
    host.props = props;
    return null;
  },
}));

afterEach(cleanup);

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

for (const controlled of [false, true]) {
  test.each(examples)(
    `publishes the actual ${controlled ? 'controlled' : 'uncontrolled'} native document for %s undo and redo`,
    (_name, commands) => {
      const initial = demoDocument();
      const schema = demoSchema();
      const onDocumentChange = vi.fn();
      function Host() {
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
      }
      renderWithProviders(<Host />);
      const { result } = renderHook(() =>
        useGraphController({
          schema,
          defaultDocument: initial,
          history: { now: () => 0 },
          // Match NodeGraphDomInner's real serialized command-only transport.
          onDocumentChange: (_next, command) => {
            host.props!.onCommit(host.props!.rev + 1, JSON.stringify([command]));
          },
        }),
      );
      for (const command of commands) {
        act(() => {
          result.current.commit(command);
        });
      }
      const changed = result.current.document;
      expect(changed).not.toEqual(initial);
      expect(onDocumentChange.mock.lastCall?.[0]).toEqual(changed);
      act(() => {
        result.current.undo();
      });
      expect(result.current.document).toEqual(initial);
      expect(onDocumentChange.mock.lastCall?.[0]).toEqual(initial);
      expect(JSON.parse(host.props!.documentJson)).toEqual(initial);
      act(() => {
        result.current.redo();
      });
      expect(result.current.document).toEqual(changed);
      expect(onDocumentChange.mock.lastCall?.[0]).toEqual(changed);
      expect(JSON.parse(host.props!.documentJson)).toEqual(changed);
      expect(onDocumentChange).toHaveBeenCalledTimes(commands.length + 2);
    },
  );
}
