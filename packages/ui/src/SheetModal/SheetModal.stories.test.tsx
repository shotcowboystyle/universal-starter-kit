/**
 * SheetModal was the harness inside SheetFrame.stories and had no title of its
 * own, so the gallery listed the frame and not the sheet. These
 * mount every exported story so an unrenderable one fails here, not in the
 * Kitchen Sink.
 *
 * Presence is asserted by accessible NAME, not by counting dialogs: tamagui's
 * Sheet keeps its portal in the tree either side of `open`, and happy-dom runs
 * no animation, so `role="dialog"` matches more than one node whatever the
 * open state is.
 */
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import meta, {
  Default,
  OpenOnMount,
  OwnedMeasuredViewport,
  OwnedScrollView,
  Scrollable,
  TallDetent,
} from './SheetModal.stories';

afterEach(cleanup);

describe('SheetModal stories', () => {
  it('declares the Components/SheetModal title against the component', () => {
    expect(meta.title).toBe('Components/SheetModal');
    expect(meta.component).toBeDefined();
  });

  it('every exported story mounts its trigger', () => {
    for (const story of [Default, Scrollable, TallDetent, OpenOnMount]) {
      renderWithProviders(<>{story.render?.({} as never, {} as never)}</>);
      expect(screen.getAllByText('Open sheet').length).toBeGreaterThan(0);
      cleanup();
    }
  });

  it('the sheet frame is a labelled modal dialog', () => {
    renderWithProviders(<>{OpenOnMount.render?.({} as never, {} as never)}</>);
    // tamagui renders the sheet through a portal AND inline, so the frame
    // appears more than once with the same accessible name; every copy has to
    // carry the modal semantics.
    const frames = screen.getAllByRole('dialog', { name: 'Move to project' });
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) {
      expect(frame.getAttribute('aria-modal')).toBe('true');
    }
  });

  it('the action row inside the sheet carries cancel and primary', () => {
    renderWithProviders(<>{OpenOnMount.render?.({} as never, {} as never)}</>);
    expect(screen.getAllByText('Cancel').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Move').length).toBeGreaterThan(0);
  });

  it('the scrollable story fills the body with rows', () => {
    renderWithProviders(<>{Scrollable.render?.({} as never, {} as never)}</>);
    expect(screen.getAllByText('Project 1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Project 30').length).toBeGreaterThan(0);
  });

  it.each([OwnedMeasuredViewport, OwnedScrollView])('mounts the public owned fixture and its control', (story) => {
    renderWithProviders(<>{story.render?.({} as never, {} as never)}</>);
    expect(screen.getByText('Open flex subject')).toBeDefined();
    fireEvent.click(screen.getByText('Open 240pt control'));
    expect(screen.getAllByText('Measure bounds').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Close fixture').length).toBeGreaterThan(0);
    expect(JSON.parse(screen.getByTestId('owned-sheet-readings').textContent).mode).toBe('control-240');
  });
});
