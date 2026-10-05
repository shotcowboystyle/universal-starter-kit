import { action } from '@repo/storybook';
import { formatAbsoluteDate, resolveChartPalette } from '@repo/theme';
import type { Meta } from '@storybook/react-native-web-vite';
import { useEffect, useState } from 'react';
import { Text, YStack } from 'tamagui';

import { GanttView, type GanttItemMoveRange, type GanttSpanRef, type GanttTask } from './Gantt';
import { addDays, startOfDay } from './ganttMath';

// Fixture colors from the sanctioned categorical palette —
// no raw brand hexes in story data. Intents demonstrate the theme-ramp path.
const [, blue] = resolveChartPalette({ scheme: 'light' }).categorical;

/** Day offset from today so the today line always lands inside the chart. */
const day = (offset: number) => addDays(startOfDay(new Date()), offset);

const tasks: GanttTask[] = [
  { id: '1', title: 'Discovery & scoping', start: day(-9), end: day(-5), progress: 100 },
  {
    id: '2',
    title: 'Design review',
    start: day(-4),
    end: day(-1),
    intent: 'warning',
    progress: 100,
  },
  { id: '3', title: 'Implementation', start: day(-2), end: day(6), intent: 'accent', progress: 55 },
  { id: '4', title: 'QA pass', start: day(4), end: day(9), color: blue, progress: 20 },
  { id: '5', title: 'Docs & handoff', start: day(7), end: day(11), intent: 'success', progress: 0 },
  { id: '6', title: 'Launch', start: day(12), end: day(12), intent: 'error' },
];

const meta: Meta = {
  title: 'Components/Gantt',
  parameters: {
    status: { type: 'beta' },
  },
};

export default meta;

export const Default = {
  name: 'Main',
  render: () => <GanttView tasks={tasks} zoom="week" onItemPress={action('onItemPress')} height={420} />,
  parameters: {
    docs: {
      description: {
        story:
          'One row per task with duration bars positioned from start/end dates (midnight ends are inclusive whole days), a today line, and a week-level axis. Bars take semantic intents via the theme ramps; explicit colors pass through untouched (Axiom 11). The switcher flips day/week/month zoom.',
      },
    },
  },
};

export const DayZoom = {
  render: () => <GanttView tasks={tasks} zoom="day" onItemPress={action('onItemPress')} height={420} />,
  parameters: {
    docs: {
      description: {
        story: 'Day zoom: a labeled major tick per day at the widest px-per-day scale.',
      },
    },
  },
};

export const MonthZoom = {
  render: () => <GanttView tasks={tasks} zoom="month" onItemPress={action('onItemPress')} height={420} />,
  parameters: {
    docs: {
      description: {
        story:
          'Month zoom: month-labeled major ticks with week starts as the minor grid — the whole project fits one viewport.',
      },
    },
  },
};

function BarDragDemo() {
  const [dragTasks, setDragTasks] = useState<GanttTask[]>(tasks);
  const [lastMove, setLastMove] = useState<string | null>(null);
  return (
    <YStack gap="$2">
      <Text {...{ 'data-testid': 'last-move' }} fontSize="$2">
        {lastMove ??
          'Drag a bar (or its edges) to reschedule it; focused bars step with ArrowLeft/ArrowRight (Shift = 7 days)'}
      </Text>
      <GanttView
        tasks={dragTasks}
        zoom="week"
        onItemPress={action('onItemPress')}
        onItemMove={(task: GanttTask, range: GanttItemMoveRange) => {
          action('onItemMove')(task.id, range.start.toISOString(), range.end.toISOString());
          setLastMove(`Moved "${task.title}" to ${formatAbsoluteDate(range.start)} – ${formatAbsoluteDate(range.end)}`);
          setDragTasks((prev) =>
            prev.map((t) => (t.id === task.id ? { ...t, start: range.start, end: range.end } : t)),
          );
        }}
        height={420}
      />
    </YStack>
  );
}

export const BarDrag = {
  name: 'Bar Drag',
  render: () => <BarDragDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Reschedule bars three ways, all firing the same onItemMove contract: drag the whole bar (duration preserved), drag an edge handle to resize start/end independently (web pointer), or focus a bar and press ArrowLeft/ArrowRight (Shift+Arrow = 7 days — an aria-live region announces the new range). Pointer sessions track 1:1 (A-GESTURE) with a snapped drop preview and live date label; release commits with a jump tween (LC-25) and Escape cancels. A plain click still fires onItemPress. Native uses a best-effort responder drag (scroll locks while dragging; native resize deferred).',
      },
    },
  },
};

function RTLDemo() {
  const [rtlTasks, setRtlTasks] = useState<GanttTask[]>(tasks);
  // Scope the direction flip to this story's mount (the canvas iframe
  // document), restoring whatever was set before.
  useEffect(() => {
    const previous = document.documentElement.getAttribute('dir');
    document.documentElement.setAttribute('dir', 'rtl');
    return () => {
      if (previous === null) {
        document.documentElement.removeAttribute('dir');
      } else {
        document.documentElement.setAttribute('dir', previous);
      }
    };
  }, []);
  return (
    <GanttView
      tasks={rtlTasks}
      zoom="week"
      onItemPress={action('onItemPress')}
      onItemMove={(task: GanttTask, range: GanttItemMoveRange) => {
        action('onItemMove')(task.id, range.start.toISOString(), range.end.toISOString());
        setRtlTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, start: range.start, end: range.end } : t)));
      }}
      height={420}
    />
  );
}

