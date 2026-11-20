/**
 * Design §9.5's record, rendered so a screenshot is a diagnosis.
 *
 * On a device there is no console to open, so this panel is the whole of the
 * evidence. It leads with the failure when there is one — **which stage boot
 * reached and which phase threw** — because that pair is what tells a reader
 * which of design §9.4's five layers let the failure through, and everything
 * else is context behind it.
 *
 * Dev-only by default, per §9.5. `show` overrides that, which is what the
 * device runs at 2.7/2.8 use to read the panel out of a release build.
 */

import type { ReactNode } from 'react';
import { SizableText, YStack } from 'tamagui';

import { bootStages } from '../dom/boot';

import type { GraphDiagnostics as GraphDiagnosticsRecord } from './types';

export interface GraphDiagnosticsProps {
  readonly diagnostics: GraphDiagnosticsRecord;
  /** Defaults to dev-only. Pass `true` to read the panel in a release build. */
  readonly show?: boolean;
}

/** `script → module → …`, with the stage reached marked. */
const stageTrail = (stage: GraphDiagnosticsRecord['stage']): string => {
  if (!stage) {
    return `${bootStages.join(' → ')}  (none reached)`;
  }
  const index = bootStages.indexOf(stage);
  return bootStages.map((name, i) => (i === index ? `[${name}]` : name)).join(' → ');
};

/** The probe's verdict as the panel prints it. */
const faceVerdict = (probe: GraphDiagnosticsRecord['faces'][number]): string => {
  if (!probe.conclusive) {
    return 'INCONCLUSIVE';
  }
  return probe.matched ? 'MATCHED' : 'MISS';
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <SizableText
    size="$1"
    fontFamily="$mono">
    {label}: {value}
  </SizableText>
);

/**
 * The failure banner.
 *
 * Named separately because it is the part that has to survive a screenshot at
 * phone resolution: a reader must get the stage and the phase without zooming.
 */
export const GraphBootFailure = ({ diagnostics }: { diagnostics: GraphDiagnosticsRecord }): ReactNode => {
  const { lastError, stage } = diagnostics;
  if (!lastError) {
    return null;
  }
  return (
    <YStack
      gap="$1"
      padding="$3"
      borderRadius="$4"
      backgroundColor="$red3"
      role="alert">
      <SizableText
        size="$3"
        fontWeight="600"
        color="$red11">
        boot failed at stage {stage ?? 'none'} · phase {lastError.phase}
      </SizableText>
      <SizableText
        size="$2"
        fontFamily="$mono"
        color="$red11">
        {lastError.message}
      </SizableText>
      <SizableText
        size="$1"
        fontFamily="$mono"
        color="$red11"
        opacity={0.8}>
        {stageTrail(stage)}
      </SizableText>
    </YStack>
  );
};

export const GraphDiagnostics = ({ diagnostics, show }: GraphDiagnosticsProps): ReactNode => {
  const visible = show ?? process.env.NODE_ENV !== 'production';
  if (!visible) {
    return null;
  }
  const {
    stage,
    bootMs,
    renderer,
    xyflowVersion,
    layoutRunner,
    faces,
    faceDelivery,
    nodesMounted,
    nodesInDocument,
    culling,
    renderMode,
    scheme,
  } = diagnostics;
  // The gap between the two counts is the thing a reader has to be told, not
  // left to work out: with culling on, a 12-node document paints ten bodies at
  // the default viewport, and a panel that printed one number for both made
  // "renders 12 nodes" impossible to read off a screenshot.
  const culled = nodesInDocument - nodesMounted;
  return (
    <YStack
      gap="$2"
      padding="$3"
      borderRadius="$4"
      backgroundColor="$background"
      data-graph-diagnostics="">
      <GraphBootFailure diagnostics={diagnostics} />
      <Row
        label="stage"
        value={stage ?? 'none'}
      />
      <Row
        label="bootMs"
        value={bootMs === null ? 'no boot record' : `${bootMs} ms`}
      />
      <Row
        label="renderer"
        value={renderer}
      />
      <Row
        label="xyflow"
        value={xyflowVersion}
      />
      <Row
        label="layoutRunner"
        value={layoutRunner}
      />
      <Row
        label="nodesInDocument"
        value={String(nodesInDocument)}
      />
      <Row
        label="nodesMounted"
        value={culled > 0 ? `${nodesMounted} — ${culled} outside the viewport, culling is on` : String(nodesMounted)}
      />
      <Row
        label="culling"
        value={String(culling)}
      />
      <Row
        label="renderMode"
        value={renderMode}
      />
      <Row
        label="scheme"
        value={scheme}
      />
      {faceDelivery.length === 0 ? (
        <Row
          label="faceDelivery"
          value="no faces mounted"
        />
      ) : (
        faceDelivery.map((face) => (
          <Row
            key={face.id}
            label="faceDelivery"
            value={`${face.id} · ${face.family} ${face.weight} · ${face.source}`}
          />
        ))
      )}
      {faces.length === 0 ? (
        <Row
          label="faces"
          value="not probed"
        />
      ) : (
        faces.map((probe) => (
          <SizableText
            key={probe.stack}
            size="$1"
            fontFamily="$mono">
            face: {faceVerdict(probe)} · {probe.widthStack.toFixed(2)}px vs {probe.widthFirstCorrupted.toFixed(2)}px ·{' '}
            {probe.stack}
          </SizableText>
        ))
      )}
    </YStack>
  );
};
