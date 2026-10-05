# @repo/ui

Cross-platform catalog UI for this monorepo's web and mobile apps — surfaces,
feedback, navigation, media, and layout components built on
[Tamagui](https://tamagui.dev), themed through the knobs system.

## Usage in this monorepo

Private workspace package. Add `"@repo/ui": "workspace:*"` to the consuming
package's `dependencies`.

Requires `react` (and `react-native` / `react-dom` for the target platform) as peers.

## What it owns

- **Surfaces** — `Card`, `CardHeader`, `CardFooter`, `Panel`, `DialogContent`,
  `PopoverContent`, `SheetFrame` (knob-aware, shadowing the raw Tamagui primitives)
- **Feedback** — `Alert`, `Toast` / `useToast`, `Skeleton`, `ProgressSteps`, `DotIndicator`
- **Navigation & disclosure** — `Tabs`, `Accordion`, `DropdownMenu`, `Pagination`, `SkipLink`
- **Display** — `Avatar`, `Badge`, `Chip`, `Quote`, `Tooltip`, `Carousel`, `Video`,
  `Image`, code blocks, icons, layouts, `ErrorBoundary`
- **Charts** — `BarChart`, `LineChart`, `AreaChart`, `PieChart`, `Sparkline`:
  one universal codebase (headless d3 math + SVG) on web, iOS, and Android;
  series colors come from the canonical `useChartPalette()` in
  `@repo/theme`, explicit data colors pass through untouched.
  `react-native-svg` is an optional peer, needed only on native
- A full re-export of `tamagui` (`YStack`, `XStack`, `Text`, …), so this package is
  the **only** UI import apps and features need

## What it must not do

- No Frappe or API assumptions — data-aware wrappers are out of scope here
- No form fields — fields, `Form`, and input parts live in `@repo/forms`
- No data tables — data tables are out of scope for this package

Per house rules, apps and features import this package instead of raw `tamagui`.

## Usage

```tsx
import { Avatar, Card, CardHeader, Chip, Text, YStack } from '@repo/ui';

export function UserCard() {
  return (
    <Card>
      <CardHeader>
        <Avatar name="Ada Lovelace" src="https://example.com/ada.png" />
      </CardHeader>
      <YStack>
        <Text>Ada Lovelace</Text>
        <Chip>Admin</Chip>
      </YStack>
    </Card>
  );
}
```

## TreeView scroll retention

Keep scroll memory outside the mounted tree, alongside expansion. Pass the measured
height of the available viewport to `height`; TreeView owns its virtual scrolling.

```tsx
import { TreeView, type TreeNode } from '@repo/ui';
import { Button } from '@repo/forms';
import { useState } from 'react';

export function Library({ nodes, height }: { nodes: TreeNode[]; height: number }) {
  const [showTree, setShowTree] = useState(true);
  const [offset, setOffset] = useState<number>();
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  return (
    <>
      <Button onPress={() => setShowTree((shown) => !shown)}>Toggle tree</Button>
      {showTree && (
        <TreeView
          nodes={nodes}
          height={height}
          expandedIds={expandedIds}
          onExpandedIdsChange={setExpandedIds}
          initialScrollOffset={offset}
          onScrollOffsetChange={setOffset}
        />
      )}
    </>
  );
}
```

`initialScrollOffset?: number` is a mount-time seed, including when omitted.
Changing it after mount never requests another scroll. Values use vertical CSS
pixels on web and layout units on native; fractions are preserved. Negative and
non-finite seeds become zero. Restoration waits for nonempty data, loaded content
and a usable visible viewport, then clamps to the actual list extent. An unchanged
pending target with identical bounds isn't replayed on each layout notification.

`onScrollOffsetChange?: (offset: number) => void` reports observed offsets,
clamped to the current scroll range and deduplicated. It covers manual scrolling,
keyboard navigation, drag auto-scroll and explicit reveal. A scroll command alone
isn't confirmation. Subpixel requests reach the list unchanged; observed device
rounding is reported as observed. No provisional mount-time zero overwrites saved memory while
restoration is waiting. Callback identity changes alone don't emit.

A new explicit `revealRequest` or user scroll/navigation cancels pending initial
restoration. The seed never returns after reveal cancellation or later dataset
changes. Acknowledge completed reveals in the persistent controller and only pass
still-pending requests on remount. Restoration doesn't select, focus, expand, or
call `onRevealComplete`.

Restore data and expansion together before the first usable nonempty layout. If
saved state itself arrives asynchronously, wait to mount the tree until it's
known. Retention stores a pixel offset, not an item anchor across dataset edits.
After restoration, replacing data with an empty list doesn't rearm the seed;
retain previous rows during refresh or deliberately remount with saved state.

The **Retained scroll across unmount and delayed layout** story uses 500 variable
height rows. Manually scroll, unmount/mount, then test delayed data and hidden
layout. Remount with reveal to check that reveal wins. Change viewport height to
check clamping. The story shows observed offsets separately from measured reveal
completion. Native sheet sizing is a separate host responsibility.

## SheetModal body sizing

`SheetModal` sizes its body to the content by default. A consumer-owned
viewport — a virtualized list, a measured workspace — cannot bootstrap from
that: on native it is delivered height 0, reports zero, and mounts nothing,
while a sibling with a declared height gets the space it asked for.

`fill?: boolean` (default `false`) opts that body into the sheet's height
instead. On native it turns the existing keyboard-aware cap into a definite
frame height and opens every link down to the body, so the remaining height
reaches the consumer. On web it opens the same chain inside the percent-height
snapped frame. The grabber, the header and the bottom safe-area spacer stay
outside the flexible body.

```tsx
<SheetModal open={open} onOpenChange={setOpen} fill snapPoint={88} header={<Title />}>
  <YStack flex={1} minHeight={0}>
    <Toolbar />
    <MyVirtualList />
  </YStack>
</SheetModal>
```

`fill` allocates height; it does not add a scroll owner. With `scrollable`
false the children keep sole ownership of scrolling and virtualization; with
`scrollable` true the sheet's own scroller fills the slot instead, and there
is still exactly one. Leaving `fill` off, or passing `false`, renders the
unchanged intrinsic body.

The contract is proven at the fully expanded rest, where the panel is not
translated. Smaller detents translate the whole panel down, so an allocated
body can extend below the visible window there; check the settled rest before
relying on `fill` with a shorter `snapPoint`.

## Styling

Components resolve structural styling (radius, spacing, elevation, typography)
through the **knobs system** in `@repo/theme` — wrap screens in a
`<Preset>` and flip knobs instead of hardcoding style props.

## License

Apache-2.0

Derived from [multiplatform.one](https://multiplatform.one) (Apache-2.0). See the package LICENSE and the repository NOTICE.
