/**
 * Gets the `$body` face into the WebView, asset URL first, bytes second.
 *
 * Design §6.3's two mechanisms, in the order it names them:
 *
 *  1. **Asset URL.** A consumer hands in the URL Expo produced from a
 *     `require()` of the face. Nothing rides in the bundle for that face.
 *  2. **Inline base64.** Whatever the first path did not deliver, this does.
 *     Proven, and the reason `faces.generated.ts` exists.
 *
 * The switch between them is not a guess. `document.fonts.load` is awaited and
 * `document.fonts.check` is read back, so a URL that 404s inside the WebView —
 * the exact failure that makes the primary path unverified on device — demotes
 * that face to its bytes instead of leaving the canvas in a fallback family
 * nobody notices.
 *
 * IMPORTING THIS PULLS THE PAYLOAD. `faces.generated.ts` is ~200 KB of base64
 * and this module's default argument references it, so a consumer that already
 * registers Inter (every web app in this repo does, through Tamagui) should not
 * mount `GraphFaces` at all. The DOM bundle is who it is for.
 *
 * Design: docs/design/node-graph-editor.md §6.3.
 */

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { graphFaceCss } from './faces';
import type { GraphFaceAsset } from './faces';
import { generatedGraphFaces } from './faces.generated';

/** Which of the two mechanisms actually delivered a face. */
export type GraphFaceSource = 'asset' | 'inline' | 'pending' | 'failed';

/** Per-face outcome, for the diagnostics panel and the `FontProof` story. */
export interface GraphFaceStatus {
  readonly id: string;
  readonly family: string;
  readonly weight: number;
  readonly source: GraphFaceSource;
}

export interface GraphFacesProps {
  /** Defaults to the generated payload. */
  readonly faces?: readonly GraphFaceAsset[];
  /**
   * `require()`d asset URLs by face id. A face named here is tried from its URL
   * first; a face absent here goes straight to its bytes.
   */
  readonly assetUris?: Readonly<Record<string, string>>;
  /**
   * How long to wait for the asset URL before falling back, in ms.
   *
   * 1500, well inside the native watchdog's 4000 ms (design §9.4 layer 4), so a
   * slow face degrades to base64 rather than letting the whole WebView be
   * declared dead.
   */
  readonly timeoutMs?: number;
  readonly onStatus?: (statuses: readonly GraphFaceStatus[]) => void;
}

/** `${weight} 16px "${family}"` — the shorthand `document.fonts` wants. */
function faceQuery(face: GraphFaceAsset): string {
  return `${face.weight} 16px "${face.family}"`;
}

async function loadWithin(query: string, timeoutMs: number): Promise<boolean> {
  const fonts = typeof document === 'undefined' ? undefined : document.fonts;
  if (!fonts) {
    return false;
  }
  // Promise.race rather than an abort: FontFaceSet.load has no cancellation, so
  // a hung fetch would otherwise hold the canvas at the fallback family for as
  // long as the network takes.
  const timed = new Promise<boolean>((resolve) => {
    setTimeout(() => {
      resolve(false);
    }, timeoutMs);
  });
  const loaded = fonts
    .load(query)
    .then((matched) => matched.length > 0 && fonts.check(query))
    .catch(() => false);
  return await Promise.race([loaded, timed]);
}

/**
 * Resolves each face to the mechanism that actually delivered it.
 *
 * Returns the URIs still worth honouring, so the sheet re-renders with base64
 * for the ones that did not answer.
 */
