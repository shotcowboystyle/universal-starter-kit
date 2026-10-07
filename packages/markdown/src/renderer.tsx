import type {
  Root,
  Heading as HeadingNode,
  Paragraph as ParagraphNode,
  Text as TextNode,
  Emphasis as EmphasisNode,
  Strong as StrongNode,
  Delete as DeleteNode,
  InlineCode as InlineCodeNode,
  Code as CodeNode,
  Link as LinkNode,
  Image as ImageNode,
  List as ListNode,
  ListItem as ListItemNode,
  Blockquote as BlockquoteNode,
  ThematicBreak,
  Table as TableNode,
  TableRow as TableRowNode,
  TableCell as TableCellNode,
  Html as HtmlNode,
  Break as BreakNode,
} from 'mdast';
/**
 * Markdown AST Renderer
 * Walks the mdast tree and renders React components
 */
import type { ReactNode } from 'react';
import { Text, View, isWeb } from 'tamagui';

import {
  Heading,
  Paragraph,
  Strong,
  Emphasis,
  Strikethrough,
  InlineCode,
  CodeBlock,
  Link,
  MarkdownImage,
  MarkdownList,
  MarkdownListItem,
  Blockquote,
  HorizontalRule,
  MarkdownTable,
  MarkdownTableRow,
  MarkdownTableCell,
  Break,
} from './components';
import { MermaidBlock } from './mermaid/MermaidBlock';
import type { BundledTheme } from './shiki';
import type { MarkdownComponents } from './types';

type AnyNode =
  | Root
  | HeadingNode
  | ParagraphNode
  | TextNode
  | EmphasisNode
  | StrongNode
  | DeleteNode
  | InlineCodeNode
  | CodeNode
  | LinkNode
  | ImageNode
  | ListNode
  | ListItemNode
  | BlockquoteNode
  | ThematicBreak
  | TableNode
  | TableRowNode
  | TableCellNode
  | HtmlNode
  | BreakNode
  | { type: string; children?: AnyNode[]; value?: string };

interface RenderOptions {
  components?: Partial<MarkdownComponents>;
  codeTheme?: BundledTheme | 'auto';
  listContext?: {
    ordered: boolean;
    index: number;
    start?: number;
  };
}

/**
 * Render a single AST node to React elements
 */
