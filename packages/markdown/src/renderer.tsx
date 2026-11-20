/**
 * Markdown AST Renderer
 * Walks the mdast tree and renders React components
 */
import type {
  AlignType,
  Nodes,
  Root,
  Table as TableNode,
  TableCell as TableCellNode,
  TableRow as TableRowNode,
} from 'mdast';
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

/** Any mdast node, plus node types this renderer does not know (remark plugins, future spec). */
type AnyNode = Nodes | { type: string; children?: AnyNode[]; value?: string };

interface RenderOptions {
  components?: Partial<MarkdownComponents>;
  codeTheme?: BundledTheme | 'auto';
  listContext?: {
    ordered: boolean;
    index: number;
    start?: number;
  };
}

type NodeKey = number | string;
type NodeRenderer = (node: AnyNode, key: NodeKey, options: RenderOptions) => ReactNode;

type HandledType =
  | 'root'
  | 'heading'
  | 'paragraph'
  | 'text'
  | 'strong'
  | 'emphasis'
  | 'delete'
  | 'inlineCode'
  | 'code'
  | 'link'
  | 'image'
  | 'list'
  | 'listItem'
  | 'blockquote'
  | 'thematicBreak'
  | 'table'
  | 'html'
  | 'break';

type NodeMap = { [T in HandledType]: Extract<Nodes, { type: T }> };
type HandlerMap = {
  [T in HandledType]: (node: NodeMap[T], key: NodeKey, options: RenderOptions, render: NodeRenderer) => ReactNode;
};

/**
 * Render all children of a parent node
 */
const renderChildren = (node: { children?: AnyNode[] }, options: RenderOptions, render: NodeRenderer): ReactNode[] => {
  if (!node.children) {
    return [];
  }
  return node.children.map((child, i): ReactNode => render(child, i, options));
};

/**
 * Render table cell
 */
const renderTableCell = (
  cell: TableCellNode,
  key: number,
  isHeader: boolean,
  align: AlignType,
  options: RenderOptions,
  render: NodeRenderer,
): ReactNode => {
  const CustomTd = isHeader ? options.components?.th : options.components?.td;
  const children = renderChildren(cell, options, render);

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
};

/**
 * Render table row with header detection
 */
const renderTableRow = (
  row: TableRowNode,
  key: number,
  isHeader: boolean,
  align: TableNode['align'],
  options: RenderOptions,
  render: NodeRenderer,
): ReactNode => {
  const CustomTr = options.components?.tr;
  const cells = row.children.map((cell, i): ReactNode =>
    renderTableCell(cell, i, isHeader, align?.[i] ?? null, options, render),
  );

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
};

