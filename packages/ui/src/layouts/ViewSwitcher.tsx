import {
  ensureFocusVisibleRing,
  ensureKeyboardModalityTracking,
  getGroupPosition,
  keyboardFocusRingProps,
  pressTargetHitSlop,
  stackRadiusProps,
  useAccentTintedSurface,
  useReadableTextOn,
  useResolvedKnobs,
  wasKeyboardFocus,
} from '@repo/theme';
import type React from 'react';
import { useState } from 'react';
import { Text, ToggleGroup, XStack, isWeb } from 'tamagui';

export interface ViewOption {
  /** Unique identifier for this view type */
  type: string;
  /** Display label (also the accessible name) */
  label: string;
  /** Icon component to render */
  icon?: React.ComponentType<{ size?: number }>;
  /** Paint the icon only; `label` remains the accessible name (Carbon icon modifier). */
  iconOnly?: boolean;
}

export interface ViewSwitcherProps {
  /** Available view options */
  views: ViewOption[];
  /** The currently active view type */
  currentView: string;
  /** Callback when a view type is selected */
  onViewChange: (view: string) => void;
  /** Host test id (default `view-switcher`). */
  testID?: string;
}

/**
 * Fused segmented control for switching view modes.
 *
 * Apple / Polaris / Carbon consensus, mapped onto house rules:
 * one R-OUTER frame, selected = fill (never a border on every segment),
 * keyboard ring on the focused item only. Activation stays MANUAL.
 */
