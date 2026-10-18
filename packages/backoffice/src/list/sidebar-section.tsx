import {
  GroupPositionContext,
  ensureFocusVisibleRing,
  getGroupPosition,
  hairline,
  sizeRecipeEscape,
  sizeRecipeForToken,
  stackRadiusProps,
  useGroupPosition,
  useResolvedKnobs,
} from '@repo/theme';
/**
 * Presentational pieces for the list sidebar: a collapsible facet section
 * (one Accordion.Item — the Accordion root lives in ListSidebar so sections
 * share open state), a facet row (label + count pill + active state), and
 * the per-section loading skeleton.
 */
import { Accordion, Chip, SizableText, Skeleton, XStack, YStack, useAccordionTriggerInk } from '@repo/ui';
import { Children, Fragment, isValidElement } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

export interface SidebarSectionProps {
  /** Accordion item value (unique per section). */
  value: string;
  title: string;
  children: ReactNode;
}

const SidebarSectionTitle = ({ title }: { title: string }) => {
  const color = useAccordionTriggerInk('$color11');
  return (
    <SizableText
      size="$2"
      fontWeight="400"
      // SAFETY: useAccordionTriggerInk returns a theme color token; SizableText's color prop type does not list them
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      color={color as never}
      numberOfLines={1}
      flexShrink={1}>
      {title}
    </SizableText>
  );
};

/** Trigger + facet stack. ListSidebar wraps this in Accordion.Item so the
 *  Accordion root can count items (a custom Item wrapper is opaque). */
export const SidebarSectionChrome = ({ title, children }: Omit<SidebarSectionProps, 'value'>) => {
  // oxlint-disable-next-line react/no-react-children -- each facet row needs its group position and a separator; rows are plain children
  const rows = Children.toArray(children);
  return (
    <>
      <Accordion.Trigger
        minHeight="$4"
        paddingVertical="$1.5"
        paddingHorizontal="$2">
        <SidebarSectionTitle title={title} />
      </Accordion.Trigger>
      <Accordion.Content padding={0}>
        <YStack>
          {rows.map((child, index) => (
            // oxlint-disable-next-line react-doctor/no-array-index-as-key -- Children.toArray keys every element; the index only covers bare text nodes
            <Fragment key={isValidElement(child) && child.key !== null ? child.key : index}>
              {index > 0 ? <YStack {...hairline.line} /> : null}
              {/* oxlint-disable-next-line react/jsx-no-constructed-context-values -- getGroupPosition returns a primitive position string */}
              <GroupPositionContext.Provider value={getGroupPosition(index, rows.length)}>
                {child}
              </GroupPositionContext.Provider>
            </Fragment>
          ))}
        </YStack>
      </Accordion.Content>
    </>
  );
};

export const SidebarSection = ({ value, title, children }: SidebarSectionProps) => (
  <Accordion.Item value={value}>
    <SidebarSectionChrome title={title}>{children}</SidebarSectionChrome>
  </Accordion.Item>
);

export interface SidebarFacetRowProps {
  label: string;
  count: number;
  /** The row's filter tuple is currently applied. */
  active: boolean;
  onPress: () => void;
}

export const SidebarFacetRow = ({ label, count, active, onPress }: SidebarFacetRowProps) => {
  const { knobProps } = useResolvedKnobs();
  const position = useGroupPosition() ?? 'only';
  const corners = stackRadiusProps(position, knobProps.borderRadius.borderRadius);
  return (
    <XStack
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a tamagui row (flex layout, group corners) acting as a toggle; Enter/Space handled below
      role="button"
      aria-pressed={active}
      aria-label={label}
      alignItems="center"
      justifyContent="space-between"
      gap="$2"
      paddingVertical="$1.5"
      paddingHorizontal="$2"
      overflow="hidden"
      {...corners}
      {...{ 'data-group-position': position }}
      cursor="pointer"
      backgroundColor={active ? '$color4' : 'transparent'}
      hoverStyle={{
        backgroundColor: active ? '$color5' : '$color3',
        ...corners,
      }}
      pressStyle={{ backgroundColor: '$color5', ...corners }}
      tabIndex={0}
      outlineWidth={0}
      focusStyle={{ outlineWidth: 0 }}
      focusVisibleStyle={ensureFocusVisibleRing({ outlineOffset: -2 })}
      onPress={onPress}
      onKeyDown={
        // SAFETY: on web tamagui forwards the DOM keyboard event, which has key/preventDefault; the prop is typed as a no-arg handler
        // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- see SAFETY above
        ((e: { key?: string; preventDefault?: () => void }) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault?.();
            onPress();
          }
        }) as unknown as () => void
      }>
      <SizableText
        size="$3"
        numberOfLines={1}
        flexShrink={1}
        fontWeight="400">
        {label}
      </SizableText>
      <Chip
        size="$2"
        variant="subtle"
        color="gray">
        {count}
      </Chip>
    </XStack>
  );
};

export interface SidebarSectionSkeletonProps {
  rows?: number;
}

export const SidebarSectionSkeleton = ({ rows = 3 }: SidebarSectionSkeletonProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const lineBone = sizeRecipeForToken(knobProps.sizeToken).fontSize;
  return (
    <YStack
      gap="$2"
      paddingVertical="$1"
      aria-busy
      aria-label={t('loading', 'Loading')}>
      {Array.from({ length: rows }, (_, index) => (
        <XStack
          key={index}
          alignItems="center"
          justifyContent="space-between"
          gap="$2">
          <Skeleton
            width={`${55 + ((index * 13) % 25)}%`}
            height={lineBone}
          />
          <Skeleton
            variant="rounded"
            width={sizeRecipeEscape(26, 'count bone: the width of a two-digit count chip')}
            height={lineBone}
          />
        </XStack>
      ))}
    </YStack>
  );
};
