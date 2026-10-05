/**
 * The story file itself is the artifact under test here: it gives
 * AnimateHeight its Kitchen Sink title, and a story that never mounts is
 * the failure mode the previous wave shipped. These render every exported
 * story through the real providers so a broken import or a bad arg fails the
 * package tests instead of the gallery.
 */
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import meta, { AlwaysOpen, Default, FollowsContent } from './AnimateHeight.stories';

afterEach(cleanup);

describe('AnimateHeight stories', () => {
  it('declares the Components/AnimateHeight title against the component', () => {
    expect(meta.title).toBe('Components/AnimateHeight');
    expect(meta.component).toBeDefined();
  });

  it('Main mounts collapsed with the expand affordance', () => {
    renderWithProviders(<>{Default.render?.({} as never, {} as never)}</>);
    expect(screen.getByText('Expand')).toBeTruthy();
  });

  it('Follower mode mounts with content already visible', () => {
    renderWithProviders(<>{FollowsContent.render?.({} as never, {} as never)}</>);
    expect(screen.getByText('Height is measured, not guessed.')).toBeTruthy();
  });

  it('Open renders its children when open is true', () => {
    renderWithProviders(<>{AlwaysOpen.render?.(AlwaysOpen.args as never, { args: AlwaysOpen.args } as never)}</>);
    expect(screen.getByText('Toggle `open` in the controls panel.')).toBeTruthy();
  });
});
