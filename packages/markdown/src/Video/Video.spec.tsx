/**
 * Video spec (MPO-177). Stories live in Markdown/Media; this file is the
 * colocated anatomy lock (web <video> + SB-M-1227 empty-src omission).
 */

import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it } from 'vitest';

import { Video } from './index';

describe('Video (web)', () => {
  it('renders a muted, autoplaying, looping inline <video> inside a figure', () => {
    const { container } = renderWithProviders(<Video src="https://example.com/clip.mp4" />);
    expect(container.querySelector('figure')).toBeTruthy();
    const video = container.querySelector('video');
    expect(video).toBeTruthy();
    expect(video!.getAttribute('src')).toBe('https://example.com/clip.mp4');
    // Boolean media attributes reflect the safe-autoplay defaults.
    expect(video!.hasAttribute('autoplay')).toBe(true);
    expect(video!.hasAttribute('loop')).toBe(true);
    expect(video!.hasAttribute('playsinline')).toBe(true);
    expect(video!.hasAttribute('controls')).toBe(false);
  });

  it('omits the <video> element entirely for an empty src (SB-M-1227)', () => {
    const { container } = renderWithProviders(<Video src="" />);
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('figure')).toBeTruthy();
  });

  it('forwards controls/poster and renders children as a figcaption', () => {
    const { container } = renderWithProviders(
      <Video
        src="https://example.com/clip.mp4"
        controls
        poster="https://example.com/poster.png">
        A demo caption
      </Video>,
    );
    const video = container.querySelector('video');
    expect(video!.hasAttribute('controls')).toBe(true);
    expect(video!.getAttribute('poster')).toBe('https://example.com/poster.png');
    const caption = container.querySelector('figcaption');
    expect(caption).toBeTruthy();
    expect(caption!.textContent).toBe('A demo caption');
  });

  it('renders no figcaption without children', () => {
    const { container } = renderWithProviders(<Video src="https://example.com/clip.mp4" />);
    expect(container.querySelector('figcaption')).toBeNull();
  });
});
