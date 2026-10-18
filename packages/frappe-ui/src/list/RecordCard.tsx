import { HeartIcon } from '@phosphor-icons/react';
import { Button } from '@repo/forms';
import {
  ensureFocusVisibleRing,
  ensureKeyboardModalityTracking,
  keyboardFocusRingProps,
  useResolvedKnobs,
  wasKeyboardFocus,
} from '@repo/theme';
import { Anchor, Card, Text, XStack, YStack, isWeb } from '@repo/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FacetBadge } from './FacetBadge';
import { ImageWell } from './ImageWell';

export interface RecordCardBadge {
  value: string;
  label: string;
  tint?: string;
}

export interface RecordCardProps {
  title: string;
  subtitle?: string;
  /** Stamped on the well's corner ("#025"). */
  code?: string;
  /** Image candidates in order; a failed load moves to the next. */
  images: readonly string[];
  /** Theme hues painting the well: one fills it, two split it. */
  tints?: readonly (string | undefined)[];
  /** Facet values stickered on the well. */
  badges?: readonly RecordCardBadge[];
  /** The record's page: the card becomes a real link (SSR, new tab). */
  href?: string;
  onPress?: () => void;
  favorite?: { active: boolean; toggle: () => void };
  /** Fetch the image only as it nears the viewport. */
  lazy?: boolean;
  testID?: string;
  favoriteTestID?: string;
}

interface PressLikeEvent {
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  button?: number;
  preventDefault?: () => void;
  stopPropagation?: () => void;
  nativeEvent?: PressLikeEvent;
}

function isModifiedPress(event?: PressLikeEvent): boolean {
  const native = event?.nativeEvent ?? event;
  return Boolean(
    native && (native.metaKey || native.ctrlKey || native.shiftKey || native.altKey || (native.button ?? 0) !== 0),
  );
}

/**
 * A record as a tile: the image well is the card (tinted by the record's
 * facet, its values stickered on it, its code stamped in the corner) with
 * the title and a muted subtitle under it. A routed card is a stretched
 * link with the heart as its sibling button (LC-74), so a first-paint click
 * on the heart never follows the link; modified clicks keep the browser's
 * new-tab semantics.
 */
export function RecordCard({
  title,
  subtitle,
  code,
  images,
  tints,
  badges = [],
  href,
  onPress,
  favorite,
  lazy = false,
  testID,
  favoriteTestID,
}: RecordCardProps) {
  const { t } = useTranslation();
  const { knobProps, elevation: elevationState } = useResolvedKnobs({ component: 'Card' });
  const focusRing = ensureFocusVisibleRing({ outlineOffset: -2 });
  const [anchorKeyboardFocus, setAnchorKeyboardFocus] = useState(false);
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }

  const handlePress = (event: unknown) => {
    const press = event as PressLikeEvent | undefined;
    if (href && isModifiedPress(press)) {
      return;
    }
    press?.preventDefault?.();
    press?.stopPropagation?.();
    onPress?.();
  };

  const handleToggleFavorite = (event: unknown) => {
    const press = event as PressLikeEvent | undefined;
    press?.preventDefault?.();
    press?.stopPropagation?.();
    press?.nativeEvent?.preventDefault?.();
    press?.nativeEvent?.stopPropagation?.();
    favorite?.toggle();
  };

  const passThrough = href ? 'box-none' : undefined;
  const inert = href ? 'none' : undefined;

  return (
    <Card
      testID={testID}
      position="relative"
      {...knobProps.cardSurface}
      elevation={knobProps.elevation}
      cursor="pointer"
      transition={knobProps.transition}
      hoverStyle={{ ...elevationState.hoverKnobProps }}
      pressStyle={{ ...elevationState.pressKnobProps }}
      {...(href
        ? anchorKeyboardFocus
          ? keyboardFocusRingProps
          : null
        : {
            role: 'button',
            'aria-label': title,
            onPress: handlePress,
            focusVisibleStyle: focusRing,
          })}>
      {href ? (
        <Anchor
          href={href as never}
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          zIndex={0}
          textDecorationLine="none"
          outlineWidth={0}
          aria-label={title}
          onPress={handlePress}
          {...(isWeb
            ? {
                onFocus: () => {
                  if (wasKeyboardFocus()) {
                    setAnchorKeyboardFocus(true);
                  }
                },
                onBlur: () => {
                  setAnchorKeyboardFocus(false);
                },
              }
            : undefined)}
        />
      ) : null}
      <YStack
        gap="$1.5"
        zIndex={1}
        pointerEvents={passThrough}>
        <YStack
          position="relative"
          pointerEvents={passThrough}>
          <ImageWell
            sources={images}
            alt={title}
            tints={tints}
            inset={0.04}
            lazy={lazy}
            pointerEvents={inert}
          />
          {code ? (
            <XStack
              position="absolute"
              top="$2"
              left="$2"
              {...knobProps.borderRadius}
              borderWidth={0}
              backgroundColor="$background08"
              paddingHorizontal="$1.5"
              paddingVertical="$0.5"
              zIndex={1}
              pointerEvents={inert}>
              <Text
                fontSize="$1"
                fontWeight="800"
                letterSpacing={1}
                color="$color12">
                {code}
              </Text>
            </XStack>
          ) : null}
          {favorite ? (
            <XStack
              position="absolute"
              top="$1"
              right="$1"
              zIndex={2}
              pointerEvents="auto"
              {...(isWeb
                ? {
                    onClickCapture: (event: { preventDefault: () => void }) => {
                      event.preventDefault();
                    },
                  }
                : undefined)}>
              <Button
                size="$3"
                circular
                chromeless
                minWidth={knobProps.sizeToken}
                minHeight={knobProps.sizeToken}
                transition={knobProps.transition}
                backgroundColor="$background08"
                hoverStyle={{ backgroundColor: '$background', scale: 1.08 }}
                pressStyle={{ backgroundColor: '$background', scale: 0.92 }}
                onPress={handleToggleFavorite}
                render="button"
                type="button"
                col={(favorite.active ? '$red9' : '$color11') as never}
                icon={
                  <HeartIcon
                    size={20}
                    weight={favorite.active ? 'fill' : 'regular'}
                  />
                }
                aria-label={
                  favorite.active
                    ? t('Remove {{name}} from favorites', { name: title })
                    : t('Add {{name}} to favorites', { name: title })
                }
                aria-pressed={favorite.active}
                testID={favoriteTestID}
              />
            </XStack>
          ) : null}
          {badges.length > 0 ? (
            <XStack
              position="absolute"
              bottom="$2"
              left="$2"
              right="$2"
              gap="$1.5"
              flexWrap="wrap"
              zIndex={1}
              pointerEvents="none">
              {badges.map((badge) => (
                <FacetBadge
                  key={badge.value}
                  label={badge.label}
                  tint={badge.tint}
                  compact
                />
              ))}
            </XStack>
          ) : null}
        </YStack>
        <YStack
          gap="$0.5"
          pointerEvents={inert}>
          <Text
            {...knobProps.heading}
            fontWeight="700"
            fontSize="$4"
            numberOfLines={1}
            color="$color12">
            {title}
          </Text>
          <Text
            {...knobProps.body}
            fontSize="$2"
            color="$color10"
            numberOfLines={1}>
            {subtitle ?? ' '}
          </Text>
        </YStack>
      </YStack>
    </Card>
  );
}
