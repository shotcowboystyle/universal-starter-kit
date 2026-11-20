/**
 * Reads design §9.5's record out of the state that already exists.
 *
 * Nothing here is stored twice. The boot stage comes from the heartbeat's
 * global, the version from the one `@xyflow` import site, the first error from
 * the slot the DOM entry writes inline. What a caller passes in is only what
 * lives in the canvas and nowhere else.
 *
 * THE GLOBALS ARE READ ON EVERY RENDER, and that is not an oversight to be
 * memoized away. Both are written from EFFECTS — `stampBootStage` from the
 * boot sequence, the error slot from the DOM entry's catch — so both land
 * after the first render has already happened. A `useMemo` keyed on the input
 * alone captures them at mount and never looks again, and the panel then
 * reports `stage: none` on a boot that reached `faces`. Measured on the
 * Storybook at task 2.6, before the spec existed to catch it.
 *
 * Two cheap property reads per render is the correct price. The memo below
 * exists only to keep the RESULT's identity stable when nothing actually
 * moved, so a consumer memoizing on it does not re-run every frame.
 */

import { useMemo } from 'react';

import { readBootElapsedMs, readBootStage } from '../dom/boot';
import { xyflowVersion } from '../react-flow/xy';

import { readGraphError } from './last-error';
import type { GraphDiagnostics, GraphDiagnosticsInput } from './types';

const noFaces: readonly [] = Object.freeze([]);
const noDelivery: readonly [] = Object.freeze([]);

export const useGraphDiagnostics = (input: GraphDiagnosticsInput): GraphDiagnostics => {
  const { renderer, nodesMounted, nodesInDocument, culling, renderMode, scheme, layoutRunner, faces, faceDelivery } =
    input;

  const stage = readBootStage();
  // Read every render for the same reason the stage is: it is written from an
  // effect and would be captured as `null` by a memo keyed on the input alone.
  const bootMs = readBootElapsedMs();
  const error = readGraphError();
  const errorPhase = error?.phase ?? null;
  const errorMessage = error?.message ?? null;

  return useMemo(
    () => ({
      stage,
      bootMs,
      renderer,
      xyflowVersion,
      layoutRunner: layoutRunner ?? 'none',
      faces: faces ?? noFaces,
      faceDelivery: faceDelivery ?? noDelivery,
      nodesMounted,
      nodesInDocument,
      culling,
      renderMode,
      scheme,
      lastError: errorPhase && errorMessage !== null ? { phase: errorPhase, message: errorMessage } : null,
    }),
    [
      stage,
      bootMs,
      renderer,
      layoutRunner,
      faces,
      faceDelivery,
      nodesMounted,
      nodesInDocument,
      culling,
      renderMode,
      scheme,
      errorPhase,
      errorMessage,
    ],
  );
};
