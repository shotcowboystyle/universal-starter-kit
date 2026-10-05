import {
  ensureFocusVisibleRing,
  ensureKeyboardModalityTracking,
  getGroupPosition,
  hairline,
  hairlineWidth,
  stackRadiusProps,
  useReadableTextOn,
  useResolvedKnobs,
  wasKeyboardFocus,
  transitionProps,
} from '@repo/theme';
import type React from 'react';
import { Fragment, useId, useState } from 'react';
import { Label, Separator, Text, XStack, YStack, isWeb } from 'tamagui';

import { componentColors } from '../componentColors';
import { ScrollView } from '../ScrollView';

export interface SidebarSection {
  /**
   * Section caption. Omit to render the group without a label — e.g. when a
   * sidebar has a single group, the caption is noise (Axiom 16).
   */
  title?: string;
  items: SidebarItem[];
}

export interface SidebarItem {
  label: string;
  value: unknown;
  count?: number;
  active?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
  /** Secondary text displayed below the label */
  subTitle?: string;
}

export interface SidebarProps {
  sections: SidebarSection[];
  width?: number;
  /** Accessible name for the navigation landmark. */
  'aria-label'?: string;
}

export function Sidebar({ sections, width = 250, 'aria-label': ariaLabel = 'Sidebar' }: SidebarProps) {
  const { knobProps } = useResolvedKnobs();
  const headingId = useId();
  // UX-P02 / Axiom 15: the active row paints `$accentBackground`, so its label
  // and count must sit on the accent fill with a luminance-computed foreground
  // (paper/ink whichever reads) — the scheme `$color` ink measured 2.59:1 on
  // the accent. Resolved once (all active rows share the fill).
  const onAccent = useReadableTextOn('$accentBackground');
  // SP-EDGE: rows own the horizontal inset (space knob via the panelPadding
  // token); the container contributes none, so row highlights and separators
  // run edge-to-edge across the panel.
  const rowPad = knobProps.panelPadding.padding;
  // Tamagui maps `focusVisibleStyle` onto mouse :focus; track keyboard
  // modality and paint the inset ring ourselves (ToggleGroup precedent).
  const [kbFocusKey, setKbFocusKey] = useState<string | null>(null);
  if (typeof document !== 'undefined') {
    ensureKeyboardModalityTracking();
  }

  return (
    <YStack
      role="navigation"
      aria-label={ariaLabel}
      width={width}
      flex={1}
      alignSelf="stretch"
      height="100%"
      minHeight={0}
      // SF-CARD fill without a four-side control border (R-NONE). The end
      // hairline is the panel divider (Axiom 15), stretched to the rail height.
      {...knobProps.surface}
      borderWidth={0}
      borderColor="$borderColor"
      {...(isWeb
        ? {
            borderInlineEndWidth: hairlineWidth,
            borderInlineEndStyle: 'solid' as any,
            className: 'mp-hairline-ie',
          }
        : { borderEndWidth: hairlineWidth })}>
      <ScrollView flex={1}>
        <YStack {...knobProps.panelPadding} paddingHorizontal={0} {...knobProps.gapLg}>
          {sections.map((section, sectionIdx) => {
            const titleId = section.title ? `${headingId}-${sectionIdx}` : undefined;
            return (
              <YStack
                key={section.title ?? sectionIdx}
                role="group"
                aria-labelledby={titleId}
                {...knobProps.gap}
                width="100%">
                {section.title ? (
                  // Align with row text: the inset rides on this slot's
                  // padding so the caption's box starts at the shared row text
                  // edge — padding on the Label itself left the box at the panel
                  // edge, which is the exact anti-pattern the rule's origin fixed.
                  <YStack paddingHorizontal={rowPad}>
                    <Label
                      id={titleId}
                      size={knobProps.sizeToken}
                      fontSize="$2"
                      fontWeight="400"
                      textTransform="uppercase"
                      color={knobProps.textAccentColor}
                      // Drop the size-derived control height — a section
                      // caption should not consume a 44px row.
                      paddingHorizontal={0}
                      height="auto"
                      lineHeight="$1">
                      {section.title}
                    </Label>
                  </YStack>
                ) : null}

                <YStack width="100%">
                  {section.items.map((item, itemIdx) => {
                    const position = getGroupPosition(itemIdx, section.items.length);
                    const corners = stackRadiusProps(position, knobProps.borderRadius.borderRadius);
                    const itemKey = `${sectionIdx}:${String(item.value ?? item.label)}`;
                    const ink = item.active && onAccent ? onAccent : componentColors.text.primary;
                    const metaInk = item.active && onAccent ? onAccent : knobProps.textAccentColor;
                    const kbFocused = kbFocusKey === itemKey;
                    const pressable = Boolean(item.onPress);
                    const kbRing = kbFocused
                      ? ensureFocusVisibleRing({
                          outlineOffset: -2,
                          outlineColor: item.active && onAccent ? onAccent : '$outlineColor',
                        })
                      : null;
                    return (
                      <Fragment key={itemKey}>
                        {itemIdx > 0 ? <Separator width="100%" alignSelf="stretch" {...hairline.line} /> : null}
                        <XStack
                          data-group-position={position}
                          data-sidebar-row="true"
                          data-active={item.active ? true : undefined}
                          aria-current={item.active ? 'page' : undefined}
                          alignItems="center"
                          width="100%"
                          alignSelf="stretch"
                          minHeight={knobProps.sizeToken as any}
                          paddingHorizontal={rowPad}
                          overflow="hidden"
                          {...knobProps.gap}
                          {...corners}
                          backgroundColor={item.active ? '$accentBackground' : 'transparent'}
                          hoverStyle={{
                            backgroundColor: item.active ? '$accentBackground' : componentColors.surface.background,
                            ...corners,
                          }}
                          pressStyle={{
                            backgroundColor: item.active ? '$accentBackground' : componentColors.interactive.background,
                            ...corners,
                          }}
                          cursor={pressable ? 'pointer' : 'default'}
                          userSelect="none"
                          onPress={item.onPress}
                          {...transitionProps(knobProps.transition)}
                          {...(pressable
                            ? {
                                role: 'button' as const,
                                tabIndex: 0,
                                outlineWidth: 0,
                                focusStyle: { outlineWidth: 0 },
                                // Rest and mouse-focus paint no ring.
                                // Keyboard-origin ring also rides focusVisibleStyle
                                // so Tamagui cannot zero outlineWidth on :focus-visible.
                                focusVisibleStyle: kbRing ?? { outlineWidth: 0 },
                                ...(kbRing ?? { outlineWidth: 0 }),
                                onFocus: () => {
                                  if (wasKeyboardFocus()) {
                                    setKbFocusKey(itemKey);
                                  }
                                },
                                onBlur: () => {
                                  setKbFocusKey((prev) => (prev === itemKey ? null : prev));
                                },
                                onKeyDown: ((e: React.KeyboardEvent) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    item.onPress?.();
                                  }
                                }) as unknown as () => void,
                              }
                            : undefined)}>
                          {item.icon ? (
                            // `color` sets the icon's inherited color; Tamagui
                            // forwards it at runtime but the RN-flavored View
                            // prop type omits it (house Record cast).
                            <YStack flexShrink={0} {...({ color: metaInk } as Record<string, unknown>)}>
                              {item.icon}
                            </YStack>
                          ) : null}
                          <YStack flex={1} minWidth={0} justifyContent="center">
                            <Text
                              {...knobProps.body}
                              color={ink}
                              fontWeight={item.active ? '600' : '400'}
                              numberOfLines={1}>
                              {item.label}
                            </Text>
                            {item.subTitle ? (
                              <Text {...knobProps.body} color={metaInk} fontSize="$2" numberOfLines={1}>
                                {item.subTitle}
                              </Text>
                            ) : null}
                          </YStack>
                          {item.count !== undefined ? (
                            <Text color={metaInk} fontSize="$2" flexShrink={0}>
                              ({item.count})
                            </Text>
                          ) : null}
                        </XStack>
                      </Fragment>
                    );
                  })}
                </YStack>
              </YStack>
            );
          })}
        </YStack>
      </ScrollView>
    </YStack>
  );
}
