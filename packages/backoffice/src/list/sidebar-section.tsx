/**
 * Presentational pieces for the list sidebar: a collapsible facet section
 * (one Accordion.Item — the Accordion root lives in ListSidebar so sections
 * share open state), a facet row (label + count pill + active state), and
 * the per-section loading skeleton.
 */
import {
  Accordion,
  Chip,
  SizableText,
  Skeleton,
  XStack,
  YStack,
  useAccordionTriggerInk,
} from '@repo/ui';
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

function SidebarSectionTitle({ title }: { title: string }) {
  const color = useAccordionTriggerInk('$color11');
  return (
    <SizableText
      size="$2"
      fontWeight="400"
      color={color as never}
      numberOfLines={1}
      flexShrink={1}>
      {title}
    </SizableText>
  );
}

/** Trigger + facet stack. ListSidebar wraps this in Accordion.Item so the
 *  Accordion root can count items (a custom Item wrapper is opaque). */
export function SidebarSectionChrome({ title, children }: Omit<SidebarSectionProps, 'value'>) {
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
            <Fragment key={isValidElement(child) && child.key != null ? String(child.key) : index}>
              {index > 0 ? <YStack {...hairline.line} /> : null}
              <GroupPositionContext.Provider value={getGroupPosition(index, rows.length)}>
                {child}
              </GroupPositionContext.Provider>
            </Fragment>
          ))}
        </YStack>
      </Accordion.Content>
    </>
  );
}

export function SidebarSection({ value, title, children }: SidebarSectionProps) {
  return (
    <Accordion.Item value={value}>
      <SidebarSectionChrome title={title}>{children}</SidebarSectionChrome>
    </Accordion.Item>
  );
}

export interface SidebarFacetRowProps {
  label: string;
  count: number;
  /** The row's filter tuple is currently applied. */
  active: boolean;
  onPress: () => void;
}

export function SidebarFacetRow({ label, count, active, onPress }: SidebarFacetRowProps) {
  const { knobProps } = useResolvedKnobs();
  const position = useGroupPosition() ?? 'only';
  const corners = stackRadiusProps(position, knobProps.borderRadius.borderRadius);
  return (
    <XStack
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
}

export interface SidebarSectionSkeletonProps {
  rows?: number;
}

export function SidebarSectionSkeleton({ rows = 3 }: SidebarSectionSkeletonProps) {
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
}
