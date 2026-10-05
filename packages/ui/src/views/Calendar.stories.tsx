import { action } from '@repo/storybook';
import { formatAbsoluteDateTime, resolveChartPalette } from '@repo/theme';
import type { Meta } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';

import { Calendar, type CalendarEvent, type CalendarEventDraft, type CalendarEventMoveRange } from './Calendar';

// Fixture colors from the sanctioned categorical palette (chart-palette
// precedent) — no raw brand hexes in story data.
const [identity, blue, orange, green] = resolveChartPalette({
  scheme: 'light',
}).categorical;

const events: CalendarEvent[] = [
  {
    id: '1',
    title: 'Team Standup',
    start: new Date(2026, 2, 10, 9, 0),
    end: new Date(2026, 2, 10, 9, 30),
    color: blue,
  },
  {
    id: '2',
    title: 'Sprint Planning',
    start: new Date(2026, 2, 10, 14, 0),
    end: new Date(2026, 2, 10, 15, 0),
    color: green,
  },
  {
    id: '3',
    title: 'Code Review',
    start: new Date(2026, 2, 12, 11, 0),
    end: new Date(2026, 2, 12, 12, 0),
    color: orange,
  },
];

const meta: Meta = {
  title: 'Components/Calendar',
  parameters: {
    status: { type: 'stable' },
  },
};

export default meta;

export const Default = {
  name: 'Main',
  render: () => (
    <Calendar
      events={events}
      initialDate={new Date(2026, 2, 10)}
      onEventClick={(event) => {
        console.log('Clicked:', event.id);
      }}
      height={500}
    />
  ),
};

function EventDragDemo() {
  const [dragEvents, setDragEvents] = useState<CalendarEvent[]>(events);
  const [lastMove, setLastMove] = useState<string | null>(null);
  return (
    <YStack gap="$2">
      <Text {...{ 'data-testid': 'last-move' }} fontSize="$2">
        {lastMove ?? 'Drag an event chip onto another day'}
      </Text>
      <Calendar
        events={dragEvents}
        initialDate={new Date(2026, 2, 10)}
        onEventClick={action('onEventClick')}
        onEventMove={(event: CalendarEvent, range: CalendarEventMoveRange) => {
          action('onEventMove')(event.id, range.start.toISOString(), range.end.toISOString());
          setLastMove(
            `Moved "${event.title}" to ${formatAbsoluteDateTime(range.start)} - ${formatAbsoluteDateTime(range.end)}`,
          );
          setDragEvents((prev) =>
            prev.map((e) => (e.id === event.id ? { ...e, start: range.start, end: range.end } : e)),
          );
        }}
        height={500}
      />
    </YStack>
  );
}