export const RTL = {
  name: 'RTL',
  render: () => <RTLDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Under RTL the timeline mirrors (useDirection): time flows right→left, the label column and axis reflect, and drag/keyboard deltas invert so moving a bar toward the past always matches the visual direction.',
      },
    },
  },
};

/** Enough rows to overflow the frame — exercises the pinned axis header. */
const manyTasks: GanttTask[] = Array.from({ length: 16 }, (_, i) => ({
  id: `m${i + 1}`,
  title: `Task ${i + 1}`,
  start: day(i - 8),
  end: day(i - 8 + 2 + (i % 4)),
  intent: (['accent', 'success', 'warning', 'error'] as const)[i % 4],
  progress: (i * 17) % 100,
}));

export const StickyHeader = {
  name: 'Sticky Header',
  render: () => <GanttView tasks={manyTasks} zoom="week" onItemMove={action('onItemMove')} height={320} />,
  parameters: {
    docs: {
      description: {
        story:
          'With more rows than fit the frame, the time axis stays pinned while rows scroll vertically, and the label column stays pinned while the canvas scrolls horizontally — labels and rows share one vertical scroller so they can never drift apart.',
      },
    },
  },
};

/**
 * The track shape: open-ended spans, an era row carrying three of them, and a
 * marker the story owns and the axis handle scrubs.
 */
function TrackViewDemo() {
  const [asOf, setAsOf] = useState<Date>(day(0));
  const [tracks, setTracks] = useState<GanttTask[]>([
    {
      id: 'true-up',
      title: 'Federal true-up',
      spans: [
        { id: '2026', start: day(-44), end: day(-25), intent: 'success' },
        { id: '2027', start: day(-22), end: day(-3), intent: 'success' },
        { id: '2028', start: day(0), end: day(19), intent: 'success' },
      ],
    },
    { id: 'vat', title: 'VAT registration', start: day(-12), intent: 'accent' },
    { id: 'grandfathered', title: 'Grandfathered rate', end: day(-6), intent: 'warning' },
    { id: 'base', title: 'Base policy' },
    { id: 'audit', title: 'Audit window', start: day(-3), end: day(9), color: blue, progress: 40 },
  ]);
  return (
    <YStack gap="$2">
      <Text {...{ 'data-testid': 'as-of' }} fontSize="$2">
        {`As of ${formatAbsoluteDate(asOf)} — drag the handle on the time axis to scrub it`}
      </Text>
      <GanttView
        tasks={tracks}
        zoom="week"
        markerDate={asOf}
        onMarkerDateChange={setAsOf}
        onItemPress={action('onItemPress')}
        onItemMove={(task: GanttTask, range: GanttItemMoveRange, span?: GanttSpanRef) => {
          action('onItemMove')(task.id, span?.key, range.start.toISOString());
          setTracks((prev) =>
            prev.map((t) => {
              if (t.id !== task.id) {
                return t;
              }
              if (!t.spans) {
                return { ...t, start: range.start, end: range.end };
              }
              return {
                ...t,
                spans: t.spans.map((s, i) => (i === span?.index ? { ...s, start: range.start, end: range.end } : s)),
              };
            }),
          );
        }}
        height={420}
      />
    </YStack>
  );
}

export const TrackView = {
  name: 'Track View',
  render: () => <TrackViewDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'The same view drawing effective windows rather than a schedule. "Federal true-up" is ONE row carrying three era spans, because one emitter shipping a variant per period is one thing, not three. "VAT registration" has a start and no end and "Grandfathered rate" an end and no start, so each runs off exactly the edge it is open at, uncapped, with a chevron. "Base policy" has no dates at all and draws as a thin half-height rail: painting it edge to edge as a bar would put two dates on screen nobody chose. The marker is a controlled prop — drag its handle on the axis (or focus it and press ArrowLeft/ArrowRight, Shift = 7 days) and the story owns the date. Bounded spans still drag, resize and step by keyboard; open ones get no session, because there is no second edge to hold a duration against.',
      },
    },
  },
};

export const Empty = {
  render: () => <GanttView tasks={[]} height={420} />,
  parameters: {
    docs: {
      description: {
        story: 'Zero tasks renders an honest empty state (Axiom 6) — never a bare axis pretending to be data.',
      },
    },
  },
};

export const States = {
  render: () => (
    <YStack gap="$4">
      <GanttView tasks={[]} isLoading height={300} />
      <GanttView tasks={[]} error="Tasks failed to load" onRetry={action('onRetry')} height={300} />
    </YStack>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Loading uses a skeleton that mirrors the real row/bar anatomy (LC-20, deterministic offsets); error wins over empty and offers Retry (DG-ST-01).',
      },
    },
  },
};