export function renderNode(node: AnyNode, key: number | string, options: RenderOptions = {}): ReactNode {
  const { components = {}, codeTheme, listContext } = options;

  switch (node.type) {
    case 'root': {
      return renderChildren(node as Root, options);
    }

    case 'heading': {
      const heading = node as HeadingNode;
      const CustomHeading = components[`h${heading.depth}` as keyof MarkdownComponents] as
        | React.ComponentType<import('./types').HeadingProps>
        | undefined;
      if (CustomHeading) {
        return (
          <CustomHeading
            key={key}
            level={heading.depth}>
            {renderChildren(heading, options)}
          </CustomHeading>
        );
      }
      return (
        <Heading
          key={key}
          level={heading.depth}>
          {renderChildren(heading, options)}
        </Heading>
      );
    }

    case 'paragraph': {
      const para = node as ParagraphNode;
      const CustomP = components.p;
      if (CustomP) {
        return <CustomP key={key}>{renderChildren(para, options)}</CustomP>;
      }
      return <Paragraph key={key}>{renderChildren(para, options)}</Paragraph>;
    }

    case 'text': {
      const textNode = node as TextNode;
      return textNode.value;
    }

    case 'strong': {
      const strongNode = node as StrongNode;
      const CustomStrong = components.strong;
      if (CustomStrong) {
        return <CustomStrong key={key}>{renderChildren(strongNode, options)}</CustomStrong>;
      }
      return <Strong key={key}>{renderChildren(strongNode, options)}</Strong>;
    }

    case 'emphasis': {
      const emNode = node as EmphasisNode;
      const CustomEm = components.em;
      if (CustomEm) {
        return <CustomEm key={key}>{renderChildren(emNode, options)}</CustomEm>;
      }
      return <Emphasis key={key}>{renderChildren(emNode, options)}</Emphasis>;
    }

    case 'delete': {
      const delNode = node as DeleteNode;
      const CustomDel = components.del;
      if (CustomDel) {
        return <CustomDel key={key}>{renderChildren(delNode, options)}</CustomDel>;
      }
      return <Strikethrough key={key}>{renderChildren(delNode, options)}</Strikethrough>;
    }

    case 'inlineCode': {
      const inlineCodeNode = node as InlineCodeNode;
      const CustomInlineCode = components.inlineCode;
      if (CustomInlineCode) {
        return <CustomInlineCode key={key}>{inlineCodeNode.value}</CustomInlineCode>;
      }
      return <InlineCode key={key}>{inlineCodeNode.value}</InlineCode>;
    }

    case 'code': {
      const codeNode = node as CodeNode;
      const CustomCode = components.code;
      if (CustomCode) {
        return (
          <CustomCode
            key={key}
            lang={codeNode.lang}
            meta={codeNode.meta}>
            {codeNode.value}
          </CustomCode>
        );
      }
      // ```mermaid fences render as live diagrams (GitLab parity); the
      // engine lazy-loads on first diagram, native falls back to code.
      if (codeNode.lang === 'mermaid') {
        return <MermaidBlock key={key}>{codeNode.value}</MermaidBlock>;
      }
      return (
        <CodeBlock
          key={key}
          lang={codeNode.lang}
          theme={codeTheme}>
          {codeNode.value}
        </CodeBlock>
      );
    }

    case 'link': {
      const linkNode = node as LinkNode;
      const CustomLink = components.a;
      if (CustomLink) {
        return (
          <CustomLink
            key={key}
            href={linkNode.url}
            title={linkNode.title}>
            {renderChildren(linkNode, options)}
          </CustomLink>
        );
      }
      return (
        <Link
          key={key}
          href={linkNode.url}
          title={linkNode.title}>
          {renderChildren(linkNode, options)}
        </Link>
      );
    }

    case 'image': {
      const imgNode = node as ImageNode;
      const CustomImg = components.img;
      if (CustomImg) {
        return (
          <CustomImg
            key={key}
            src={imgNode.url}
            alt={imgNode.alt}
            title={imgNode.title}
          />
        );
      }
      return (
        <MarkdownImage
          key={key}
          src={imgNode.url}
          alt={imgNode.alt}
          title={imgNode.title}
        />
      );
    }

    case 'list': {
      const listNode = node as ListNode;
      const CustomList = listNode.ordered ? components.ol : components.ul;
      const listChildren = listNode.children.map((child, i) =>
        renderNode(child, i, {
          ...options,
          listContext: {
            ordered: listNode.ordered ?? false,
            index: i,
            start: listNode.start ?? undefined,
          },
        }),
      );
      if (CustomList) {
        return (
          <CustomList
            key={key}
            ordered={listNode.ordered ?? false}
            start={listNode.start}>
            {listChildren}
          </CustomList>
        );
      }
      return (
        <MarkdownList
          key={key}
          ordered={listNode.ordered ?? false}
          start={listNode.start}>
          {listChildren}
        </MarkdownList>
      );
    }

    case 'listItem': {
      const liNode = node as ListItemNode;
      const CustomLi = components.li;
      if (CustomLi) {
        return (
          <CustomLi
            key={key}
            checked={liNode.checked}>
            {renderChildren(liNode, options)}
          </CustomLi>
        );
      }
      return (
        <MarkdownListItem
          key={key}
          checked={liNode.checked}
          index={listContext?.index}
          ordered={listContext?.ordered}
          start={listContext?.start}>
          {renderChildren(liNode, options)}
        </MarkdownListItem>
      );
    }

    case 'blockquote': {
      const bqNode = node as BlockquoteNode;
      const CustomBq = components.blockquote;
      if (CustomBq) {
        return <CustomBq key={key}>{renderChildren(bqNode, options)}</CustomBq>;
      }
      return <Blockquote key={key}>{renderChildren(bqNode, options)}</Blockquote>;
    }

    case 'thematicBreak': {
      const CustomHr = components.hr;
      if (CustomHr) {
        return <CustomHr key={key} />;
      }
      return <HorizontalRule key={key} />;
    }

    case 'table': {
      const tableNode = node as TableNode;
      const CustomTable = components.table;
      const tableChildren = tableNode.children.map((row, i) =>
        renderTableRow(row, i, i === 0, tableNode.align, options),
      );
      if (CustomTable) {
        return <CustomTable key={key}>{tableChildren}</CustomTable>;
      }
      return <MarkdownTable key={key}>{tableChildren}</MarkdownTable>;
    }

    case 'html': {
      const htmlNode = node as HtmlNode;
      // Render HTML on web, drop on native
      if (isWeb) {
        return (
          <div
            key={key}
            dangerouslySetInnerHTML={{ __html: htmlNode.value }}
          />
        );
      }
      // On native, skip HTML nodes
      return null;
    }

    case 'break': {
      const CustomBr = components.br;
      if (CustomBr) {
        return <CustomBr key={key} />;
      }
      return <Break key={key} />;
    }

    default: {
      // Handle unknown nodes - try to render children if they exist. Inline
      // nodes such as `text` render as raw strings, and a View cannot hold a
      // bare string on native or react-native-web ("A text node cannot be a
      // child of a <View>", a console error on every paint), so any string
      // child gets a Text wrapper here.
      if ('children' in node && Array.isArray(node.children)) {
        return (
          <View key={key}>
            {node.children.map((child: AnyNode, i: number) => {
              const rendered = renderNode(child, i, options);
              return typeof rendered === 'string' ? <Text key={i}>{rendered}</Text> : rendered;
            })}
          </View>
        );
      }
      // Unknown leaf node
      if ('value' in node && typeof node.value === 'string') {
        return <Text key={key}>{node.value}</Text>;
      }
      return null;
    }
  }
}

