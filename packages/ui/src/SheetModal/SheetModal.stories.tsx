import { Button, Input } from '@repo/forms';
import {
  Paragraph as FixtureText,
  ScrollView,
  SheetModal as PublicSheetModal,
  XStack,
  YStack as FixtureStack,
  type TamaguiElement,
} from '@repo/ui';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useRef, useState } from 'react';
import { Platform, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Paragraph, SizableText, YStack } from 'tamagui';

import { ActionBar } from '../actions/ActionBar';

import { SheetModal } from './index';

function Harness({
  scrollable = false,
  snapPoint,
  startOpen = false,
}: {
  scrollable?: boolean;
  snapPoint?: number;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  return (
    <YStack minHeight={480} gap="$3">
      <Button
        onPress={() => {
          setOpen(true);
        }}>
        Open sheet
      </Button>
      <Paragraph size="$2">Dismiss by tapping the scrim, dragging to the bottom, or pressing Escape.</Paragraph>
      <SheetModal
        open={open}
        onOpenChange={setOpen}
        scrollable={scrollable}
        {...(snapPoint === undefined ? {} : { snapPoint })}
        header={<SizableText fontWeight="600">Move to project</SizableText>}>
        {scrollable ? (
          <YStack gap="$2">
            {Array.from({ length: 30 }).map((_, index) => (
              <Paragraph key={index}>Project {index + 1}</Paragraph>
            ))}
          </YStack>
        ) : (
          <YStack gap="$3">
            <Paragraph>The sheet is a dialog region, so the action row inside it caps at two actions.</Paragraph>
            <ActionBar
              cancel={
                <Button
                  chromeless
                  onPress={() => {
                    setOpen(false);
                  }}>
                  Cancel
                </Button>
              }
              primary={
                <Button
                  accent
                  onPress={() => {
                    setOpen(false);
                  }}>
                  Move
                </Button>
              }
            />
          </YStack>
        )}
      </SheetModal>
    </YStack>
  );
}

const meta: Meta<typeof SheetModal> = {
  title: 'Components/SheetModal',
  component: SheetModal,
  parameters: {
    status: { type: 'beta' },
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          "Modal bottom sheet. Anatomy follows the Apple HIG sheet (grabber, percent detent, swipe to dismiss) with Radix Dialog semantics: `role=dialog`, `aria-modal`, focus moved in, trapped, and returned on close, and Escape dismissal wired here because tamagui's Sheet has no key handling of its own. The frame opens a dialog region, so an ActionBar inside it inherits the two-action cap. Web renders tamagui's Sheet; the native twin is an RN Modal, because a raw Sheet cannot re-present from a trigger tap on device.",
      },
    },
  },
  argTypes: {
    snapPoint: { control: { type: 'range', min: 30, max: 95, step: 5 } },
    scrollable: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<typeof SheetModal>;

export const Default: Story = {
  name: 'Main',
  render: () => <Harness />,
};

export const Scrollable: Story = {
  name: 'Scrollable body',
  render: () => <Harness scrollable />,
};

export const TallDetent: Story = {
  name: 'Tall detent',
  parameters: {
    docs: {
      description: {
        story:
          '`snapPoint` is a percent of travel. 92 is the tallest height real callers pass (the command palette); every one of those was a no-op on device until the detent resolver landed.',
      },
    },
  },
  render: () => <Harness snapPoint={92} />,
};

export const OpenOnMount: Story = {
  name: 'Open',
  render: () => <Harness startOpen />,
};

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
type Reading<T> = T | 'unmeasured' | 'unavailable' | 'invalid';
type FixtureMode = 'subject' | 'control-240';
interface FixtureReadings {
  frameLayout: Reading<Bounds>;
  toolbarLayout: Reading<Bounds>;
  viewportLayout: Reading<Bounds>;
  scrollLayout: Reading<Bounds>;
  frameWindow: Reading<Bounds>;
  viewportWindow: Reading<Bounds>;
  scrollWindow: Reading<Bounds>;
  tailWindow: Reading<Bounds>;
  content: Reading<{ width: number; height: number }>;
  offset: Reading<{ x: number; y: number }>;
  sampleWindow: ReturnType<typeof useWindowDimensions> | 'unmeasured';
  sample: number;
  tailPresses: number;
}

function emptyReadings(): FixtureReadings {
  return {
    frameLayout: 'unmeasured',
    toolbarLayout: 'unmeasured',
    viewportLayout: 'unmeasured',
    scrollLayout: 'unmeasured',
    frameWindow: 'unmeasured',
    viewportWindow: 'unmeasured',
    scrollWindow: 'unmeasured',
    tailWindow: 'unmeasured',
    content: 'unmeasured',
    offset: 'unmeasured',
    sampleWindow: 'unmeasured',
    sample: 0,
    tailPresses: 0,
  };
}

function bounds(x: number, y: number, width: number, height: number): Reading<Bounds> {
  return [x, y, width, height].every(Number.isFinite) && width >= 0 && height >= 0
    ? { x, y, width, height }
    : 'invalid';
}

function OwnedBodyFixture({ measured }: { measured: boolean }) {
  const window = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<FixtureMode>('subject');
  const [fill, setFill] = useState(false);
  const [readings, setReadings] = useState(emptyReadings);
  const active = useRef(false);
  const generation = useRef(0);
  const sample = useRef(0);
  const frameRef = useRef<TamaguiElement>(null);
  const viewportRef = useRef<TamaguiElement>(null);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const tailRef = useRef<TamaguiElement>(null);
  const presentation = generation.current;
  const kind = measured ? 'measured' : 'scroll';

  function present(nextMode: FixtureMode, nextFill = false) {
    generation.current += 1;
    sample.current = 0;
    active.current = true;
    setMode(nextMode);
    setFill(nextFill);
    setReadings(emptyReadings());
    setOpen(true);
  }

  function close() {
    active.current = false;
    setOpen(false);
  }

  function record(patch: Partial<FixtureReadings>) {
    if (!active.current || generation.current !== presentation) {
      return;
    }
    setReadings((previous) => {
      const next = { ...previous, ...patch };
      return JSON.stringify(next) === JSON.stringify(previous) ? previous : next;
    });
  }

  function onLayout(key: 'frameLayout' | 'toolbarLayout' | 'viewportLayout' | 'scrollLayout') {
    return ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
      record({ [key]: bounds(layout.x, layout.y, layout.width, layout.height) });
    };
  }

  function measureBounds() {
    const currentSample = ++sample.current;
    record({
      sample: currentSample,
      frameWindow: 'unmeasured',
      viewportWindow: 'unmeasured',
      scrollWindow: 'unmeasured',
      tailWindow: 'unmeasured',
      sampleWindow: { ...window },
    });
    for (const [key, node] of [
      ['frameWindow', frameRef.current],
      ['viewportWindow', viewportRef.current],
      ['scrollWindow', scrollRef.current?.getNativeScrollRef?.()],
      ['tailWindow', tailRef.current],
    ] as const) {
      if (!node || typeof node.measureInWindow !== 'function') {
        record({ [key]: 'unavailable' });
        continue;
      }
      node.measureInWindow((x, y, width, height) => {
        if (sample.current === currentSample) {
          record({ [key]: bounds(x, y, width, height) });
        }
      });
    }
  }

  const viewport = readings.viewportLayout;
  const showRows = !measured || (typeof viewport === 'object' && viewport.height > 0);
  const height = (value: Reading<Bounds>) => (typeof value === 'object' ? value.height : value);
  const diagnostics = {
    kind,
    mode,
    fill,
    open,
    presentation,
    platform: Platform.OS,
    window,
    sheetFrameWindow: 'unavailable: SheetModal has no public frame ref',
    ...readings,
  };

  return (
    <FixtureStack gap="$3" padding="$3">
      <FixtureText>{measured ? 'Owned measured viewport' : 'Owned ScrollView'}</FixtureText>
      <Button
        onPress={() => {
          present('subject');
        }}>
        Open flex subject
      </Button>
      <Button
        onPress={() => {
          present('subject', true);
        }}>
        Open flex subject (fill)
      </Button>
      <Button
        onPress={() => {
          present('control-240');
        }}>
        Open 240pt control
      </Button>
      <FixtureText>
        Measure after the sheet settles. Close it to read the captured bounds below. Repeat after dragging, scrolling,
        rotating or using the keyboard. A declared size is not a measurement.
      </FixtureText>
      <FixtureText testID="owned-sheet-readings" selectable>
        {JSON.stringify(diagnostics, null, 2)}
      </FixtureText>
      <PublicSheetModal
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            close();
          }
        }}
        snapPoint={88}
        scrollable={false}
        fill={fill}
        header={
          <FixtureStack gap="$1" flexShrink={0}>
            <FixtureText numberOfLines={1}>
              {kind} / {mode} / fill {fill ? 'on' : 'off'}
            </FixtureText>
            <FixtureText numberOfLines={1}>
              Body {height(readings.frameLayout)} / toolbar {height(readings.toolbarLayout)} / viewport{' '}
              {height(viewport)}
            </FixtureText>
            <FixtureText numberOfLines={1}>
              Offset {typeof readings.offset === 'object' ? readings.offset.y : readings.offset} / tail presses{' '}
              {readings.tailPresses}
            </FixtureText>
            <XStack gap="$2">
              <Button flex={1} onPress={measureBounds}>
                Measure bounds
              </Button>
              <Button flex={1} onPress={close}>
                Close fixture
              </Button>
            </XStack>
          </FixtureStack>
        }>
        <FixtureStack
          key={presentation}
          ref={frameRef}
          testID="owned-sheet-frame"
          collapsable={false}
          minHeight={0}
          minWidth={0}
          {...(mode === 'control-240' ? { height: 240, flexGrow: 0, flexShrink: 0 } : { flex: 1 })}
          onLayout={onLayout('frameLayout')}>
          <FixtureStack
            testID="owned-sheet-toolbar"
            collapsable={false}
            flexShrink={0}
            onLayout={onLayout('toolbarLayout')}>
            <FixtureText>Records toolbar</FixtureText>
          </FixtureStack>
          <FixtureStack
            ref={viewportRef}
            testID="owned-sheet-viewport"
            collapsable={false}
            flex={1}
            minHeight={0}
            minWidth={0}
            onLayout={onLayout('viewportLayout')}>
            {showRows && (
              <ScrollView
                ref={scrollRef}
                testID="owned-sheet-scroll"
                flex={1}
                minHeight={0}
                keyboardShouldPersistTaps="handled"
                scrollEventThrottle={32}
                onLayout={onLayout('scrollLayout')}
                onContentSizeChange={(width, height) => {
                  record({
                    content:
                      [width, height].every(Number.isFinite) && width >= 0 && height >= 0
                        ? { width, height }
                        : 'invalid',
                  });
                }}
                onScroll={({ nativeEvent: { contentOffset } }) => {
                  record({
                    offset: [contentOffset.x, contentOffset.y].every(Number.isFinite)
                      ? { x: contentOffset.x, y: contentOffset.y }
                      : 'invalid',
                  });
                }}>
                <FixtureStack gap="$2">
                  <Input label="Keyboard probe" placeholder="Generic text only" />
                  {Array.from({ length: 60 }, (_, index) => (
                    <FixtureStack key={index} gap="$1" paddingVertical="$2">
                      <FixtureText>Record {index + 1}</FixtureText>
                      {Array.from({ length: 1 + (index % 4) }, (_, line) => (
                        <FixtureText key={line}>Generic detail {line + 1} for this record.</FixtureText>
                      ))}
                    </FixtureStack>
                  ))}
                  <FixtureStack ref={tailRef} testID="owned-sheet-tail" collapsable={false}>
                    <Button
                      onPress={() => {
                        record({ tailPresses: readings.tailPresses + 1 });
                      }}>
                      Activate Record 60
                    </Button>
                  </FixtureStack>
                </FixtureStack>
              </ScrollView>
            )}
          </FixtureStack>
        </FixtureStack>
      </PublicSheetModal>
    </FixtureStack>
  );
}

export const OwnedMeasuredViewport: Story = {
  name: 'Owned measured viewport',
  argTypes: { snapPoint: { control: false }, scrollable: { control: false } },
  render: () => <OwnedBodyFixture measured />,
};

export const OwnedScrollView: Story = {
  name: 'Owned ScrollView',
  argTypes: { snapPoint: { control: false }, scrollable: { control: false } },
  render: () => <OwnedBodyFixture measured={false} />,
};
