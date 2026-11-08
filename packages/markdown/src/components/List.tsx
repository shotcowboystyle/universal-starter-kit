import { useResolvedKnobs } from '@repo/theme';
import { Children, cloneElement, isValidElement } from 'react';
import type { ReactNode } from 'react';
import { Text, View, XStack, getConfig, getVariableValue } from 'tamagui';

import { CheckIcon } from '../icons';
import type { ListItemProps, ListProps } from '../types';

const listReset = {
  listStyleType: 'none',
  paddingInlineStart: 0,
  marginBlockStart: 0,
  marginBlockEnd: 0,
};

interface ListItemInternalProps extends ListItemProps {
  index?: number;
  ordered?: boolean;
  start?: number;
}

/**
 * Typography of the prose the task marker sits beside: markdown Paragraph
 * renders the $body font at size $true with lineHeight $6 (./Paragraph.tsx).
 * The box derives from those same tokens so it scales with the body type
 * instead of a hardcoded glyph column (theme-propagation-spec: MarkdownListItem
 * marker "scales with type/size").
 */
const getTaskBoxMetrics = () => {
  const bodyFont = getConfig()?.fontsParsed?.$body;
  const fontSize = Math.round(Number(getVariableValue(bodyFont?.size?.$true) ?? 14));
  const lineHeight = Math.round(Number(getVariableValue(bodyFont?.lineHeight?.$6) ?? fontSize * 2));
  return { fontSize, boxSize: Math.round(fontSize * 1.15), lineHeight };
};

/** Box↔label gap by space knob — mirrors the forms Checkbox inline gap. */
const taskInlineGapMap = new Map([
  ['small', '$1.5'],
  ['medium', '$2'],
  ['large', '$2.5'],
]);

/** Cap the radius knob for a small square control (R-CLAMP: never a circle). */
const clampTaskBoxRadius = (radiusToken: string, pointy: boolean): string | number => {
  if (pointy || radiusToken === '$0') {
    return 0;
  }
  const num = Math.trunc(Number(radiusToken.replace('$', '')));
  return Number.isFinite(num) && num > 2 ? '$2' : radiusToken;
};

/**
 * Read-only GFM task-list marker. It is document content, not a form field:
 * never focusable or clickable, state conveyed via role/aria only. Drawn with
 * the house control treatment ($color5 surface, $color7 border, accent check)
 * so radius/border/fill/space/accent/weight knobs all reach it (LC-18).
 */
const TaskCheckbox = ({ checked }: { checked: boolean }) => {
  const { knobProps } = useResolvedKnobs();
  const { boxSize, lineHeight } = getTaskBoxMetrics();
  return (
    <View
      height={lineHeight}
      justifyContent="center">
      <View
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- read-only task marker, not a form field; cross-platform View (no <input> on native) carries the state via role/aria
        role="checkbox"
        aria-checked={checked}
        aria-disabled={true}
        width={boxSize}
        height={boxSize}
        borderWidth={knobProps.borderRadius.borderWidth}
        borderColor="$color7"
        backgroundColor={knobProps.outlined ? 'transparent' : '$color5'}
        borderRadius={clampTaskBoxRadius(knobProps.borderRadius.borderRadius, knobProps.pointy)}
        alignItems="center"
        justifyContent="center">
        {checked ? (
          <CheckIcon
            size={Math.round(boxSize * 0.72)}
            color={knobProps.textAccentColor}
            strokeWidth={knobProps.textWeight.fontWeight === '700' ? 3 : 2.5}
          />
        ) : null}
      </View>
    </View>
  );
};

export const MarkdownListItem = ({ checked, children, index = 0, ordered = false, start }: ListItemInternalProps) => {
  const { knobProps } = useResolvedKnobs();
  const bullet = ordered ? `${(start ?? 1) + index}.` : '•';

  // Task list item
  if (checked !== null && checked !== undefined) {
    return (
      <XStack
        render="li"
        marginBottom="$1"
        alignItems="flex-start"
        gap={taskInlineGapMap.get(knobProps.space) ?? '$2'}>
        <TaskCheckbox checked={checked} />
        <View flex={1}>{children}</View>
      </XStack>
    );
  }

  const { fontSize } = getTaskBoxMetrics();
  const markerWidth = Math.round(fontSize * 1.7);
  return (
    <XStack
      render="li"
      marginBottom="$1"
      alignItems="flex-start"
      gap={taskInlineGapMap.get(knobProps.space) ?? '$2'}>
      <Text
        width={markerWidth}
        color="$color11"
        aria-hidden
        {...knobProps.body}>
        {bullet}
      </Text>
      <View flex={1}>{children}</View>
    </XStack>
  );
};

export const MarkdownList = ({ ordered, start, children }: ListProps) => {
  // oxlint-disable-next-line react/no-react-children -- the renderer passes items as children; each needs the list's ordered/start to draw its marker
  const items = Children.map(children, (child): ReactNode => {
    if (!isValidElement<ListItemInternalProps>(child) || child.type !== MarkdownListItem) {
      return child;
    }
    const childProps = child.props;
    // oxlint-disable-next-line react/no-clone-element -- injects the parent list's ordered/start into renderer-created items
    return cloneElement(child, {
      ordered: childProps.ordered ?? ordered,
      start: childProps.start ?? start ?? undefined,
    });
  });
  return (
    <View
      render={ordered ? 'ol' : 'ul'}
      start={ordered ? (start ?? undefined) : undefined}
      // SAFETY: web list reset; CSS list/logical properties are valid DOM styles but absent from React Native's style type.
      // oxlint-disable-next-line typescript/no-explicit-any, typescript/no-unsafe-assignment, typescript/no-unsafe-type-assertion -- see SAFETY above
      style={listReset as any}
      marginVertical="$2">
      {items}
    </View>
  );
};
