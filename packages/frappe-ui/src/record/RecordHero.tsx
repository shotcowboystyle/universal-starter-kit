import { Skeleton, Text, XStack, YStack } from '@repo/ui';
import type { YStackProps } from '@repo/ui';
import { Progress } from '@repo/forms';
import { sizeRecipeEscape, useResolvedKnobs } from '@repo/theme';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The record hero's geometry, shared by the loaded hero and its skeleton so
 * the row does not jump when the record lands (LC-20).
 */
export const recordHeroArtBasis = 380;
export const recordHeroArtMax = 480;
export const recordHeroIdentityBasis = 320;

export interface RecordHeroFrameProps extends YStackProps {
  /** A theme hue painting the stage from its ramp. */
  tint?: string;
  children: ReactNode;
}

export function RecordHeroFrame({ tint, children, ...rest }: RecordHeroFrameProps) {
  const { knobProps } = useResolvedKnobs();
  return (
    <YStack
      {...knobProps.borderRadius}
      {...knobProps.panelPadding}
      backgroundColor={tint ? (`$${tint}2` as never) : '$color3'}
      width="100%"
      {...rest}>
      {children}
    </YStack>
  );
}

export function RecordHeroRow({ children }: { children: ReactNode }) {
  const { knobProps } = useResolvedKnobs();
  return (
    <XStack
      {...knobProps.gapLg}
      flexWrap="wrap"
      alignItems="flex-start">
      {children}
    </XStack>
  );
}

export function RecordHeroArtColumn({ children, ...rest }: YStackProps & { children: ReactNode }) {
  const { knobProps } = useResolvedKnobs();
  return (
    <YStack
      flexGrow={1}
      flexBasis={recordHeroArtBasis}
      maxWidth={recordHeroArtMax}
      minWidth={0}
      {...knobProps.gap}
      {...rest}>
      {children}
    </YStack>
  );
}

export function RecordHeroIdentityColumn({ children, ...rest }: YStackProps & { children: ReactNode }) {
  const { knobProps } = useResolvedKnobs();
  return (
    <YStack
      flexGrow={999}
      flexBasis={recordHeroIdentityBasis}
      minWidth={0}
      {...knobProps.gap}
      {...rest}>
      {children}
    </YStack>
  );
}

export interface RecordVitalTile {
  id: string;
  label: string;
  value: string;
  /** Fill of a bar under the value, 0 to 100. */
  percent?: number;
}

/** Nested fact tiles under the title: compact density so they recede. */
export function RecordVitals({ tiles }: { tiles: readonly RecordVitalTile[] }) {
  const { knobProps } = useResolvedKnobs({ compact: true });
  if (tiles.length === 0) {
    return null;
  }
  return (
    <XStack
      {...knobProps.gap}
      flexWrap="wrap">
      {tiles.map((tile) => (
        <YStack
          key={tile.id}
          {...knobProps.borderRadius}
          {...knobProps.panelPadding}
          backgroundColor="$color2"
          borderWidth={0}
          flexGrow={1}
          flexBasis={140}
          gap="$1">
          <Text
            {...knobProps.label}
            {...knobProps.body}
            color="$color10">
            {tile.label}
          </Text>
          <Text
            fontSize="$5"
            fontWeight="700">
            {tile.value}
          </Text>
          {tile.percent === undefined ? null : (
            <Progress
              value={tile.percent}
              max={100}
              size="$2"
              intent="accent"
              progressProps={{ 'aria-label': tile.label }}
            />
          )}
        </YStack>
      ))}
    </XStack>
  );
}

const bone = (px: number) => sizeRecipeEscape(px, 'loading bones sized to the record page they stand in for');

/** The breadcrumb line's loading twin. */
export function RecordBreadcrumbBone() {
  return (
    <XStack
      alignItems="center"
      minHeight={bone(20)}>
      <Skeleton
        width={bone(180)}
        height={bone(14)}
      />
    </XStack>
  );
}

/** The hero and tab strip's loading twin, on the same geometry. */
export function RecordSkeleton({ testID }: { testID?: string }) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  return (
    <YStack
      {...knobProps.gapLg}
      testID={testID}
      data-async-skeleton="record"
      aria-busy
      aria-label={t('Loading')}>
      <RecordHeroFrame>
        <RecordHeroRow>
          <RecordHeroArtColumn {...{ 'data-skeleton-part': 'art' }}>
            <Skeleton
              variant="rounded"
              width="100%"
              aspectRatio={1}
            />
          </RecordHeroArtColumn>
          <RecordHeroIdentityColumn {...{ 'data-skeleton-part': 'identity' }}>
            <Skeleton
              width={bone(72)}
              height={bone(16)}
            />
            <Skeleton
              width={bone(280)}
              height={bone(56)}
            />
            <Skeleton
              width={bone(160)}
              height={bone(18)}
            />
            <XStack gap="$1.5">
              <Skeleton
                variant="rounded"
                width={bone(64)}
                height={bone(22)}
              />
              <Skeleton
                variant="rounded"
                width={bone(64)}
                height={bone(22)}
              />
            </XStack>
            <XStack
              {...knobProps.gap}
              flexWrap="wrap">
              {[0, 1, 2].map((tile) => (
                <Skeleton
                  key={tile}
                  variant="rounded"
                  flexGrow={1}
                  flexBasis={140}
                  height={bone(64)}
                />
              ))}
            </XStack>
          </RecordHeroIdentityColumn>
        </RecordHeroRow>
      </RecordHeroFrame>
      <YStack {...knobProps.gap}>
        <XStack
          {...knobProps.gap}
          {...{ 'data-skeleton-part': 'tabs' }}>
          {[104, 88, 96].map((width, tab) => (
            <Skeleton
              key={tab}
              variant="rounded"
              width={bone(width)}
              height={bone(44)}
            />
          ))}
        </XStack>
        <Skeleton.Text lines={4} />
      </YStack>
    </YStack>
  );
}
