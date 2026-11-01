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
  onMove: (direction: ChipMove) => void;
  testID?: string;
  register: (node: ChipNode | null) => void;
}

/** Where an arrow/Home/End key moves the rail's selection. */
type ChipMove = -1 | 1 | 'home' | 'end';

/** The focusable host behind a chip (a DOM element on web). */
interface ChipNode {
  focus?: () => void;
  scrollIntoView?: (options: ScrollIntoViewOptions) => void;
}

const chipKeys = new Map<string, ChipMove>([
  ['ArrowRight', 1],
  ['ArrowLeft', -1],
  ['Home', 'home'],
  ['End', 'end'],
]);

/** `$<hue><step>` from the chip's tint ramp, or the neutral `$color<step>`. */
const rampToken = (hue: string | undefined, step: number): string =>
  hue !== undefined && hue !== '' ? `$${hue}${step}` : `$color${step}`;

// SAFETY: every caller passes a `$<ramp><step>` theme color token, which Tamagui resolves at runtime; its color props only type the literal token union.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
const colorToken = (token: string) => token as never;

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
const RailChip = ({
  option,
  selected,
  tabStop,
  onPress,
  onFocusChip,
  onBlurChip,
  onMove,
  testID,
  register,
}: RailChipProps) => {
  const { knobProps } = useResolvedKnobs();
  const [kbFocus, setKbFocus] = useState(false);
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }
  const hue = option.tint;
  const hasHue = hue !== undefined && hue !== '';
  const fill = colorToken(rampToken(hue, selected ? 5 : 3));
  const hoverFill = selected ? fill : colorToken(rampToken(hue, 4));
  const textColor = colorToken(rampToken(hue, selected ? 12 : 11));

  return (
    <XStack
      ref={register}
      {...knobProps.borderRadius}
      backgroundColor={fill}
      borderWidth={0}
      paddingHorizontal="$3"
      minHeight={chipVisualHeight}
      hitSlop={chipHitSlop}
      alignItems="center"
      gap="$1.5"
      cursor="pointer"
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the chip is a cross-platform Tamagui stack (no <input> on native); role, aria-checked and the arrow/Enter/Space handlers give radio semantics
      role="radio"
      aria-checked={selected}
      {...(isWeb ? { tabIndex: tabStop ? 0 : -1 } : undefined)}
      {...transitionProps(knobProps.transition)}
      hoverStyle={{ backgroundColor: hoverFill }}
      pressStyle={{ backgroundColor: fill }}
      outlineWidth={0}
      focusStyle={{ outlineWidth: 0, backgroundColor: fill }}
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
              const direction = event.key === undefined ? undefined : chipKeys.get(event.key);
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
      {hasHue ? (
        <XStack
          width={pipSize}
          height={pipSize}
          borderRadius={1000}
          backgroundColor={colorToken(`$${hue}9`)}
          flexShrink={0}
        />
      ) : null}
      <Text
        {...knobProps.label}
        fontWeight={selected ? '700' : '500'}
        color={textColor}
        textTransform="capitalize"
        userSelect="none">
        {option.label}
      </Text>
      {option.count === undefined ? null : (
        <Text
          {...knobProps.label}
          fontSize="$1"
          fontWeight="700"
          color={textColor}
          opacity={0.7}
          userSelect="none">
          {option.count}
        </Text>
      )}
    </XStack>
  );
};

/**
 * A single-select facet as a horizontally scrolling chip rail. One tap
 * narrows, a second tap on the active chip clears. One tab stop (LC-49):
 * arrows, Home and End move and select like a radiogroup, and the focused
 * chip paints the only ring (LC-71). Scrolls on narrow viewports instead of
 * wrapping into a wall of chips.
 */
export const FacetRail = ({ label, value, options, onChange, testID }: FacetRailProps) => {
  const itemRefs = useRef<Record<string, ChipNode | null>>({});
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
      const node = itemRefs.current[next];
      node?.focus?.();
      node?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
    });
  };

  const moveFrom = (from: string, direction: ChipMove) => {
    if (options.length === 0) {
      return;
    }
    if (direction === 'home') {
      focusAndSelect(options[0].value);
      return;
    }
    if (direction === 'end') {
      const last = options.at(-1);
      if (last) {
        focusAndSelect(last.value);
      }
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
            testID={testID !== undefined && testID !== '' ? `${testID}-${option.value || 'all'}` : undefined}
            register={(node) => {
              itemRefs.current[option.value] = node;
            }}
          />
        ))}
      </XStack>
    </ScrollView>
  );
};
