import { useResolvedKnobs } from '@repo/theme';
import { Code, ErrorBoundary, HighlightedCode, Pre, useClipboard, useShikiTokens, ScrollView } from '@repo/ui';
import type { CodeProps } from '@repo/ui';
import { LinearGradient } from '@tamagui/linear-gradient';
import rangeParser from 'parse-numeric-range';
import type { ReactNode } from 'react';
import { isValidElement, useContext, useMemo, useState } from 'react';
import { Button, TooltipSimple, XStack, YStack } from 'tamagui';

import { CheckCircleIcon, ClipboardIcon } from '../icons';
import { useCutoffGradientColors } from '../shared/cutoff-gradient';
import { tokenPx } from '../shared/token-px';

import type { MDXCodeBlockContextValue } from './mdx-code-block-context';
import { MDXCodeBlockContext } from './mdx-code-block-context';

const zIndex = { localTop: 100 };
const LANGUAGE_CLASS_REGEX = /language-(?<language>\w+)/u;
const TRAILING_NEWLINE_REGEX = /\n$/u;

export interface MDXCodeBlockProps extends MDXCodeBlockContextValue {
  className?: string;
  id?: string;
  /** Line ranges to highlight (code fence `line` meta, e.g. "1-3,5"). */
  line?: string;
}

/**
 * Extract raw code text from MDX children.
 * Children are typically a plain string, but this handles nested elements for safety.
 */
const extractCodeText = (children: ReactNode): string => {
  if (Array.isArray(children)) {
    return children.map(extractCodeText).join('');
  }
  if (isValidElement<{ children?: ReactNode }>(children)) {
    return extractCodeText(children.props.children);
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- discriminates the ReactNode union: only primitives carry code text
  if (typeof children === 'string' || typeof children === 'number' || typeof children === 'bigint') {
    return String(children);
  }
  return '';
};

/**
 * Extract language from className like "language-tsx" -> "tsx"
 */
const extractLanguage = (className?: string): string =>
  LANGUAGE_CLASS_REGEX.exec(className ?? '')?.groups?.language ?? 'text';

export const MDXCodeBlock = (props: MDXCodeBlockProps) => {
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
  }: MDXCodeBlockProps = { ...useContext(MDXCodeBlockContext), ...props };

  const { knobProps } = useResolvedKnobs();
  const gradientColors = useCutoffGradientColors();
  const cutoffMaxHeight = tokenPx(knobProps.sizeToken, 24) * 16;
  const gradientHeight = tokenPx(knobProps.sizeToken, 24) * 8;
  const iconPx = tokenPx(knobProps.label.fontSize, 14, 'fontSize');
  const codeText = useMemo(() => extractCodeText(children).replace(TRAILING_NEWLINE_REGEX, ''), [children]);
  const language = useMemo(() => extractLanguage(className), [className]);
  const tokens = useShikiTokens(codeText, language);

  const lines = tokens?.length ?? codeText.split('\n').length;
  const showLineNumbers = propShowLineNumbers ?? lines > 10;
  const [isCollapsed, setIsCollapsed] = useState(isCollapsible);
  const isLong = lines > 22;
  const [isCutoff, setIsCutoff] = useState(isLong && !isCollapsible);
  const { hasCopied, onCopy } = useClipboard(codeText);

  const highlightLines = useMemo(() => {
    if (isHighlightingLines !== true || line === undefined || line === '') {
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
            ...knobProps.borderRadiusNested,
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
                  // SAFETY: sizeToken is a `$n` size stop, a valid Code size variant
                  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
                  size={size ?? (knobProps.sizeToken as CodeProps['size'])}
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
                  onPress={() => {
                    void onCopy();
                  }}
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
};