export const EventDrag = {
  name: 'Event Drag',
  render: () => <EventDragDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Drag an event chip onto another day cell to reschedule it. onEventMove receives the event plus a new start/end range that preserves duration. Web: pointer + DOM hit-testing (Escape cancels). Native: responder drag + measureInWindow hit-testing (best-effort; scroll locks while dragging). A plain click/tap still fires onEventClick.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Time grid: move + resize + drag-to-create on the week view
// ---------------------------------------------------------------------------

const timeGridSeed: CalendarEvent[] = [
  {
    id: 'tg-1',
    title: 'Team Standup',
    start: new Date(2026, 2, 10, 9, 0),
    end: new Date(2026, 2, 10, 9, 30),
    color: blue,
  },
  {
    id: 'tg-2',
    title: 'Sprint Planning',
    start: new Date(2026, 2, 10, 10, 0),
    end: new Date(2026, 2, 10, 11, 30),
    color: green,
  },
  {
    id: 'tg-3',
    title: 'Design Sync',
    start: new Date(2026, 2, 10, 10, 30),
    end: new Date(2026, 2, 10, 11, 0),
    color: orange,
  },
  {
    id: 'tg-4',
    title: 'Code Review',
    start: new Date(2026, 2, 12, 14, 0),
    end: new Date(2026, 2, 12, 15, 0),
    color: identity,
  },
  {
    id: 'tg-5',
    title: 'Release day',
    start: new Date(2026, 2, 11, 0, 0),
    allDay: true,
  },
];

function TimeGridDemo() {
  const [gridEvents, setGridEvents] = useState<CalendarEvent[]>(timeGridSeed);
  const [lastAction, setLastAction] = useState<string | null>(null);

  const applyRange = (id: string, range: CalendarEventMoveRange) => {
    setGridEvents((prev) => prev.map((e) => (e.id === id ? { ...e, start: range.start, end: range.end } : e)));
  };

  return (
    <YStack gap="$2">
      <Text {...{ 'data-testid': 'last-action' }} fontSize="$2">
        {lastAction ?? 'Drag to move, grab an edge to resize, press-drag empty grid to create'}
      </Text>
      <Calendar
        events={gridEvents}
        viewType="week"
        initialDate={new Date(2026, 2, 10)}
        onEventClick={action('onEventClick')}
        onDateSelect={action('onDateSelect')}
        onEventMove={(event, range) => {
          action('onEventMove')(event.id, range.start.toISOString(), range.end.toISOString());
          setLastAction(`move:${event.id}:${range.start.toISOString()}:${range.end.toISOString()}`);
          applyRange(event.id, range);
        }}
        onEventResize={(event, range) => {
          action('onEventResize')(event.id, range.start.toISOString(), range.end.toISOString());
          setLastAction(`resize:${event.id}:${range.start.toISOString()}:${range.end.toISOString()}`);
          applyRange(event.id, range);
        }}
        onEventCreate={(draft: CalendarEventDraft) => {
          action('onEventCreate')(draft.title, draft.start.toISOString(), draft.end.toISOString());
          setLastAction(`create:${draft.title}:${draft.start.toISOString()}:${draft.end.toISOString()}`);
          setGridEvents((prev) => [
            ...prev,
            {
              id: `created-${prev.length}`,
              title: draft.title,
              start: draft.start,
              end: draft.end,
            },
          ]);
        }}
        height={560}
      />
    </YStack>
  );
}

export const TimeGrid = {
  name: 'Time Grid',
  render: () => <TimeGridDemo />,
  parameters: {
    docs: {
      description: {
        story:
          "Week view as a real time grid: overlapping events split columns, the now line marks the current time in today's column, blocks drag with 1:1 pointer tracking + FLIP settle on drop, top/bottom edges resize with grid snapping and a live duration label, and press-drag on empty grid sketches a new event whose FloatingPanel editor commits live on outside click / Escape (no Apply button).",
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Month overflow: honest "+N more" opens a day popover (Axiom 6)
// ---------------------------------------------------------------------------

const overflowDay = new Date(2026, 2, 10);
const overflowEvents: CalendarEvent[] = Array.from({ length: 8 }, (_, i) => ({
  id: `of-${i + 1}`,
  title: `Meeting ${i + 1}`,
  start: new Date(2026, 2, 10, 8 + i, 0),
  end: new Date(2026, 2, 10, 8 + i, 30),
}));

export const Overflow = {
  name: 'Overflow',
  render: () => (
    <Calendar
      events={overflowEvents}
      viewType="month"
      initialDate={overflowDay}
      onEventClick={action('onEventClick')}
      onDateSelect={action('onDateSelect')}
      height={560}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A month cell only shows the first three events; the rest surface as an honest "+N more" (never silently hidden). Pressing it opens a day popover listing every event for that day.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Keyboard: arrows move day/slot focus, Enter selects/creates
// ---------------------------------------------------------------------------

function KeyboardDemo() {
  const [lastSelect, setLastSelect] = useState<string | null>(null);
  return (
    <YStack gap="$2">
      <Text {...{ 'data-testid': 'last-select' }} fontSize="$2">
        {lastSelect ?? 'Focus the grid, then use arrow keys + Enter'}
      </Text>
      <Calendar
        events={events}
        viewType="month"
        initialDate={new Date(2026, 2, 10)}
        onDateSelect={(date) => {
          action('onDateSelect')(date.toISOString());
          setLastSelect(`select:${date.toISOString()}`);
        }}
        onEventClick={action('onEventClick')}
        height={560}
      />
    </YStack>
  );
}

export const Keyboard = {
  name: 'Keyboard',
  render: () => <KeyboardDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Tab to the grid, arrows move the focused day (crossing a month edge navigates the period with a directional slide), Enter selects the focused day. The LC-71 keyboard ring paints on the focused day-number disc only — never the cell, never unfocused days. Event chips are focusable buttons with full accessible names; an aria-live region announces period changes.',
      },
    },
  },
};

export const Empty = {
  render: () => <Calendar events={[]} initialDate={new Date(2026, 2, 10)} height={500} />,
  parameters: {
    docs: {
      description: {
        story:
          'Zero events: the month grid renders normally with no event chips — an eventless calendar is its own honest empty state (Axiom 6). Calendar has no isLoading/error props; those states cannot be rendered (component-capability gap, see p-results/state-triplet-coverage.md).',
      },
    },
  },
};
