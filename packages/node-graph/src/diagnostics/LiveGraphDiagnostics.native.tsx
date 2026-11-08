/**
 * A REAL canvas with design §9.5's panel under it — the NATIVE half, and the
 * only place AC-3's DOM half can be read (MPO-211).
 *
 * The problem this solves. On device the canvas renders inside a WebView, so
 * every number worth having is measured in a JS realm the Hermes side cannot
 * reach: how many node bodies actually mounted, and whether §6.3's
 * corrupted-first-family control says the `$body` face painted. A story on the
 * Hermes side can measure neither — `NodeGraph/GraphNode` → `FontProof` tries,
 * and its probe measures the Hermes-side stack, which is not the thing AC-3
 * asks about. The canvas already computes all of it and sends it over the
 * `ready` event; until now nothing on a device DISPLAYED it.
 *
 * So this mounts the same `<NodeGraph>` the Kitchen Sink's `Main` story mounts,
 * takes the `ready` payload, and renders it straight into `GraphDiagnostics`.
 * Nothing is synthesised here. If the canvas never reports, the panel says so
 * rather than showing zeroes that look like measurements.
 *
 * `../NodeGraph.native` is imported by its explicit filename, the same way
 * `index.native.ts` does it: `onReady` is native-only by construction, so the
 * shared specifier would resolve to the web twin under `tsgo` and the prop
 * would not typecheck.
 */

import { useState } from 'react';
import { SizableText, YStack } from 'tamagui';

import type { GraphDiagnosticsWire } from '../dom/wire';
import { NodeGraph } from '../NodeGraph.native';
import { demoGraphSchema } from '../react-flow/demo-node-body';
import { demoDocumentLarge } from '../react-flow/fixtures';

import { graphDiagnosticsFromWire } from './from-wire';
import { GraphDiagnostics } from './GraphDiagnostics';

const schema = demoGraphSchema();

/** The same twelve `NodeGraph/NodeGraph` → `Main` mounts. */
const document12 = demoDocumentLarge(12);

export const LiveGraphDiagnostics = () => {
  const [wire, setWire] = useState<GraphDiagnosticsWire | null>(null);

  return (
    <YStack
      flex={1}
      gap="$3"
      padding="$3">
      <YStack
        width="100%"
        height={300}>
        <NodeGraph
          schema={schema}
          defaultDocument={document12}
          onReady={setWire}
        />
      </YStack>
      {wire ? (
        <>
          <SizableText
            size="$2"
            opacity={0.6}>
            Read off the canvas above, inside the WebView. Nothing here is a literal.
          </SizableText>
          <GraphDiagnostics
            diagnostics={graphDiagnosticsFromWire(wire)}
            show
          />
        </>
      ) : (
        <SizableText
          size="$2"
          fontFamily="$mono">
          waiting for the canvas&apos;s ready event…
        </SizableText>
      )}
    </YStack>
  );
};
