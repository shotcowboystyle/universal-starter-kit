import { HeartIcon } from '@phosphor-icons/react';
import { Button } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import { Card, Text, XStack, YStack } from '@repo/ui';
import { useTranslation } from 'react-i18next';

import { FacetBadge } from './FacetBadge';
import { ImageWell } from './ImageWell';
import type { RecordCardProps } from './RecordCard';

export type { RecordCardBadge, RecordCardProps } from './RecordCard';

/**
 * Native twin of RecordCard. On React Native an Anchor is a Text node whose
 * press the Card (a View with its own responder) claims, so the card's
 * press sits on the Card itself and the heart stops it from bubbling there.
 */
const NO_BADGES: NonNullable<RecordCardProps['badges']> = [];

export const RecordCard = ({
  title,
  subtitle,
  code,
  images,
  tints,
  badges = NO_BADGES,
  onPress,
  favorite,
  testID,
  favoriteTestID,
}: RecordCardProps) => {
  const { t } = useTranslation();
  const { knobProps, elevation: elevationState } = useResolvedKnobs({ component: 'Card' });

  const handleToggleFavorite = (event?: { stopPropagation?: () => void }) => {
    event?.stopPropagation?.();
    favorite?.toggle();
  };

  return (
    <Card
      testID={testID}
      {...knobProps.cardSurface}
      elevation={knobProps.elevation}
      transition={knobProps.transition}
      pressStyle={{ scale: 0.98, ...elevationState.pressKnobProps }}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- native Card (a View); there is no <button> element on React Native
      role="button"
      aria-label={title}
      onPress={() => onPress?.()}>
      <YStack gap="$1.5">
        <YStack position="relative">
          <ImageWell
            sources={images}
            alt={title}
            tints={tints}
            inset={0.04}
          />
          {code !== undefined && code !== '' ? (
            <XStack
              position="absolute"
              top="$2"
              left="$2"
              {...knobProps.borderRadius}
              borderWidth={0}
              backgroundColor="$background08"
              paddingHorizontal="$1.5"
              paddingVertical="$0.5"
              zIndex={1}>
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
              zIndex={2}>
              <Button
                size="$3"
                circular
                chromeless
                minWidth={knobProps.sizeToken}
                minHeight={knobProps.sizeToken}
                transition={knobProps.transition}
                backgroundColor="$background08"
                pressStyle={{ backgroundColor: '$background', scale: 0.92 }}
                onPress={handleToggleFavorite}
                // SAFETY: both values are theme color tokens; the house Button's `col` prop is typed narrower than Tamagui's color token union.
                // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
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
        <YStack gap="$0.5">
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
};
