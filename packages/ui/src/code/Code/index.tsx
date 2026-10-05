import { useResolvedKnobs } from '@repo/theme';
import type { CSSProperties } from 'react';
import type { GetProps } from 'tamagui';
import { Paragraph, styled } from 'tamagui';

import { componentColors } from '../../componentColors';

const CodeFrame = styled(Paragraph, {
  name: 'Code',
  render: 'code',
  fontFamily: '$mono',
  size: '$3',
  cursor: 'inherit',
  whiteSpace: 'pre',
  padding: '$1',
  borderRadius: '$4',

  variants: {
    colored: {
      true: {
        color: '$color',
        backgroundColor: '$background',
      },
    },
  } as const,
});

export const Code = CodeFrame.styleable((props, ref) => {
  const { knobProps } = useResolvedKnobs();
  // Code content is always the mono code font with normal tracking — the
  // bodyFont/fontWeight knobs must never restyle code text, and
  // $mono's own size-scale letterSpacing (3px at $5) is display tracking,
  // not code. Type scale still follows the size knob (via
  // sizeToken) — the immunity covers font knobs only.
  return (
    <CodeFrame
      ref={ref}
      {...knobProps.borderRadius}
      size={knobProps.sizeToken as CodeProps['size']}
      {...props}
      fontFamily="$mono"
      letterSpacing={0}
      data-code-font="mono"
    />
  );
});

const CodeInlineFrame = styled(Paragraph, {
  name: 'CodeInline',
  render: 'code',
  fontFamily: '$mono',
  // letter-spacing inherits in CSS: without this pin, inline code picks up
  // the surrounding prose tracking (font-knob condensed curves included)
  // while block code stays immune. Code text is always normal-tracked mono.
  letterSpacing: 0,
  color: componentColors.code.foreground,
  backgroundColor: componentColors.code.background,
  cursor: 'inherit',
  borderRadius: '$3',
  // Pin (dial: surrounding prose): 0.9× size / 0.7× leading. Size reaches
  // the chip through context, not sizeToken. Lettered in spec § Code and
  // CodeInline; these ratios are the house metrics already shipping.
  fontSize: '90%' as CSSProperties['fontSize'],
  lineHeight: '70%' as CSSProperties['lineHeight'],
  paddingHorizontal: '0.6%',
  paddingVertical: '0.45%',
  marginHorizontal: '-0.1%',
  whiteSpace: 'pre',
});

// Inline code sizes relative to the surrounding prose (percentage font), so
// the size knob reaches it through its context; only the radius surface is
// owned chrome (R-SCALE, spec "Code and CodeInline").
export const CodeInline = CodeInlineFrame.styleable((props, ref) => {
  const { knobProps } = useResolvedKnobs();
  return (
    <CodeInlineFrame
      ref={ref}
      {...knobProps.borderRadius}
      borderWidth={0}
      {...props}
      fontFamily="$mono"
      letterSpacing={0}
      data-code-font="mono"
    />
  );
});

export type CodeProps = GetProps<typeof CodeFrame>;

export type CodeInlineProps = GetProps<typeof CodeInlineFrame>;