/**
 * Render table row with header detection
 */
function renderTableRow(
  row: TableRowNode,
  key: number,
  isHeader: boolean,
  align: ('left' | 'center' | 'right' | null)[] | null | undefined,
  options: RenderOptions,
): ReactNode {
  const CustomTr = options.components?.tr;
  const cells = row.children.map((cell, i) => renderTableCell(cell, i, isHeader, align?.[i] ?? null, options));

  if (CustomTr) {
    return (
      <CustomTr
        key={key}
        isHeader={isHeader}>
        {cells}
      </CustomTr>
    );
  }
  return (
    <MarkdownTableRow
      key={key}
      isHeader={isHeader}>
      {cells}
    </MarkdownTableRow>
  );
}

/**
 * Render table cell
 */
function renderTableCell(
  cell: TableCellNode,
  key: number,
  isHeader: boolean,
  align: 'left' | 'center' | 'right' | null,
  options: RenderOptions,
): ReactNode {
  const CustomTd = isHeader ? options.components?.th : options.components?.td;
  const children = renderChildren(cell, options);

  if (CustomTd) {
    return (
      <CustomTd
        key={key}
        isHeader={isHeader}
        align={align}>
        {children}
      </CustomTd>
    );
  }
  return (
    <MarkdownTableCell
      key={key}
      isHeader={isHeader}
      align={align}>
      {children}
    </MarkdownTableCell>
  );
}

/**
 * Render all children of a parent node
 */
function renderChildren(node: { children?: AnyNode[] }, options: RenderOptions): ReactNode[] {
  if (!node.children) {
    return [];
  }
  return node.children.map((child, i) => renderNode(child, i, options));
}

/**
 * Render a complete markdown AST to React elements
 */
export function renderMarkdown(root: Root, options: RenderOptions = {}): ReactNode {
  return <View gap="$1">{root.children.map((child, i) => renderNode(child as AnyNode, i, options))}</View>;
}
