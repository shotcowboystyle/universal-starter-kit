import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import * as stories from './SheetModal.stories';

const hosts = vi.hoisted(() => ({
  props: new Map<string, Record<string, any>>(),
  measurements: [] as Array<{ id: string; callback: (...bounds: number[]) => void }>,
}));
vi.mock('@repo/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/ui')>();
  const React = await import('react');
  function observed(Component: any) {
    return React.forwardRef((props: Record<string, any>, ref) => {
      if (props.testID) {
        hosts.props.set(props.testID, props);
      }
      React.useImperativeHandle(ref, () => {
        const host = {
          measureInWindow: (callback: (...bounds: number[]) => void) => {
            hosts.measurements.push({ id: props.testID, callback });
          },
        };
        return { ...host, getNativeScrollRef: () => host };
      });
      return <Component {...props} onLayout={undefined} onContentSizeChange={undefined} onScroll={undefined} />;
    });
  }
  return {
    ...actual,
    YStack: observed(actual.YStack),
    ScrollView: observed(actual.ScrollView),
    SheetModal: (props: any) => {
      hosts.props.set('public-sheet-modal', props);
      return props.open ? (
        <>
          {props.header}
          {props.children}
        </>
      ) : null;
    },
  };
});
afterEach(() => {
  cleanup();
  hosts.props.clear();
  hosts.measurements = [];
});
function sheetProps() {
  return hosts.props.get('public-sheet-modal')!;
}
function renderStory(name: 'OwnedMeasuredViewport' | 'OwnedScrollView') {
  const story = (stories as Record<string, any>)[name];
  expect(story, `${name} is a registered story`).toBeDefined();
  return renderWithProviders(<>{story.render(story.args ?? {}, {})}</>);
}
function layout(id: string, height: number) {
  act(() => hosts.props.get(id)!.onLayout({ nativeEvent: { layout: { x: 0, y: 44, width: 300, height } } }));
}
function readings(view: ReturnType<typeof renderStory>) {
  return JSON.parse(view.getByTestId('owned-sheet-readings').textContent);
}
it('keeps the measured subject unmeasured until a delivered layout and distinguishes zero', () => {
  const view = renderStory('OwnedMeasuredViewport');
  fireEvent.click(view.getByText('Open flex subject'));
  expect(readings(view).viewportLayout).toBe('unmeasured');
  expect(hosts.props.get('owned-sheet-frame')!.height).toBeUndefined();
  expect(view.queryByText('Record 60')).toBeNull();
  layout('owned-sheet-viewport', 0);
  expect(readings(view).viewportLayout.height).toBe(0);
  expect(view.queryByText('Record 60')).toBeNull();
  layout('owned-sheet-viewport', 187.5);
  expect(readings(view).viewportLayout.height).toBe(187.5);
  expect(view.getByText('Record 60')).toBeDefined();
});
it('provides a named fixed control without treating its declared height as a measurement', () => {
  const view = renderStory('OwnedMeasuredViewport');
  fireEvent.click(view.getByText('Open 240pt control'));
  expect(hosts.props.get('owned-sheet-frame')!.height).toBe(240);
  expect(readings(view).mode).toBe('control-240');
  expect(readings(view).frameLayout).toBe('unmeasured');
  layout('owned-sheet-viewport', 192);
  expect(view.getByText('Record 60')).toBeDefined();
  expect(hosts.props.get('owned-sheet-scroll')).toBeDefined();
});
it('mounts the owned scroller without a measurement gate and records delivered content and offset', () => {
  const view = renderStory('OwnedScrollView');
  fireEvent.click(view.getByText('Open flex subject'));
  expect(view.getByText('Record 60')).toBeDefined();
  expect(view.getAllByText(/^Record \d+$/)).toHaveLength(60);
  expect(readings(view).offset).toBe('unmeasured');
  const scroll = hosts.props.get('owned-sheet-scroll')!;
  act(() => {
    scroll.onContentSizeChange(300, 2500.5);
    scroll.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 123.25 } } });
  });
  expect(readings(view).content).toEqual({ width: 300, height: 2500.5 });
  expect(readings(view).offset).toEqual({ x: 0, y: 123.25 });
  fireEvent.click(view.getByText('Activate Record 60'));
  expect(readings(view).tailPresses).toBe(1);
});
it('records public window-bound callbacks and rejects callbacks from a closed presentation', () => {
  const view = renderStory('OwnedScrollView');
  fireEvent.click(view.getByText('Open flex subject'));
  fireEvent.click(view.getByText('Measure bounds'));
  const pending = [...hosts.measurements];
  const frame = pending.find((item) => item.id === 'owned-sheet-frame')!;
  expect(frame).toBeDefined();
  expect(pending.some((item) => item.id === 'owned-sheet-scroll')).toBe(true);
  act(() => {
    frame.callback(18, 300, 354, 240);
  });
  expect(readings(view).frameWindow).toEqual({ x: 18, y: 300, width: 354, height: 240 });
  const viewport = pending.find((item) => item.id === 'owned-sheet-viewport')!;
  fireEvent.click(view.getByText('Close fixture'));
  fireEvent.click(view.getByText('Open 240pt control'));
  act(() => {
    viewport.callback(18, 344, 354, 196);
  });
  expect(readings(view).viewportWindow).toBe('unmeasured');
  expect(readings(view).frameWindow).toBe('unmeasured');
});
it('reports invalid readings rather than converting them to zero', () => {
  const view = renderStory('OwnedScrollView');
  fireEvent.click(view.getByText('Open flex subject'));
  layout('owned-sheet-viewport', Number.NaN);
  expect(readings(view).viewportLayout).toBe('invalid');
  expect(readings(view).sheetFrameWindow).toBe('unavailable: SheetModal has no public frame ref');
});

