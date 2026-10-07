import {
  Code,
  ErrorBoundary,
  HighlightedCode,
  Pre,
  useClipboard,
  useShikiTokens,
  ScrollView,
} from '@repo/ui';
import { useResolvedKnobs } from '@repo/theme';
import { LinearGradient } from '@tamagui/linear-gradient';
import rangeParser from 'parse-numeric-range';
import type { ReactNode } from 'react';
import { useContext, useMemo, useState } from 'react';
import { Button, TooltipSimple, XStack, YStack } from 'tamagui';

import { CheckCircleIcon, ClipboardIcon } from '../icons';
import { useCutoffGradientColors } from '../shared/cutoffGradient';
import { tokenPx } from '../shared/tokenPx';

const zIndex = { localTop: 100 };
import type { MDXCodeBlockContextValue } from './mdxCodeBlockContext';
import { MDXCodeBlockContext } from './mdxCodeBlockContext';

export interface MDXCodeBlockProps extends MDXCodeBlockContextValue {
  className?: string;
  id?: string;
}

/**
 * Extract raw code text from MDX children.
 * Children are typically a plain string, but this handles nested elements for safety.
 */
function extractCodeText(children: ReactNode): string {
  if (typeof children === 'string') {
    return children;
  }
  if (Array.isArray(children)) {
    return children.map(extractCodeText).join('');
  }
  if (children && typeof children === 'object' && 'props' in children) {
    return extractCodeText((children as any).props?.children);
  }
  return String(children ?? '');
}

/**
 * Extract language from className like "language-tsx" -> "tsx"
 */
function extractLanguage(className?: string): string {
  if (!className) {
    return 'text';
  }
  const match = /language-(\w+)/.exec(className);
  return match?.[1] ?? 'text';
}

export function MDXCodeBlock(props: MDXCodeBlockProps) {
  const {
    children,
    className,
    disableCopy,
    id,
    isCollapsible,
    isHighlightingLines,
    showLineNumbers: propShowLineNumbers,
    size,
    line,
    ...codeProps
  } = { ...useContext(MDXCodeBlockContext), ...props } as MDXCodeBlockProps & {
    line?: string;
  };

  const { knobProps } = useResolvedKnobs();
  const gradientColors = useCutoffGradientColors();
  const cutoffMaxHeight = tokenPx(knobProps.sizeToken, 24) * 16;
  const gradientHeight = tokenPx(knobProps.sizeToken, 24) * 8;
  const iconPx = tokenPx(knobProps.label.fontSize as string, 14, 'fontSize');
  const codeText = useMemo(() => extractCodeText(children).replace(/\n$/, ''), [children]);
  const language = useMemo(() => extractLanguage(className), [className]);
  const tokens = useShikiTokens(codeText, language);

  const lines = tokens?.length ?? codeText.split('\n').length;
  const showLineNumbers = propShowLineNumbers ?? lines > 10;
  const [isCollapsed, setIsCollapsed] = useState(isCollapsible);
  const isLong = lines > 22;
  const [isCutoff, setIsCutoff] = useState(isLong && !isCollapsible);
  const { hasCopied, onCopy } = useClipboard(codeText);

  const highlightLines = useMemo(() => {
    if (!isHighlightingLines || !line) {
      return [];
    }
    return rangeParser(line);
  }, [isHighlightingLines, line]);

  return (
    <YStack
      position="relative"
      marginBottom="$4">
      <ErrorBoundary>
        <YStack
          position="relative"
          {...(isCutoff && {
            maxHeight: cutoffMaxHeight,
            overflow: 'hidden',
            ...knobProps.borderRadiusOuter,
          })}>
          {(!isCollapsed || !isCollapsible) && isCutoff && (
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
                    setIsCutoff(false);
                  }}>
                  Show more
                </Button>
              </XStack>
            </>
          )}
          {(!isCollapsed || !isCollapsible) && (
            <Pre
              padding={0}
              marginBottom={0}
              id={id}
              data-line-numbers={showLineNumbers ? 'true' : 'false'}>
              <ScrollView
                style={{ width: '100%' }}
                contentContainerStyle={{ minWidth: '100%' }}
                horizontal
                showsHorizontalScrollIndicator={false}>
                <Code
                  backgroundColor="transparent"
                  flex={1}
                  borderWidth={0}
                  // SP-PAD + T-VALUE via sizeToken (spec MdxCodeBlock; LC-18):
                  // inset rides the space knob, content type rides the size
                  // knob — components-CodeBlock parity. Explicit props eject.
                  {...knobProps.panelPadding}
                  size={(size ?? knobProps.sizeToken) as any}
                  {...codeProps}>
                  <HighlightedCode
                    tokens={tokens}
                    highlightLines={highlightLines}
                    showLineNumbers={showLineNumbers}>
                    {codeText}
                  </HighlightedCode>
                </Code>
              </ScrollView>
            </Pre>
          )}
          <XStack
            position="absolute"
            top="$3"
            insetInlineEnd="$3"
            {...knobProps.gap}>
            {(!isCollapsed || !isCollapsible) && !disableCopy && (
              <TooltipSimple label={hasCopied ? 'Copied' : 'Copy to clipboard'}>
                <Button
                  aria-label="Copy code to clipboard"
                  size="$2"
                  icon={hasCopied ? <CheckCircleIcon size={iconPx} /> : <ClipboardIcon size={iconPx} />}
                  onPress={onCopy}
                  $max-xs={{
                    display: 'none',
                  }}
                />
              </TooltipSimple>
            )}
            {isCollapsible && (
              <Button
                aria-label="Show or hide code"
                size="$2"
                onPress={() => {
                  setIsCollapsed((x) => !x);
                }}>
                {isCollapsed ? 'Show code' : 'Hide code'}
              </Button>
            )}
          </XStack>
        </YStack>
      </ErrorBoundary>
    </YStack>
  );
}
