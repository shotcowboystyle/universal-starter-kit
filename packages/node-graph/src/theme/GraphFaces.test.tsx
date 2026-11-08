/**
 * What `source: "inline"` MEANS — and the bug that made it mean nothing.
 *
 * The branch that reports it carried a comment promising to "confirm THOSE
 * land" and then marked the face `inline` without asking `document.fonts`
 * anything. Measured on the iPhone 16e at MPO-211: the canvas reported every
 * face `inline`, design 6.3's probe ran on the way to `ready` — which the
 * canvas now waits for the faces to settle before emitting — and measured the
 * FALLBACK family, reporting `MISS · 205.28px vs 205.28px` on a canvas whose
 * labels painted in Inter a moment later. The verdict arrived before the thing
 * it judged.
 *
 * `document.fonts` is stubbed rather than exercised: happy-dom has no real
 * font loading, and what these specs are about is which question the hook
 * asks, not whether a WOFF2 decodes.
 */

import { renderWithProviders } from '@repo/test-utils';
import { cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import type { GraphFaceAsset } from './faces';
import { GraphFaces } from './GraphFaces';
import type { GraphFaceStatus } from './GraphFaces';

const face: GraphFaceAsset = {
  id: 'inter-400',
  family: 'Inter',
  weight: 400,
  style: 'normal',
  category: 'sans-serif',
  source: 'apps/storybook/public/fonts/inter-400.woff2',
  base64: 'AAAA',
  byteLength: 3,
  sha256: '0'.repeat(64),
};

interface FontsStub {
  load: Mock<(query: string) => Promise<object[]>>;
  check: Mock<(query: string) => boolean>;
}

/** Installs a `document.fonts` that answers however the test says. */
const stubFonts = (answer: boolean): FontsStub => {
  const fonts: FontsStub = {
    load: vi.fn<(query: string) => Promise<object[]>>(async () => (answer ? [{}] : [])),
    check: vi.fn<(query: string) => boolean>(() => answer),
  };
  Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });
  return fonts;
};

const statusesFor = async (assetUris?: Record<string, string>) => {
  const seen: (readonly GraphFaceStatus[])[] = [];
  renderWithProviders(
    <GraphFaces
      assetUris={assetUris}
      faces={[face]}
      onStatus={(statuses) => seen.push(statuses)}
      timeoutMs={50}
    />,
  );
  await waitFor(() => {
    expect(seen.at(-1)?.[0]?.source).not.toBe('pending');
  });
  return seen.at(-1)!;
};

describe('GraphFaces delivery', () => {
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(document, 'fonts');
  });

  it('confirms the bytes landed before reporting inline', async () => {
    const fonts = stubFonts(true);
    const statuses = await statusesFor();
    expect(statuses[0]?.source).toBe('inline');
    // The whole point: it ASKED. Without this call `inline` is a guess, and
    // the probe that runs on the strength of it measures the fallback.
    expect(fonts.load).toHaveBeenCalledWith('400 16px "Inter"');
  });

  it('reports failed, not inline, when the bytes never land', async () => {
    stubFonts(false);
    const statuses = await statusesFor();
    expect(statuses[0]?.source).toBe('failed');
  });

  it('prefers the asset URL when it answers', async () => {
    stubFonts(true);
    const statuses = await statusesFor({ 'inter-400': '/fonts/inter-400.woff2' });
    expect(statuses[0]?.source).toBe('asset');
  });

  it('starts at pending, so nothing reads a delivery that has not resolved', () => {
    stubFonts(true);
    const seen: (readonly GraphFaceStatus[])[] = [];
    renderWithProviders(
      <GraphFaces
        faces={[face]}
        onStatus={(statuses) => seen.push(statuses)}
        timeoutMs={50}
      />,
    );
    expect(seen[0]?.[0]?.source).toBe('pending');
  });
});
