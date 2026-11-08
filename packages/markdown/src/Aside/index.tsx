import { useResolvedKnobs } from '@repo/theme';
import { Alert } from '@repo/ui';
import type { AlertProps } from '@repo/ui';
import { LinearGradient } from '@tamagui/linear-gradient';
import { Children, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Paragraph, XStack, YStack } from 'tamagui';
import type { GetProps } from 'tamagui';

import { useCutoffGradientColors } from '../shared/cutoff-gradient';
import { isBareTextChild, wrapBareTextChildren } from '../shared/text-rides-text';
import { tokenPx } from '../shared/token-px';

const zIndex = { localTop: 100 };

export interface MDXAsideProps {
  children: ReactNode;
}

export const MDXAside = ({ children, ...props }: MDXAsideProps & Omit<GetProps<typeof YStack>, 'children'>) => {
  const { knobProps } = useResolvedKnobs();
  const gradientColors = useCutoffGradientColors();
  const cutoffMaxHeight = tokenPx(knobProps.sizeToken, 24) * 12;
  const gradientHeight = tokenPx(knobProps.sizeToken, 24) * 8;
  // LC-82 TEXT-RIDES-TEXT: an ARRAY of bare strings is text too — treat it
  // like the singleton string path (one coalesced Paragraph, no cutoff).
  // oxlint-disable-next-line react/no-react-children -- toArray flattens nested arrays and drops null/boolean holes exactly as React renders them
  const flattened = Array.isArray(children) ? Children.toArray(children) : null;
  const textChildren = flattened?.filter(isBareTextChild) ?? [];
  const areChildrenString =
    isBareTextChild(children) || (textChildren.length > 0 && textChildren.length === flattened?.length);
  const [expanded, setExpanded] = useState(false);
  const [contentHeight, setContentHeight] = useState<number | undefined>();
  // only cut off element children whose content actually exceeds the max height
  const shouldCutoff = !areChildrenString && (contentHeight === undefined || contentHeight > cutoffMaxHeight);
  const cutoff = shouldCutoff && !expanded;

  return (
    <YStack
      render="aside"
      {...knobProps.gap}
      {...knobProps.containerRadius}
      {...knobProps.panelPadding}
      marginHorizontal="$-2"
      marginTop="$2"
      position="relative"
      {...(cutoff && {
        marginVertical: '$4',
        paddingHorizontal: knobProps.panelPadding.padding,
        borderWidth: knobProps.borderRadius.borderWidth,
        paddingBottom: '$10',
        backgroundColor: '$color1',
        borderColor: '$borderColor',
        maxHeight: cutoffMaxHeight,
        overflow: 'hidden',
      })}
      {...props}>
      {areChildrenString ? (
        <Paragraph color="$color10">{flattened ? textChildren.join('') : children}</Paragraph>
      ) : (
        <YStack
          onLayout={(event) => {
            setContentHeight(event.nativeEvent.layout.height);
          }}>
          {/* LC-82: mixed element+string children — string runs still ride a
              Text component instead of crashing native. */}
          {wrapBareTextChildren(children, (label, key) => (
            <Paragraph
              key={key}
              color="$color10">
              {label}
            </Paragraph>
          ))}
        </YStack>
      )}

      {cutoff && (
        <>
          <LinearGradient
            position="absolute"
            bottom={0}
            left={0}
            right={0}
            height={gradientHeight}
            colors={gradientColors}
            pointerEvents="none"
            zIndex={zIndex.localTop}
          />
          <XStack
            position="absolute"
            bottom="$4"
            left={0}
            right={0}
            justifyContent="center"
            zIndex={zIndex.localTop + 1}>
            <Button
              onPress={() => {
                setExpanded(true);
              }}>
              Show more
            </Button>
          </XStack>
        </>
      )}
    </YStack>
  );
};

export interface MDXNoteProps {
  children: ReactNode;
}

/** Markdown-facing note box: renders Alert (info intent, no icon). */
export const MDXNote = ({ children, ...props }: MDXNoteProps & Omit<AlertProps, 'children'>) => (
  <Alert
    render="aside"
    intent="info"
    icon={null}
    marginTop="$5"
    marginBottom="$5"
    {...props}>
    {children}
  </Alert>
);