export function useGraphFaces(
  faces: readonly GraphFaceAsset[],
  assetUris: Readonly<Record<string, string>> | undefined,
  timeoutMs: number,
): {
  readonly uris: Readonly<Record<string, string>>;
  readonly statuses: readonly GraphFaceStatus[];
} {
  const requested = useMemo(() => assetUris ?? {}, [assetUris]);
  const [resolved, setResolved] = useState<Readonly<Record<string, GraphFaceSource>>>({});

  const requestedKey = useMemo(() => JSON.stringify(requested), [requested]);
  const facesKey = useMemo(() => faces.map((face) => face.id).join(','), [faces]);

  useEffect(() => {
    let live = true;
    const run = async () => {
      const next: Record<string, GraphFaceSource> = {};
      for (const face of faces) {
        const query = faceQuery(face);
        if (requested[face.id]) {
          // eslint-disable-next-line no-await-in-loop
          const ok = await loadWithin(query, timeoutMs);
          if (ok) {
            next[face.id] = 'asset';
            continue;
          }
          // The URL did not answer. The sheet has not re-rendered with the
          // bytes yet — that happens on the render this `setResolved` causes —
          // so there is nothing to confirm in this pass. Reported as `inline`
          // optimistically, which is the one case where the value means
          // "falling back" rather than "landed".
          next[face.id] = 'inline';
          continue;
        }
        /**
         * No URL was offered, so the sheet ALREADY carries this face's bytes
         * and the load is confirmable right now — so confirm it.
         *
         * It did not, until MPO-211. The branch's own comment said it would
         * ("confirm THOSE land") and the code marked `inline` without asking,
         * which made `source: "inline"` mean "we gave up on the URL" rather
         * than "the bytes are available". Measured on the iPhone 16e: the
         * canvas reported every face `inline` and design 6.3's probe, which
         * runs on the way to `ready`, then measured the FALLBACK family and
         * reported `MISS · 205.28px vs 205.28px` on a canvas whose labels were
         * about to paint in Inter. A verdict that arrives before the thing it
         * judges is worse than no verdict.
         *
         * This is the path the DOM bundle takes for every face: a `require()`d
         * asset URL is the host's to produce and cannot cross the bridge, so
         * the canvas mounts `GraphFaces` with no `assetUris` at all.
         */
        // eslint-disable-next-line no-await-in-loop
        const landed = await loadWithin(query, timeoutMs);
        next[face.id] = landed ? 'inline' : 'failed';
      }
      if (live) {
        setResolved(next);
      }
    };
    void run();
    return () => {
      live = false;
    };
    // biome-ignore-start: the two keys ARE the dependencies; the arrays behind
    // them get a fresh identity every render and would re-probe at 60 Hz.
    // oxlint-disable-next-line exhaustive-deps
  }, [facesKey, requestedKey, timeoutMs]);
  // biome-ignore-end

  const uris = useMemo(() => {
    const out: Record<string, string> = {};
    for (const face of faces) {
      const uri = requested[face.id];
      // Before the probe answers, honour the URL: rendering base64 first and
      // swapping to the URL later would download both.
      if (uri && resolved[face.id] !== 'inline') {
        out[face.id] = uri;
      }
    }
    return out;
  }, [faces, requested, resolved]);

  const statuses = useMemo(
    () =>
      faces.map((face) => ({
        id: face.id,
        family: face.family,
        weight: face.weight,
        source: resolved[face.id] ?? ('pending' as GraphFaceSource),
      })),
    [faces, resolved],
  );

  return { uris, statuses };
}

/**
 * The `@font-face` sheet, plus the asset-URL-first resolution behind it.
 *
 * Renders NOTHING where there is no DOM, and that is not defensive coding — it
 * is the component being honest about what it is. This is a `<style>` element
 * and nothing else; `<style>` is a browser intrinsic, and React Native answers a
 * lowercase intrinsic it does not know with
 * `View config getter callback for component "style" must be a function`, which
 * takes the whole tree down. Measured on the iPhone 16e at task 2.7: the
 * `NodeGraph/GraphNode` → `FontProof` story mounts this directly and died
 * exactly there, on a device where the story's own error boundary was the only
 * thing between it and a blank screen.
 *
 * The hooks run either way, so the rules of hooks hold and the status callback
 * still fires; only the element is withheld. A caller on native gets `null` and
 * should read `GraphDiagnostics`, where the probe that ran INSIDE the WebView
 * arrives over the `ready` event.
 */
export function GraphFaces({
  faces = generatedGraphFaces,
  assetUris,
  timeoutMs = 1500,
  onStatus,
}: GraphFacesProps): ReactNode {
  const { uris, statuses } = useGraphFaces(faces, assetUris, timeoutMs);
  const sheet = useMemo(() => graphFaceCss(faces, uris), [faces, uris]);

  useEffect(() => {
    onStatus?.(statuses);
  }, [onStatus, statuses]);

  if (typeof document === 'undefined') {
    return null;
  }

  return (
    <style
      data-mpo-graph-faces={String(faces.length)}
      suppressHydrationWarning>
      {sheet}
    </style>
  );
}