it('keeps an absent measured scroller unavailable and ignores superseded samples', () => {
  const view = renderStory('OwnedMeasuredViewport');
  fireEvent.click(view.getByText('Open flex subject'));
  fireEvent.click(view.getByText('Measure bounds'));
  expect(readings(view).scrollWindow).toBe('unavailable');
  expect(readings(view).tailWindow).toBe('unavailable');
  expect(readings(view).frameWindow).toBe('unmeasured');
  const old = hosts.measurements.find((item) => item.id === 'owned-sheet-frame')!;
  hosts.measurements = [];
  fireEvent.click(view.getByText('Measure bounds'));
  expect(readings(view).sample).toBe(2);
  act(() => {
    old.callback(18, 300, 354, 240);
  });
  expect(readings(view).frameWindow).toBe('unmeasured');
  const current = hosts.measurements.find((item) => item.id === 'owned-sheet-frame')!;
  act(() => {
    current.callback(18, 780, 354, 0);
  });
  expect(readings(view).frameWindow).toEqual({ x: 18, y: 780, width: 354, height: 0 });
});

it('retains the closed presentation readings and resets actual tail presses on reopening', () => {
  const view = renderStory('OwnedScrollView');
  fireEvent.click(view.getByText('Open 240pt control'));
  layout('owned-sheet-viewport', 192);
  fireEvent.click(view.getByText('Activate Record 60'));
  fireEvent.click(view.getByText('Close fixture'));
  layout('owned-sheet-viewport', 0);
  expect(readings(view).viewportLayout.height).toBe(192);
  expect(readings(view).tailPresses).toBe(1);
  expect(readings(view).presentation).toBe(1);
  expect(readings(view).open).toBe(false);
  fireEvent.click(view.getByText('Open flex subject'));
  expect(readings(view).viewportLayout).toBe('unmeasured');
  expect(readings(view).tailPresses).toBe(0);
  expect(readings(view).presentation).toBe(2);
  expect(view.getAllByText('Generic detail 1 for this record.')).toHaveLength(60);
  expect(view.getAllByText('Generic detail 4 for this record.')).toHaveLength(15);
});

it('hands the chosen fill value to the real public sheet rather than inferring it', () => {
  const view = renderStory('OwnedMeasuredViewport');
  fireEvent.click(view.getByText('Open flex subject'));
  expect(sheetProps().fill).toBe(false);
  expect(readings(view).fill).toBe(false);
  fireEvent.click(view.getByText('Close fixture'));
  fireEvent.click(view.getByText('Open flex subject (fill)'));
  expect(sheetProps().fill).toBe(true);
  expect(readings(view).fill).toBe(true);
  expect(readings(view).mode).toBe('subject');
  // The fixed control is a diagnostic, not the height contract: it never
  // asks the sheet to allocate.
  fireEvent.click(view.getByText('Close fixture'));
  fireEvent.click(view.getByText('Open 240pt control'));
  expect(sheetProps().fill).toBe(false);
});

it('measures the owned toolbar so the parent can subtract it from the body', () => {
  const view = renderStory('OwnedScrollView');
  fireEvent.click(view.getByText('Open flex subject (fill)'));
  expect(readings(view).toolbarLayout).toBe('unmeasured');
  layout('owned-sheet-toolbar', 44.5);
  layout('owned-sheet-frame', 400);
  layout('owned-sheet-viewport', 355.5);
  const captured = readings(view);
  expect(captured.toolbarLayout.height).toBe(44.5);
  expect(captured.frameLayout.height - captured.toolbarLayout.height).toBe(captured.viewportLayout.height);
});
