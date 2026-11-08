import { Link } from '@repo/router';
import { FOCUS_RING_HALO_OFFSET, useResolvedKnobs } from '@repo/theme';
import { CodeInline, unwrapText } from '@repo/ui';
import type { MDXComponents } from 'mdx/types';
import { Children, isValidElement } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import type { GetProps, ParagraphProps, XStackProps, YStackProps } from 'tamagui';
import { H1, H2, H3, H4, H5, H6, Paragraph, Text, XStack, YStack, isWeb, styled } from 'tamagui';

import { MarkdownImage } from './components/Image';
import { MarkdownList, MarkdownListItem } from './components/List';
import { ExternalIcon } from './ExternalIcon';
import { HR as Hr } from './Hr';
import { LinkIcon } from './icons';
import { MDXCodeBlock } from './MdxCodeBlock';
import type { MDXCodeBlockProps } from './MdxCodeBlock';
import { tokenPx } from './shared/token-px';
import { MDXTable, MDXTableBody, MDXTableCell, MDXTableHead, MDXTableHeaderCell, MDXTableRow } from './Table';

/**
 * Props MDX hands the `code` mapping: the code element's props plus the
 * fence's meta attributes (`line`, `showLineNumbers`, ...).
 */
type MdxCodeProps = Omit<MDXCodeBlockProps, 'showLineNumbers' | 'isHighlightingLines'> & {
  hero?: unknown;
  scrollable?: unknown;
  collapsible?: unknown;
  showLineNumbers?: unknown;
  line?: string;
};

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
}: MdxCodeProps) => {
  if (className === undefined || className === '') {
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

// SAFETY: sizeToken is a `$n` size stop, a valid Paragraph size variant
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
const paragraphSize = (sizeToken: string) => sizeToken as ParagraphProps['size'];

const MdxBlockquote = ({ children, ...props }: Omit<YStackProps, 'children'> & { children?: ReactNode }) => {
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
            },
          }
        : { style: { marginInlineStart: inset }, borderStartWidth: railWidth })}
      borderColor="$borderColor"
      justifyContent="center"
      {...props}>
      <Paragraph
        whiteSpace="revert"
        size={paragraphSize(knobProps.sizeToken)}
        {...knobProps.body}
        color="$color"
        opacity={0.65}>
        {unwrapText(children)}
      </Paragraph>
    </YStack>
  );
};

const LinkHeading = ({ id, children, ...props }: { id?: string } & XStackProps) => {
  const { knobProps } = useResolvedKnobs();
  const iconPx = tokenPx(knobProps.label.fontSize, 12, 'fontSize');
  // XStack's props do not type the `a` render target's href, so it rides a spread
  const anchorProps = { href: `#${id}` };
  return (
    <XStack
      render="a"
      data-heading
      {...anchorProps}
      id={id}
      data-id={id}
      display="inline-flex"
      alignItems="center"
      {...knobProps.gapLg}
      {...props}>
      {children}
      <YStack
        render="span"
        opacity={0.3}>
        <LinkIcon size={iconPx} />
      </YStack>
    </XStack>
  );
};

const getNonTextChildren = (children: ReactNode) =>
  // oxlint-disable-next-line react/no-react-children -- toArray flattens nested arrays/fragments of heading children, which the anchor copy relies on
  Children.toArray(children).filter(
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- children is a ReactNode union; typeof is how its text arm is told apart
    (child) => typeof child !== 'string' && !(isValidElement(child) && child.type === code),
  );

type HeadingComponentProps = GetProps<typeof H1>;

type MdxHeadingProps = Omit<HeadingComponentProps, 'children'> & {
  children?: ReactNode;
  Component: typeof H1;
  dataHeading?: boolean;
  link?: boolean;
};

const MdxHeading = ({
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
}: MdxHeadingProps) => {
  const { knobProps } = useResolvedKnobs();
  const heading = (
    <Component
      maxWidth="100%"
      position="relative"
      width={link === true ? 'fit-content' : undefined}
      size={size}
      color={color}
      marginTop={link === true ? undefined : marginTop}
      marginBottom={link === true ? undefined : marginBottom}
      {...(dataHeading === true ? { 'data-heading': true } : {})}
      {...knobProps.heading}
      {...props}>
      {children}
    </Component>
  );
  if (link !== true) {
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
};

const MdxAnchor = ({ href = '', children, ...props }: { href?: string; children?: ReactNode }) => {
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
        {href.startsWith('http') ? (
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
};

const MdxStrong = (props: ParagraphProps) => {
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
};

const MdxP = (props: ParagraphProps) => {
  const { knobProps } = useResolvedKnobs();
  return (
    <Paragraph
      render="p"
      display="block"
      size={paragraphSize(knobProps.sizeToken)}
      marginVertical="$2"
      {...knobProps.body}
      {...props}
    />
  );
};

const MdxList = ({ ordered, children, start }: { ordered: boolean; children?: ReactNode; start?: number }) => (
  <MarkdownList
    ordered={ordered}
    start={start}>
    {/* oxlint-disable-next-line react/no-react-children -- toArray flattens MDX list children so the whitespace text between items can be dropped */}
    {Children.toArray(children).map((child): ReactNode =>
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- children is a ReactNode union; typeof is how its whitespace-text arm is told apart
      typeof child === 'string' ? null : child,
    )}
  </MarkdownList>
);

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
      width="fit-content"
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
      width="fit-content"
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
  hr: (props) => <Hr {...props} />,
  ul: ({ children }) => <MdxList ordered={false}>{children}</MdxList>,
  ol: ({ children, start }: ComponentProps<'ol'>) => (
    <MdxList
      ordered
      start={start}>
      {children}
    </MdxList>
  ),
  li: ({ children }) => <MarkdownListItem>{children}</MarkdownListItem>,
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
  img: ({ src = '', alt, title, ...props }: ComponentProps<'img'>) => (
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
  pre: ({ children }: ComponentProps<'pre'>): ReactNode => children,
  code,
  blockquote: (props) => <MdxBlockquote {...props} />,
  table: (props) => <MDXTable {...props} />,
  thead: (props) => <MDXTableHead {...props} />,
  tbody: (props) => <MDXTableBody {...props} />,
  tr: (props) => <MDXTableRow {...props} />,
  th: (props) => <MDXTableHeaderCell {...props} />,
  td: (props) => <MDXTableCell {...props} />,
};
