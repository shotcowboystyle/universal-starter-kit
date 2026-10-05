/**
 * The `fill` sizing contract.
 *
 * Phase 1 measured the failure on device: a consumer-owned flexible body
 * inside the native sheet was delivered height 0, so a viewport that mounts
 * on its measurement mounted nothing, while a sibling with a declared 240pt
 * height got the space it asked for. `fill` opts into the sheet's existing
 * keyboard-aware cap as a DEFINITE height and opens every link between the
 * frame and the body, so the owned viewport has something to bootstrap from.
 *
 * These are composition checks, not Yoga geometry: happy-dom lays nothing
 * out. A missing intermediate link has to fail here, because opening only
 * the outer frame reproduces the measured zero. Device acceptance is the
 * parent's, on a real run.
 */
import { renderWithProviders } from '@repo/test-utils';
import { cleanup } from '@testing-library/react';
import { Text } from 'tamagui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SheetModal as NativeSheetModal } from './index.native';

import { SheetModal as WebSheetModal, type SheetModalProps } from './index';

vi.mock('react-native-web', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-native')>()),
  ActionSheetIOS: undefined,
  Modal: ({ children }: { children: import('react').ReactNode }) => children,
}));

afterEach(cleanup);

/** Tamagui emits atomic classes; `flex: 1` is grow+shrink+basis together. */
const flexOne = ['_fg-1', '_fs-1', '_fb-0px'];
const minZero = '_mih-0px';

function classes(element: HTMLElement) {
  return element.className.split(/\s+/);
}

function renderNative(props: Partial<SheetModalProps> = {}) {
  return renderWithProviders(
    <NativeSheetModal open onOpenChange={() => {}} header={<Text>Move to project</Text>} {...props}>
      <Text>row</Text>
    </NativeSheetModal>,
  );
}

describe('native fill allocates the sheet body', () => {
  it('turns the existing cap into a definite frame height only when filling', () => {
    const filled = renderNative({ fill: true }).getByTestId('sheet-modal-frame');
    expect(filled.style.height).not.toBe('');
    expect(filled.style.height).toBe(filled.style.maxHeight);
    cleanup();
    const intrinsic = renderNative().getByTestId('sheet-modal-frame');
    expect(intrinsic.style.height).toBe('');
    expect(intrinsic.style.maxHeight).not.toBe('');
  });

  it('opens every link between the frame and the body, not just the outer one', () => {
    const view = renderNative({ fill: true });
    for (const id of ['sheet-modal-surface', 'sheet-modal-content']) {
      const link = classes(view.getByTestId(id));
      expect(link, `${id} grows`).toEqual(expect.arrayContaining(flexOne));
      expect(link, `${id} can collapse`).toContain(minZero);
    }
    const body = view.getByTestId('sheet-modal-body');
    expect(body.style.flexGrow).toBe('1');
    expect(body.style.minHeight).toBe('0px');
  });

  it('leaves the default branch intrinsic, and false is the same as absent', () => {
    for (const props of [{}, { fill: false }]) {
      const view = renderNative(props);
      expect(view.queryByTestId('sheet-modal-body')).toBeNull();
      expect(classes(view.getByTestId('sheet-modal-surface'))).not.toContain('_fg-1');
      expect(classes(view.getByTestId('sheet-modal-content'))).not.toContain('_fg-1');
      cleanup();
    }
  });

  it('keeps the grabber and header out of the flexible body', () => {
    const view = renderNative({ fill: true });
    const body = view.getByTestId('sheet-modal-body');
    const grabber = view.getByTestId('sheet-modal-grabber');
    expect(grabber.style.flexShrink).toBe('0');
    expect(body.contains(grabber)).toBe(false);
    const header = view.getByText('Move to project');
    expect(body.contains(header)).toBe(false);
    expect(view.getByTestId('sheet-modal-content').contains(body)).toBe(true);
  });

  it('adds no scroll owner when the consumer keeps scrolling, and exactly one when it does not', () => {
    expect(renderNative({ fill: true }).queryAllByTestId('sheet-modal-scroll')).toHaveLength(0);
    cleanup();
    const scrollers = renderNative({ fill: true, scrollable: true }).getAllByTestId('sheet-modal-scroll');
    expect(scrollers).toHaveLength(1);
    expect(scrollers[0].style.flexGrow).toBe('1');
  });

  it('keeps the content-sized scroller on the default branch', () => {
    const scroller = renderNative({ scrollable: true }).getByTestId('sheet-modal-scroll');
    expect(scroller.style.flexGrow).toBe('0');
  });
});

/*
 * Web already gets a definite percent height from the Sheet's snap point, so
 * fill only has to open the body chain inside it. tamagui renders the sheet
 * through a portal AND inline, so every query here is plural on purpose.
 */
function renderWeb(props: Partial<SheetModalProps> = {}) {
  return renderWithProviders(
    <WebSheetModal open onOpenChange={() => {}} header={<Text>Move to project</Text>} {...props}>
      <Text>row</Text>
    </WebSheetModal>,
  );
}

describe('web fill opens the body inside the snapped frame', () => {
  it('mounts a growing body slot only when filling', () => {
    const filled = renderWeb({ fill: true }).getAllByTestId('sheet-modal-body');
    expect(filled.length).toBeGreaterThan(0);
    for (const slot of filled) {
      expect(classes(slot)).toEqual(expect.arrayContaining(flexOne));
      expect(classes(slot)).toContain(minZero);
    }
    cleanup();
    expect(renderWeb().queryAllByTestId('sheet-modal-body')).toHaveLength(0);
  });

  it('hands the body slot to the sheet scroller when the sheet owns scrolling', () => {
    const view = renderWeb({ fill: true, scrollable: true });
    const bodies = view.getAllByTestId('sheet-modal-body');
    const scrollers = view.getAllByTestId('sheet-modal-scroll');
    expect(scrollers.length).toBe(bodies.length);
    for (const body of bodies) {
      expect(body.querySelectorAll('[data-testid="sheet-modal-scroll"]')).toHaveLength(1);
    }
  });

  it('keeps one scroll owner and no body slot on the default branch', () => {
    const view = renderWeb({ scrollable: true });
    expect(view.queryAllByTestId('sheet-modal-body')).toHaveLength(0);
    expect(view.getAllByTestId('sheet-modal-scroll').length).toBeGreaterThan(0);
  });
});
