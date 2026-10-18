import { ArrowLeftIcon, ArrowRightIcon } from '@phosphor-icons/react';
import { Button } from '@repo/forms';
import { sizeRecipeEscape, useResolvedKnobs } from '@repo/theme';
import { Avatar, Text, XStack, YStack } from '@repo/ui';
import { useTranslation } from 'react-i18next';

export interface RecordPagerEntry {
  title: string;
  code?: string;
  image?: string;
  onPress: () => void;
}

function PagerButton({
  direction,
  entry,
  testID,
}: {
  direction: 'prev' | 'next';
  entry: RecordPagerEntry;
  testID?: string;
}) {
  const { t } = useTranslation();
  const { knobProps: nested } = useResolvedKnobs({ compact: true });
  const isPrev = direction === 'prev';
  const avatar = (
    <Avatar
      src={entry.image}
      name={entry.title}
      backgroundColor="$color4"
      fallbackBackgroundColor="$color4"
    />
  );
  return (
    <Button
      outlined
      minHeight={sizeRecipeEscape(56, "pager button: room for the neighbor's two-line label beside its avatar")}
      flexShrink={1}
      minWidth={0}
      onPress={entry.onPress}
      icon={isPrev ? <ArrowLeftIcon size={18} /> : undefined}
      iconAfter={isPrev ? undefined : <ArrowRightIcon size={18} />}
      testID={testID}>
      <XStack
        gap="$2"
        alignItems="center"
        flexShrink={1}
        minWidth={0}>
        {isPrev ? avatar : null}
        <YStack
          alignItems={isPrev ? 'flex-start' : 'flex-end'}
          flexShrink={1}
          minWidth={0}>
          <Text
            {...nested.label}
            color="$color10"
            textTransform="uppercase"
            letterSpacing={1}>
            {isPrev ? t('Previous') : t('Next')}
          </Text>
          <XStack
            gap="$1.5"
            alignItems="baseline"
            minWidth={0}>
            {entry.code ? (
              <Text
                {...nested.label}
                color="$color10"
                fontWeight="600">
                {entry.code}
              </Text>
            ) : null}
            <Text
              fontWeight="700"
              numberOfLines={1}
              flexShrink={1}>
              {entry.title}
            </Text>
          </XStack>
        </YStack>
        {isPrev ? null : avatar}
      </XStack>
    </Button>
  );
}

/** The records either side of this one in the list's order, by face and name. */
export function RecordPager({
  prev,
  next,
  testID,
}: {
  prev: RecordPagerEntry | null;
  next: RecordPagerEntry | null;
  testID?: string;
}) {
  const { knobProps } = useResolvedKnobs();
  if (!prev && !next) {
    return null;
  }
  return (
    <XStack
      justifyContent="space-between"
      {...knobProps.gap}
      marginTop="$2">
      {prev ? (
        <PagerButton
          direction="prev"
          entry={prev}
          testID={testID && `${testID}-prev`}
        />
      ) : (
        <YStack />
      )}
      {next ? (
        <PagerButton
          direction="next"
          entry={next}
          testID={testID && `${testID}-next`}
        />
      ) : (
        <YStack />
      )}
    </XStack>
  );
}
