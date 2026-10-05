import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderWithProviders } from '@repo/test-utils';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { formatPlayerTime } from './PlayerChrome';

import { Video } from './index';

const here = dirname(fileURLToPath(import.meta.url));

vi.mock('expo-video', () => ({
  useVideoPlayer: () => ({
    loop: false,
    muted: false,
    play: vi.fn(),
    pause: vi.fn(),
  }),
  VideoView: (props: { accessibilityLabel?: string }) =>
    React.createElement('div', {
      'data-testid': 'expo-video-view',
      'aria-label': props.accessibilityLabel,
    }),
}));

describe('Video', () => {
  it('renders a figure with video and caption on web', () => {
    const { container } = renderWithProviders(
      <Video src="https://example.com/clip.mp4" title="Demo">
        Caption text
      </Video>,
    );
    expect(container.querySelector('figure')).toBeTruthy();
    expect(container.querySelector('video')).toBeTruthy();
    expect(container.querySelector('figcaption')?.textContent).toContain('Caption text');
  });

  it('paints house overlay chrome instead of native controls', () => {
    const { container, getByLabelText } = renderWithProviders(
      <Video src="https://example.com/clip.mp4" title="Demo" controls />,
    );
    const el = container.querySelector('video');
    expect(el?.hasAttribute('controls')).toBe(false);
    expect(container.querySelector("[data-testid='video-chrome']")).toBeTruthy();
    expect(container.querySelectorAll("[aria-label='Play']").length).toBeGreaterThanOrEqual(1);
    expect(getByLabelText('Mute')).toBeTruthy();
    expect(getByLabelText('Enter fullscreen')).toBeTruthy();
    expect(getByLabelText('Seek')).toBeTruthy();
  });

  it('omits overlay chrome when controls are off', () => {
    const { container, queryByTestId } = renderWithProviders(
      <Video src="https://example.com/clip.mp4" controls={false} />,
    );
    expect(queryByTestId('video-chrome')).toBeNull();
    expect(container.querySelector('video')?.hasAttribute('controls')).toBe(false);
  });

  it('omits the video element when src is empty', () => {
    const { container } = renderWithProviders(<Video src="" />);
    expect(container.querySelector('figure')).toBeTruthy();
    expect(container.querySelector('video')).toBeFalsy();
  });

  it('forwards playback props onto the web video element', () => {
    const { container } = renderWithProviders(
      <Video
        src="https://example.com/clip.mp4"
        muted
        loop
        autoPlay
        controls={false}
        poster="https://example.com/poster.jpg"
        title="Props"
      />,
    );
    const el = container.querySelector('video');
    expect(el).toBeTruthy();
    expect(el?.hasAttribute('loop')).toBe(true);
    expect(el?.getAttribute('poster')).toBe('https://example.com/poster.jpg');
    expect(el?.getAttribute('aria-label')).toBe('Props');
  });

  it('does not paint a status pip; tile radius stays UNCLAMPED', () => {
    const src = [
      readFileSync(join(here, 'index.tsx'), 'utf8'),
      readFileSync(join(here, 'index.native.tsx'), 'utf8'),
      readFileSync(join(here, 'VideoFrame.tsx'), 'utf8'),
    ].join('\n');
    expect(src).not.toMatch(/knobProps\.cardSurface|knobProps\.containerRadius|capContainerRadius\(/);
    expect(src).not.toMatch(/data-status-pip|StatusPip|statusPip/);
    expect(src).toContain('mediaTileFrameProps');

    const { container } = renderWithProviders(<Video src="https://example.com/clip.mp4" title="Demo" controls />);
    expect(container.querySelector('[data-status-pip]')).toBeNull();
    expect(container.querySelector("[data-media-tile='video']")).toBeTruthy();
    expect(container.querySelector("[data-testid='video-chrome']")).toBeTruthy();
  });
});

describe('formatPlayerTime', () => {
  it('formats seconds and hours without NaN', () => {
    expect(formatPlayerTime(0)).toBe('0:00');
    expect(formatPlayerTime(65)).toBe('1:05');
    expect(formatPlayerTime(3661)).toBe('1:01:01');
    expect(formatPlayerTime(Number.NaN)).toBe('0:00');
  });
});

describe('Video native module (smoke)', () => {
  /**
   * The peer-present path cannot be exercised here, and the `vi.mock` above
   * cannot change that. `loadExpoVideo()` reaches the peer with `require()` —
   * deliberately, so the barrel stays eval-safe for native consumers that lack
   * the peer — and `vi.mock` only intercepts the ESM graph. Probed directly:
   * `import("expo-video")` returns the mock, while `require("expo-video")`
   * bypasses it, resolves the real package, and throws
   * "Cannot find module .../expo-video/build/VideoModule" because the native
   * side does not exist under Node. So in this environment the peer is always
   * unavailable, and the honest contract to assert is the DEGRADATION: render
   * the poster stand-in, keep the caption, and never crash. Playback itself
   * needs a device/Metro run (see the native animation matrices in p-results).
   */
  it('degrades to the poster surface when the expo-video peer cannot load', async () => {
    const { Video: NativeVideo } = await import('./index.native');
    const { container, queryByTestId } = renderWithProviders(
      <NativeVideo src="https://example.com/native.mp4" title="Native demo">
        Native caption
      </NativeVideo>,
    );

    expect(queryByTestId('expo-video-view')).toBeNull();
    expect(container.textContent).toContain('Native caption');
  });

  it('native empty src omits the player surface', async () => {
    const { Video: NativeVideo } = await import('./index.native');
    const { container, queryByTestId } = renderWithProviders(<NativeVideo src="" />);
    expect(queryByTestId('expo-video-view')).toBeNull();
    expect(container.textContent).not.toContain('Video playback requires');
  });
});
