import { CodeInline, unwrapText } from '@repo/ui';
import { Link } from '@repo/router';
import { FOCUS_RING_HALO_OFFSET, useResolvedKnobs } from '@repo/theme';
import type { MDXComponents } from 'mdx/types';
import { Children } from 'react';
import type { XStackProps } from 'tamagui';
import { H1, H2, H3, H4, H5, H6, Paragraph, Text, XStack, YStack, isWeb, styled } from 'tamagui';

import { MarkdownImage } from './components/Image';
import { MarkdownList, MarkdownListItem } from './components/List';
import { ExternalIcon } from './ExternalIcon';
import { HR } from './Hr';
import { LinkIcon } from './icons';
import { MDXCodeBlock } from './MdxCodeBlock';
import { tokenPx } from './shared/tokenPx';
import { MDXTable, MDXTableBody, MDXTableCell, MDXTableHead, MDXTableHeaderCell, MDXTableRow } from './Table';

const code = ({
  hero: _hero,
  line,
  scrollable: _scrollable,
  className,
  children,
  id: _id,
  showLineNumbers,
  collapsible: _collapsible,
  ...props
}: any) => {
  if (!className) {
    return <CodeInline>{unwrapText(children)}</CodeInline>;
  }
  return (
    <YStack marginTop="$3">
      <MDXCodeBlock
        className={className}
        isHighlightingLines={line !== undefined}
        showLineNumbers={showLineNumbers !== undefined}
        line={line}
        {...props}>
        {children}
      </MDXCodeBlock>
    </YStack>
  );
};

export const TableHighlight = styled(YStack, {
  name: 'TableHighlight',
  backgroundColor: '$yellow1',
  fullscreen: true,
});

export type TableHighlightProps = React.ComponentProps<typeof TableHighlight>;

function MdxBlockquote({ children, ...props }: any) {
  const { knobProps } = useResolvedKnobs();
  const railWidth = knobProps.borderRadius.borderWidth;
  const inset = knobProps.panelPadding.padding;
  return (
    <YStack
      marginVertical="$4"
      paddingHorizontal={inset}
      // Logical start rail so the quote mirrors in RTL; tamagui
      // borderStartWidth does not compile to working CSS on web (SB-M-1215)
      {...(isWeb
        ? {
            style: {
              marginInlineStart: inset,
              borderInlineStartWidth: railWidth,
              borderInlineStartStyle: railWidth ? 'solid' : 'none',
            } as any,
          }
        : { style: { marginInlineStart: inset }, borderStartWidth: railWidth })}
      borderColor="$borderColor"
      justifyContent="center"
      {...props}>
      <Paragraph
        whiteSpace="revert"
        size={knobProps.sizeToken as any}
        {...knobProps.body}
        color="$color"
        opacity={0.65}>
        {unwrapText(children)}
      </Paragraph>
    </YStack>
  );
}

function MdxHeading({
  Component,
  children,
  id,
  size,
  color,
  marginTop,
  marginBottom,
  dataHeading,
  link,
  ...props
}: {
  Component: typeof H1;
  children?: any;
  id?: string;
  size?: any;
  color?: string;
  marginTop?: any;
  marginBottom?: any;
  dataHeading?: boolean;
  link?: boolean;
} & Record<string, unknown>) {
  const { knobProps } = useResolvedKnobs();
  const heading = (
    <Component
      maxWidth="100%"
      position="relative"
      width={link ? ('fit-content' as any) : undefined}
      size={size}
      color={color}
      marginTop={link ? undefined : marginTop}
      marginBottom={link ? undefined : marginBottom}
      {...(dataHeading ? { 'data-heading': true } : {})}
      {...knobProps.heading}
      {...props}>
      {children}
    </Component>
  );
  if (!link) {
    return heading;
  }
  return (
    <LinkHeading
      data-heading
      marginTop={marginTop}
      marginBottom={marginBottom}
      id={id}>
      {heading}
      {getNonTextChildren(children)}
    </LinkHeading>
  );
}

function MdxAnchor({ href = '', children, ...props }: { href?: string; children?: any }) {
  const { knobProps } = useResolvedKnobs();
  return (
    <Link href={href}>
      <Paragraph
        // the router Link already renders the anchor; a nested <a> is invalid
        render="span"
        fontSize="inherit"
        display="inline"
        cursor="pointer"
        {...knobProps.body}
        focusVisibleStyle={{
          outlineColor: '$outlineColor',
          outlineWidth: 2,
          outlineStyle: 'solid',
          // LC-71 §4 halo: inline text link. Offset 0 puts the band across the
          // line box, into the ascenders/descenders of the surrounding prose.
          outlineOffset: FOCUS_RING_HALO_OFFSET,
        }}
        {...props}>
        {children}
        {typeof href === 'string' && href.startsWith('http') ? (
          <>
            &nbsp;
            <Text
              fontSize="inherit"
              display="inline-flex"
              y={2}
              style={{ marginLeft: -1 }}>
              <ExternalIcon />
            </Text>
          </>
        ) : null}
      </Paragraph>
    </Link>
  );
}

