/**
 * A REAL canvas with design §9.5's panel under it — the web half.
 *
 * WHY IT EXISTS (MPO-211). `NodeGraph/Diagnostics` was a harness: it walked the
 * boot stages by hand and fed the panel synthetic input, including
 * `nodesMounted: loaded ? 12 : 0` — a literal, in the one story whose job was
 * to prove that number. A harness that hardcodes the thing it exists to prove
 * is worse than no harness, so the harness keeps the half it is genuinely good
 * at (breaking the bundle on purpose) and this component owns the measured
 * half.
 *
 * Every number below comes from the canvas mounted beside it:
 *
 *  - `nodesMounted` from `nodeCensus`, which counts `GraphNodeHost` instances
 *    and therefore counts node bodies React Flow actually rendered;
 *  - `nodesInDocument` from the document handed to the canvas;
 *  - `faces` from design §6.3's corrupted-first-family probe, run against a
 *    node title the canvas rendered;
 *  - `faceDelivery` from `GraphFaces`, which is how the panel says whether the
 *    asset URL answered or the base64 carried it.
 *
 * The native twin is `LiveGraphDiagnostics.native.tsx`, and it reads the same
 * record out of the WebView's `ready` event instead. Only a `.native.tsx`
 * twin, never a `.web.*` one (MPO-192).
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { SizableText, YStack } from 'tamagui';

import { useKnobEnvelope } from '../knobs/use-knob-envelope';
import { NodeGraph } from '../NodeGraph';
import { demoGraphSchema } from '../react-flow/demo-node-body';
import { demoDocumentLarge } from '../react-flow/fixtures';
import { mountedNodeCount, subscribeNodeCensus } from '../react-flow/node-census';
import { Background } from '../react-flow/xy';
import { probeRenderedFamily } from '../theme/faces';
import type { FaceProbe } from '../theme/faces';
import { GraphFaces } from '../theme/GraphFaces';
import type { GraphFaceStatus } from '../theme/GraphFaces';

import { GraphDiagnostics } from './GraphDiagnostics';
import { useGraphDiagnostics } from './use-graph-diagnostics';

const schema = demoGraphSchema();

/**
 * The same twelve `NodeGraph/NodeGraph` → `Main` mounts, built once at module
 * scope so a re-render cannot hand the canvas a new document identity.
 */
const document12 = demoDocumentLarge(12);

/**
 * The URLs `apps/storybook` serves from `public/fonts` (`staticDirs`).
 *
 * Named here so the WEB panel reports `asset` delivery while the device panel
 * reports `inline` — the two mechanisms of §6.3, each proven where it is the
 * one that runs.
 */
const webAssetUris = {
  'inter-400': '/fonts/inter-400.woff2',
  'inter-700': '/fonts/inter-700.woff2',
} as const;

export const LiveGraphDiagnostics = () => {
  const nodesMounted = useSyncExternalStore(subscribeNodeCensus, mountedNodeCount, mountedNodeCount);
  const [faces, setFaces] = useState<readonly FaceProbe[]>([]);
  const [faceDelivery, setFaceDelivery] = useState<readonly GraphFaceStatus[]>([]);
  const envelope = useKnobEnvelope({});

  const onFaceStatus = useCallback((statuses: readonly GraphFaceStatus[]) => {
    setFaceDelivery(statuses);
  }, []);

  // Probed once the faces have resolved AND a node has mounted: a width
  // measured before either is worthless, and `probeFamily` would report it as
  // inconclusive rather than as a miss.
  useEffect(() => {
    let live = true;
    const probeTitle = async () => {
      await globalThis.document.fonts.ready;
      if (!live) {
        return;
      }
      const title = globalThis.document.querySelector('[data-graph-node-title]');
      if (!title) {
        return;
      }
      const probe = probeRenderedFamily(title);
      if (probe.stack) {
        setFaces([probe]);
      }
    };
    if (nodesMounted !== 0) {
      void probeTitle();
    }
    return () => {
      live = false;
    };
  }, [nodesMounted]);

  const diagnostics = useGraphDiagnostics({
    renderer: 'react-flow-web',
    faces,
    faceDelivery,
    nodesMounted,
    nodesInDocument: document12.nodes.length,
    culling: true,
    renderMode: 'detail',
    scheme: envelope.scheme,
  });

  return (
    <YStack
      gap="$3"
      padding="$3">
      <GraphFaces
        assetUris={webAssetUris}
        onStatus={onFaceStatus}
      />
      <YStack
        width="100%"
        height={360}>
        <NodeGraph
          schema={schema}
          defaultDocument={document12}>
          <Background />
        </NodeGraph>
      </YStack>
      <SizableText
        size="$2"
        opacity={0.6}>
        Every value below is read off the canvas above. Nothing here is a literal.
      </SizableText>
      <GraphDiagnostics
        diagnostics={diagnostics}
        show
      />
    </YStack>
  );
};