const handlers: HandlerMap = {
  root: (node, _key, options, render) => renderChildren(node, options, render),

  heading: (heading, key, options, render) => {
    const CustomHeading = options.components?.[`h${heading.depth}` as const];
    if (CustomHeading) {
      return (
        <CustomHeading
          key={key}
          level={heading.depth}>
          {renderChildren(heading, options, render)}
        </CustomHeading>
      );
    }
    return (
      <Heading
        key={key}
        level={heading.depth}>
        {renderChildren(heading, options, render)}
      </Heading>
    );
  },

  paragraph: (para, key, options, render) => {
    const CustomP = options.components?.p;
    if (CustomP) {
      return <CustomP key={key}>{renderChildren(para, options, render)}</CustomP>;
    }
    return <Paragraph key={key}>{renderChildren(para, options, render)}</Paragraph>;
  },

  text: (textNode) => textNode.value,

  strong: (strongNode, key, options, render) => {
    const CustomStrong = options.components?.strong;
    if (CustomStrong) {
      return <CustomStrong key={key}>{renderChildren(strongNode, options, render)}</CustomStrong>;
    }
    return <Strong key={key}>{renderChildren(strongNode, options, render)}</Strong>;
  },

  emphasis: (emNode, key, options, render) => {
    const CustomEm = options.components?.em;
    if (CustomEm) {
      return <CustomEm key={key}>{renderChildren(emNode, options, render)}</CustomEm>;
    }
    return <Emphasis key={key}>{renderChildren(emNode, options, render)}</Emphasis>;
  },

  delete: (delNode, key, options, render) => {
    const CustomDel = options.components?.del;
    if (CustomDel) {
      return <CustomDel key={key}>{renderChildren(delNode, options, render)}</CustomDel>;
    }
    return <Strikethrough key={key}>{renderChildren(delNode, options, render)}</Strikethrough>;
  },

  inlineCode: (inlineCodeNode, key, options) => {
    const CustomInlineCode = options.components?.inlineCode;
    if (CustomInlineCode) {
      return <CustomInlineCode key={key}>{inlineCodeNode.value}</CustomInlineCode>;
    }
    return <InlineCode key={key}>{inlineCodeNode.value}</InlineCode>;
  },

  code: (codeNode, key, options) => {
    const CustomCode = options.components?.code;
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
        theme={options.codeTheme}>
        {codeNode.value}
      </CodeBlock>
    );
  },

  link: (linkNode, key, options, render) => {
    const CustomLink = options.components?.a;
    if (CustomLink) {
      return (
        <CustomLink
          key={key}
          href={linkNode.url}
          title={linkNode.title}>
          {renderChildren(linkNode, options, render)}
        </CustomLink>
      );
    }
    return (
      <Link
        key={key}
        href={linkNode.url}
        title={linkNode.title}>
        {renderChildren(linkNode, options, render)}
      </Link>
    );
  },

  image: (imgNode, key, options) => {
    const CustomImg = options.components?.img;
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
  },

  list: (listNode, key, options, render) => {
    const CustomList = listNode.ordered ? options.components?.ol : options.components?.ul;
    const listChildren = listNode.children.map((child, i): ReactNode =>
      render(child, i, {
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
  },

  listItem: (liNode, key, options, render) => {
    const CustomLi = options.components?.li;
    if (CustomLi) {
      return (
        <CustomLi
          key={key}
          checked={liNode.checked}>
          {renderChildren(liNode, options, render)}
        </CustomLi>
      );
    }
    const { listContext } = options;
    return (
      <MarkdownListItem
        key={key}
        checked={liNode.checked}
        index={listContext?.index}
        ordered={listContext?.ordered}
        start={listContext?.start}>
        {renderChildren(liNode, options, render)}
      </MarkdownListItem>
    );
  },

  blockquote: (bqNode, key, options, render) => {
    const CustomBq = options.components?.blockquote;
    if (CustomBq) {
      return <CustomBq key={key}>{renderChildren(bqNode, options, render)}</CustomBq>;
    }
    return <Blockquote key={key}>{renderChildren(bqNode, options, render)}</Blockquote>;
  },

  thematicBreak: (_node, key, options) => {
    const CustomHr = options.components?.hr;
    if (CustomHr) {
      return <CustomHr key={key} />;
    }
    return <HorizontalRule key={key} />;
  },

  table: (tableNode, key, options, render) => {
    const CustomTable = options.components?.table;
    const tableChildren = tableNode.children.map((row, i): ReactNode =>
      renderTableRow(row, i, i === 0, tableNode.align, options, render),
    );
    if (CustomTable) {
      return <CustomTable key={key}>{tableChildren}</CustomTable>;
    }
    return <MarkdownTable key={key}>{tableChildren}</MarkdownTable>;
  },

  html: (htmlNode, key) => {
    // Render HTML on web, drop on native
    if (isWeb) {
      return (
        <div
          key={key}
          // oxlint-disable-next-line react/no-danger -- raw HTML blocks in the markdown source render verbatim on web by design
          dangerouslySetInnerHTML={{ __html: htmlNode.value }}
        />
      );
    }
    // On native, skip HTML nodes
    return null;
  },

  break: (_node, key, options) => {
    const CustomBr = options.components?.br;
    if (CustomBr) {
      return <CustomBr key={key} />;
    }
    return <Break key={key} />;
  },
};

/**
 * A node whose `type` has a handler. Like the mdast types themselves, this
 * trusts the `type` discriminant to describe the node's shape.
 */
const isHandled = (node: AnyNode): node is NodeMap[HandledType] => Object.hasOwn(handlers, node.type);

const dispatch = <T extends HandledType>(
  type: T,
  node: NodeMap[T],
  key: NodeKey,
  options: RenderOptions,
  render: NodeRenderer,
): ReactNode => handlers[type](node, key, options, render);

/**
 * Render a single AST node to React elements
 */
export const renderNode = (node: AnyNode, key: NodeKey, options: RenderOptions = {}): ReactNode => {
  if (isHandled(node)) {
    return dispatch(node.type, node, key, options, renderNode);
  }

  // Handle unknown nodes - try to render children if they exist. Inline
  // nodes such as `text` render as raw strings, and a View cannot hold a
  // bare string on native or react-native-web ("A text node cannot be a
  // child of a <View>", a console error on every paint), so any string
  // child gets a Text wrapper here.
  if ('children' in node && Array.isArray(node.children)) {
    return (
      <View key={key}>
        {node.children.map((child: AnyNode, i: number): ReactNode => {
          const rendered = renderNode(child, i, options);
          // oxlint-disable-next-line anti-slop/no-runtime-typeof -- ReactNode is a union; only a bare string child needs the Text wrapper
          return typeof rendered === 'string' ? (
            // oxlint-disable-next-line react-doctor/no-array-index-as-key -- AST children are positional parse output with no identity
            <Text key={i}>{rendered}</Text>
          ) : (
            rendered
          );
        })}
      </View>
    );
  }
  // Unknown leaf node
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- unknown nodes come from arbitrary remark plugins; only a string value is renderable text
  if ('value' in node && typeof node.value === 'string') {
    return <Text key={key}>{node.value}</Text>;
  }
  return null;
};

/**
 * Render a complete markdown AST to React elements
 */
export const renderMarkdown = (root: Root, options: RenderOptions = {}): ReactNode => (
  <View gap="$1">{root.children.map((child, i): ReactNode => renderNode(child, i, options))}</View>
);