function MdxStrong(props: any) {
  const { knobProps } = useResolvedKnobs();
  return (
    <Paragraph
      render="strong"
      fontSize="inherit"
      {...knobProps.body}
      {...props}
      fontWeight="700"
    />
  );
}

function MdxP(props: any) {
  const { knobProps } = useResolvedKnobs();
  return (
    <Paragraph
      render="p"
      display="block"
      size={knobProps.sizeToken as any}
      marginVertical="$2"
      {...knobProps.body}
      {...props}
    />
  );
}

function MdxList({ ordered, children, start }: { ordered: boolean; children?: any; start?: number }) {
  return (
    <MarkdownList
      ordered={ordered}
      start={start}>
      {Children.toArray(children).map((child) => (typeof child === 'string' ? null : child))}
    </MarkdownList>
  );
}

export const mdxComponents: MDXComponents = {
  h1: (props) => (
    <MdxHeading
      Component={H1}
      width="max-content"
      marginBottom="$2"
      {...props}
    />
  ),
  h2: ({ children, ...props }) => (
    <MdxHeading
      Component={H2}
      dataHeading
      width={'fit-content' as any}
      size="$9"
      color="$color12"
      marginTop="$8"
      marginBottom="$4"
      {...props}>
      {children}
    </MdxHeading>
  ),
  h3: (props) => (
    <MdxHeading
      Component={H3}
      link
      dataHeading
      size="$8"
      color="$color11"
      marginTop="$6"
      marginBottom="$2"
      {...props}
    />
  ),
  h4: (props) => (
    <MdxHeading
      Component={H4}
      dataHeading
      width={'fit-content' as any}
      size="$8"
      color="$color8"
      marginTop="$8"
      marginBottom="$2"
      {...props}
    />
  ),
  h5: (props) => (
    <MdxHeading
      Component={H5}
      size="$6"
      marginTop="$4"
      {...props}
    />
  ),
  h6: (props) => (
    <MdxHeading
      Component={H6}
      marginTop="$4"
      {...props}
    />
  ),
  p: (props) => <MdxP {...props} />,
  a: (props) => <MdxAnchor {...props} />,
  hr: (props) => <HR {...props} />,
  ul: ({ children }) => <MdxList ordered={false}>{children}</MdxList>,
  ol: ({ children, start }: any) => (
    <MdxList
      ordered
      start={typeof start === 'number' ? start : Number(start) || undefined}>
      {children}
    </MdxList>
  ),
  li: (props) => <MarkdownListItem>{props.children}</MarkdownListItem>,
  strong: (props) => <MdxStrong {...props} />,
  em: (props) => (
    <Paragraph
      render="em"
      fontSize="inherit"
      {...props}
      fontStyle="italic"
    />
  ),
  del: (props) => (
    <Paragraph
      render="del"
      fontSize="inherit"
      {...props}
      textDecorationLine="line-through"
    />
  ),
  img: ({ src, alt, title, ...props }: any) => (
    <YStack
      render="span"
      marginVertical="$6">
      <MarkdownImage
        src={src}
        alt={alt}
        title={title}
        {...props}
      />
    </YStack>
  ),
  pre: ({ children }) => <>{children}</>,
  code: code as any,
  blockquote: MdxBlockquote,
  table: (props) => <MDXTable {...props} />,
  thead: (props) => <MDXTableHead {...props} />,
  tbody: (props) => <MDXTableBody {...props} />,
  tr: (props) => <MDXTableRow {...props} />,
  th: (props) => <MDXTableHeaderCell {...props} />,
  td: (props) => <MDXTableCell {...props} />,
};

const LinkHeading = ({ id, children, ...props }: { id?: string } & XStackProps) => {
  const { knobProps } = useResolvedKnobs();
  const iconPx = tokenPx(knobProps.label.fontSize as string, 12, 'fontSize');
  return (
    <XStack
      render="a"
      data-heading
      href={`#${id}`}
      id={id}
      data-id={id}
      display="inline-flex"
      alignItems="center"
      {...knobProps.gapLg}
      {...(props as any)}>
      {children}
      <YStack
        render="span"
        opacity={0.3}>
        <LinkIcon size={iconPx} />
      </YStack>
    </XStack>
  );
};

const getNonTextChildren = (children: any) =>
  Children.map(children, (x) => {
    if (typeof x === 'string') {
      return null;
    }
    if (x?.type === code) {
      return null;
    }
    return x;
  })?.flat();
