import {
  ensureKeyboardModalityTracking,
  keyboardFocusRingProps,
  pressTargetHitSlop,
  transitionProps,
  useResolvedKnobs,
  wasKeyboardFocus,
} from '@repo/theme';
import { ScrollView, Text, XStack, isWeb } from '@repo/ui';
import { useRef, useState } from 'react';

export interface FacetRailOption {
  /** Facet value; "" is the chip that clears the facet. */
  value: string;
  label: string;
  /** Theme hue (`"grass"`) painting the chip from its ramp. */
  tint?: string;
  count?: number;
}

export interface FacetRailProps {
  /** Names the radiogroup. */
  label: string;
  /** Active value, or "" for none. */
  value: string;
  options: readonly FacetRailOption[];
  onChange: (value: string) => void;
  testID?: string;
}

interface RailChipProps {
  option: FacetRailOption;
  selected: boolean;
  tabStop: boolean;
  onPress: () => void;
  onFocusChip: () => void;
  onBlurChip: () => void;
  onMove: (direction: -1 | 1 | 'home' | 'end') => void;
  testID?: string;
  register: (node: { focus?: () => void } | null) => void;
}

// Chips paint a notch under the ~40px toolbar controls; hitSlop restores the
// 44px press target (DG-LAY-04, ViewSwitcher precedent).
const chipVisualHeight = 38;
const chipHitSlop = pressTargetHitSlop(chipVisualHeight);
const pipSize = '$1';

/**
 * One chip. Neutral until active; the active chip fills from its tint ramp
 * (DF-04 pairing: tint fill, step-12 text), so selected is fill, never a
 * sibling border (LC-71). An unselected tinted chip carries a hue pip.
 */
function RailChip({
  option,
  selected,
  tabStop,
  onPress,
  onFocusChip,
  onBlurChip,
  onMove,
  testID,
  register,
}: RailChipProps) {
  const { knobProps } = useResolvedKnobs();
  const [kbFocus, setKbFocus] = useState(false);
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }
  const hue = option.tint;
  const fill = selected ? (hue ? `$${hue}5` : '$color5') : hue ? `$${hue}3` : '$color3';
  const hoverFill = selected ? fill : hue ? `$${hue}4` : '$color4';
  const textColor = selected ? (hue ? `$${hue}12` : '$color12') : hue ? `$${hue}11` : '$color11';
  const keys: Record<string, -1 | 1 | 'home' | 'end'> = {
    ArrowRight: 1,
    ArrowLeft: -1,
    Home: 'home',
    End: 'end',
  };

  return (
    <XStack
      ref={register}
      {...knobProps.borderRadius}
      backgroundColor={fill as never}
      borderWidth={0}
      paddingHorizontal="$3"
      minHeight={chipVisualHeight}
      hitSlop={chipHitSlop}
      alignItems="center"
      gap="$1.5"
      cursor="pointer"
      role="radio"
      aria-checked={selected}
      {...(isWeb ? { tabIndex: tabStop ? 0 : -1 } : undefined)}
      {...transitionProps(knobProps.transition)}
      hoverStyle={{ backgroundColor: hoverFill as never }}
      pressStyle={{ backgroundColor: fill as never }}
      outlineWidth={0}
      focusStyle={{ outlineWidth: 0, backgroundColor: fill as never }}
      focusVisibleStyle={{ outlineWidth: 0 }}
      {...(isWeb
        ? {
            onFocus: () => {
              onFocusChip();
              if (wasKeyboardFocus()) {
                setKbFocus(true);
              }
            },
            onBlur: () => {
              onBlurChip();
              setKbFocus(false);
            },
            onKeyDown: (event: { key?: string; preventDefault?: () => void }) => {
              const direction = event.key ? keys[event.key] : undefined;
              if (direction !== undefined) {
                event.preventDefault?.();
                onMove(direction);
                return;
              }
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault?.();
                onPress();
              }
            },
          }
        : undefined)}
      {...(kbFocus ? keyboardFocusRingProps : undefined)}
      onPress={onPress}
      testID={testID}>
      {hue ? (
        <XStack
          width={pipSize}
          height={pipSize}
          borderRadius={1000}
          backgroundColor={`$${hue}9` as never}
          flexShrink={0}
        />
      ) : null}
      <Text
        {...knobProps.label}
        fontWeight={selected ? '700' : '500'}
        color={textColor as never}
        textTransform="capitalize"
        userSelect="none">
        {option.label}
      </Text>
      {typeof option.count === 'number' ? (
        <Text
          {...knobProps.label}
          fontSize="$1"
          fontWeight="700"
          color={textColor as never}
          opacity={0.7}
          userSelect="none">
          {option.count}
        </Text>
      ) : null}
    </XStack>
  );
}

/**
 * A single-select facet as a horizontally scrolling chip rail. One tap
 * narrows, a second tap on the active chip clears. One tab stop (LC-49):
 * arrows, Home and End move and select like a radiogroup, and the focused
 * chip paints the only ring (LC-71). Scrolls on narrow viewports instead of
 * wrapping into a wall of chips.
 */
export function FacetRail({ label, value, options, onChange, testID }: FacetRailProps) {
  const itemRefs = useRef<Record<string, { focus?: () => void } | null>>({});
  const [focusValue, setFocusValue] = useState<string | null>(null);
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }

  const anchor = focusValue !== null && options.some((option) => option.value === focusValue) ? focusValue : value;

  const focusAndSelect = (next: string) => {
    setFocusValue(next);
    onChange(next);
    if (!isWeb) {
      return;
    }
    requestAnimationFrame(() => {
      const node = itemRefs.current[next] as
        | ({ focus?: () => void } & { scrollIntoView?: (options: object) => void })
        | null;
      node?.focus?.();
      node?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
    });
  };

  const moveFrom = (from: string, direction: -1 | 1 | 'home' | 'end') => {
    if (options.length === 0) {
      return;
    }
    if (direction === 'home') {
      focusAndSelect(options[0].value);
      return;
    }
    if (direction === 'end') {
      focusAndSelect(options.at(-1).value);
      return;
    }
    const index = Math.max(
      0,
      options.findIndex((option) => option.value === from),
    );
    focusAndSelect(options[(index + direction + options.length) % options.length].value);
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      flexShrink={0}>
      <XStack
        role="radiogroup"
        aria-label={label}
        aria-orientation="horizontal"
        gap="$1.5"
        alignItems="center"
        paddingVertical="$1"
        testID={testID}>
        {options.map((option) => (
          <RailChip
            key={option.value || '__all'}
            option={option}
            selected={option.value === value}
            tabStop={option.value === anchor}
            onPress={() => {
              onChange(option.value === value && option.value !== '' ? '' : option.value);
            }}
            onFocusChip={() => {
              setFocusValue(option.value);
            }}
            onBlurChip={() => {
              setFocusValue((prev) => (prev === option.value ? null : prev));
            }}
            onMove={(direction) => {
              moveFrom(option.value, direction);
            }}
            testID={testID ? `${testID}-${option.value || 'all'}` : undefined}
            register={(node) => {
              itemRefs.current[option.value] = node;
            }}
          />
        ))}
      </XStack>
    </ScrollView>
  );
}