export function ViewSwitcher({ views, currentView, onViewChange, testID = 'view-switcher' }: ViewSwitcherProps) {
  const { knobProps } = useResolvedKnobs();
  // Chromium drops keyboard modality on tamagui's group focus redirect, so
  // :focus-visible can miss the first item — paint the ring manually on
  // keyboard-origin focus (see theme keyboardFocusRing).
  const [kbFocusValue, setKbFocusValue] = useState<string | null>(null);
  // Roving anchor: while a segment is focused, IT owns the group's single
  // tab stop (so Shift+Tab exits instead of hopping to the selected
  // segment); when focus leaves, the anchor returns to the selection.
  const [focusValue, setFocusValue] = useState<string | null>(null);
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }
  // The selected segment carried a neutral `$color3`
  // -tier fill, so a segmented control marked its choice in the same grey it
  // marks hover with. Selection is the accent language; segmented-control
  // STRENGTH is pinned at tinted (not the solid an accent CTA takes), so the
  // chip resolves the accent-ramp analogue of that neutral surface tier and
  // its label/icon take the luminance-computed anchor for the actual tint.
  const selectedTint = useAccentTintedSurface();
  const onSelectedTint = useReadableTextOn(selectedTint);
  // Fill only — NO `color` here. `color` is a key of tamagui's Toggle styled
  // context, so supplying it on selection alone makes createComponent wrap the
  // segment in a context Provider; the <button> then sits at a different tree
  // depth in the two states and React DESTROYS and recreates it (measured: 4
  // childList mutations, 0 attribute mutations). CSS cannot transition a node
  // that did not exist in the previous frame, so the fill tween is unreachable until
  // the segment keeps its identity. The on-tint anchor the label and icon need
  // is applied on the row below, which is not a context host.
  const selectedChip = selectedTint ? { backgroundColor: selectedTint } : undefined;
  // Size recipe owns chrome (height/pad/font/icon/gap). Press floor is
  // hitSlop, never painted minHeight. Radius stays on the radius knob.
  // SP-PAD exemption (Chip precedent): this is a control-tier segmented
  // group — padding is the size-derived control padding, so the space knob
  // has no separate target here (fused R-OUTER segments also carry no gap;
  // ToggleGroup contract).
  const segmentHitSlop = pressTargetHitSlop(knobProps.control.height);
  // The role=group container is a focusable tab entry point that
  // redirects focus to a segment — paint the ring synchronously while focus
  // is WITHIN (CellWrapper focusWithin pattern) and on its own :focus.
  const groupRing = ensureFocusVisibleRing();
  const radius = knobProps.borderRadius.borderRadius;
  const count = views.length;
  // Tamagui Toggle paints a 1px border + −1px margin on every item (the
  // overlapping-border button-group trick). That IS "border on every
  // segment". Kill both; selection is fill, grouping is the frame.
  const restSegment = {
    borderWidth: 0,
    borderColor: 'transparent',
    margin: 0,
    backgroundColor: 'transparent',
  } as const;
  const hoverWash = { backgroundColor: '$backgroundHover' as const };
  const pressWash = { backgroundColor: '$backgroundPress' as const };

  return (
    <ToggleGroup
      type="single"
      orientation="horizontal"
      flexDirection="row"
      alignSelf="flex-start"
      gap={0}
      value={currentView}
      disableDeactivation
      onValueChange={(val) => {
        if (val) {
          onViewChange(val);
        }
      }}
      {...knobProps.borderRadius}
      {...knobProps.inputSurface}
      testID={testID}
      {...({
        'data-testid': testID,
        'data-size': knobProps.size,
        'data-density': knobProps.density,
      } as Record<string, string>)}
      // Recessed track (Apple) so unselected segments still read as inside
      // the control once per-item borders are gone. `$color2` is the surface
      // tier — a step off the page, not the hover grey that used to fake
      // selection.
      backgroundColor="$color2"
      // R-OUTER (container clip): the outer frame owns the
      // radius; clip so inner square seams stay square inside the rounded
      // frame. Segment keyboard rings are inset (outlineOffset −2),
      // so they survive the clip.
      overflow="hidden"
      focusStyle={groupRing}
      focusVisibleStyle={groupRing}
      focusWithinStyle={groupRing}
      // Carbon / Apple equal-width: inline style so Tamagui's flex class
      // cannot drop `gridAutoFlow` (a Tamagui `display="grid"` prop did).
      {...(isWeb
        ? {
            style: {
              display: 'grid',
              gridAutoFlow: 'column',
              gridAutoColumns: 'minmax(max-content, 1fr)',
            },
          }
        : undefined)}>
      {views.map((view, viewIndex) => {
        const Icon = view.icon;
        // Roving tabindex (single tab stop): tamagui's vendored
        // roving-focus item hardcodes tabIndex=0 on every segment, turning a
        // 3-view switcher into 3 tab stops. Exactly one segment stays in the
        // page tab order — the focused one while focus is inside the group,
        // else the active one (or the first when nothing matches); arrows
        // move within the group.
        const anchorIndex = (() => {
          const focusIdx = focusValue ? views.findIndex((v) => v.type === focusValue) : -1;
          if (focusIdx >= 0) {
            return focusIdx;
          }
          const activeIdx = views.findIndex((v) => v.type === currentView);
          return activeIdx >= 0 ? activeIdx : 0;
        })();
        const isTabStop = viewIndex === anchorIndex;
        const isSelected = view.type === currentView;
        const groupedRadius = stackRadiusProps(getGroupPosition(viewIndex, count), radius, 'horizontal');
        const fill = isSelected && selectedChip ? selectedChip : restSegment;
        return (
          // no size prop: ToggleGroup.Item's size makes square icon-buttons
          // (fixed width) that clip text labels -- let content + pad size the item.
          <ToggleGroup.Item
            key={view.type}
            value={view.type}
            {...(isWeb ? { tabIndex: isTabStop ? 0 : -1 } : undefined)}
            paddingHorizontal={knobProps.control.paddingHorizontal}
            width="auto"
            height={knobProps.control.height}
            hitSlop={segmentHitSlop}
            flexGrow={1}
            flexShrink={0}
            alignItems="center"
            justifyContent="center"
            cursor="pointer"
            userSelect="none"
            aria-label={view.label}
            // Selecting a segment is a discrete jump, so the fill
            // tweens instead of snapping (undefined at animation=none).
            transition={knobProps.transition}
            {...restSegment}
            {...groupedRadius}
            {...fill}
            // The selected fill is re-applied through hover/press/focus so the
            // neutral state layer never paints over the accent chip (the
            // rule the checked Switch track already follows). `focus` is
            // not optional: selecting a segment focuses it, and ToggleFrame's
            // own active recipe carries a neutral `$backgroundActive` focus
            // fill that would otherwise grey out the chip the moment it is
            // chosen.
            hoverStyle={{
              ...restSegment,
              ...groupedRadius,
              ...(isSelected && selectedChip ? selectedChip : hoverWash),
            }}
            pressStyle={{
              ...restSegment,
              ...groupedRadius,
              ...(isSelected && selectedChip ? selectedChip : pressWash),
            }}
            // Rest outline is off; the keyboard ring is merged into the
            // focused state so ToggleFrame's focusStyle cannot zero it.
            outlineWidth={0}
            focusStyle={{
              ...restSegment,
              ...groupedRadius,
              ...(isSelected && selectedChip ? selectedChip : {}),
              ...(kbFocusValue === view.type ? keyboardFocusRingProps : { outlineWidth: 0 }),
            }}
            focusVisibleStyle={kbFocusValue === view.type ? keyboardFocusRingProps : { outlineWidth: 0 }}
            {...(isWeb
              ? {
                  onFocus: () => {
                    setFocusValue(view.type);
                    if (wasKeyboardFocus()) {
                      setKbFocusValue(view.type);
                    }
                  },
                  onBlur: () => {
                    setFocusValue((prev) => (prev === view.type ? null : prev));
                    setKbFocusValue((prev) => (prev === view.type ? null : prev));
                  },
                }
              : undefined)}
            {...(kbFocusValue === view.type ? keyboardFocusRingProps : undefined)}>
            <XStack
              alignItems="center"
              gap={knobProps.control.gap}
              flexShrink={0}
              // Icons paint `currentColor`, so the row carries the resolved
              // on-tint anchor for the glyph and the label takes it explicitly
              // (tamagui Text resolves `$color` from the theme, not by CSS
              // inheritance).
              {...(isSelected && onSelectedTint ? { color: onSelectedTint } : undefined)}>
              {Icon && <Icon size={knobProps.controlIcon.width} />}
              {!view.iconOnly && view.label ? (
                <Text
                  {...knobProps.controlType}
                  numberOfLines={1}
                  {...knobProps.body}
                  {...(isSelected && onSelectedTint ? { color: onSelectedTint } : undefined)}>
                  {view.label}
                </Text>
              ) : null}
            </XStack>
          </ToggleGroup.Item>
        );
      })}
    </ToggleGroup>
  );
}
