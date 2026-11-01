import { useResolvedKnobs } from '@repo/theme';
import { Text, XStack, YStack } from '@repo/ui';

import { ImageWell } from '../list/ImageWell';

import type { InsightsRecordView } from './insights-record';

export interface InsightsRecordTile<TDoc> {
  id: string;
  label: string;
  doc: TDoc;
  value: string;
}

export interface InsightsRecordsProps<TDoc> {
  tiles: readonly InsightsRecordTile<TDoc>[];
  record: InsightsRecordView<TDoc>;
  testID?: string;
}

/**
 * Record holders as quiet fact tiles: the holder's tinted image well, its
 * title and code, and the value. Nested chrome steps with the compact
 * nestedControl, not the page's 44px floor (LC-73).
 */
export const InsightsRecords = <TDoc,>({ tiles, record, testID }: InsightsRecordsProps<TDoc>) => {
  const { knobProps } = useResolvedKnobs({ compact: true });
  const { knobProps: pageKnobs } = useResolvedKnobs();
  const wellPx = knobProps.nestedControl.px * 2;
  return (
    <XStack
      {...pageKnobs.gap}
      flexWrap="wrap"
      testID={testID}>
      {tiles.map((tile) => {
        const title = record.title(tile.doc);
        const code = record.code(tile.doc);
        const tints = record.tints(tile.doc);
        return (
          <XStack
            key={tile.id}
            {...knobProps.cardSurface}
            backgroundColor="$color2"
            flexGrow={1}
            flexBasis={220}
            alignItems="center"
            minWidth={0}
            {...knobProps.gap}>
            <YStack
              width={wellPx}
              flexShrink={0}
              data-nested-px={knobProps.nestedControl.px}>
              <ImageWell
                sources={record.images(tile.doc)}
                alt={title}
                tints={tints}
                inset={0.04}
              />
            </YStack>
            <YStack
              gap="$1"
              flexShrink={1}
              minWidth={0}>
              <Text
                {...knobProps.label}
                color="$color10">
                {tile.label}
              </Text>
              <XStack
                gap="$1.5"
                alignItems="baseline"
                flexWrap="wrap"
                minWidth={0}>
                <Text
                  fontWeight="700"
                  numberOfLines={1}
                  flexShrink={1}>
                  {title}
                </Text>
                {code !== undefined && code !== '' ? (
                  <Text
                    {...knobProps.label}
                    color="$color10"
                    fontWeight="600">
                    {code}
                  </Text>
                ) : null}
              </XStack>
              <Text
                fontSize="$6"
                fontWeight="700">
                {tile.value}
              </Text>
            </YStack>
          </XStack>
        );
      })}
    </XStack>
  );
};
