/**
 * Renderer contract specs — the mdast → React pipeline consumers hit through
 * `<Markdown>` / `renderMarkdown`. Locks down: every markdown construct maps
 * to real DOM semantics, custom component overrides win over the built-ins,
 * unsafe link protocols are stripped, and unknown nodes degrade gracefully.
 */

import { renderWithProviders } from '@repo/test-utils';
import { Text, View } from 'tamagui';
import { describe, expect, it } from 'vitest';

import { parseMarkdown } from './parser';
import { renderMarkdown, renderNode } from './renderer';
import type { CodeBlockProps, MarkdownComponents } from './types';

const renderDoc = (markdown: string, components?: Partial<MarkdownComponents>) => {
  const ast = parseMarkdown(markdown);
  return renderWithProviders(<>{renderMarkdown(ast, { components })}</>);
};

describe('renderMarkdown — default component semantics', () => {
  it('renders headings at every depth as real h1–h6 elements', () => {
    const { container } = renderDoc(
      ['# one', '## two', '### three', '#### four', '##### five', '###### six'].join('\n\n'),
    );
    for (const [tag, text] of [
      ['h1', 'one'],
      ['h2', 'two'],
      ['h3', 'three'],
      ['h4', 'four'],
      ['h5', 'five'],
      ['h6', 'six'],
    ] as const) {
      const el = container.querySelector(tag);
      expect(el, tag).toBeTruthy();
      expect(el!.textContent).toBe(text);
    }
  });

  it('renders paragraph text with strong/em/del inline semantics', () => {
    const { container } = renderDoc('plain **bold** *italic* ~~gone~~');
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('em')?.textContent).toBe('italic');
    expect(container.querySelector('del')?.textContent).toBe('gone');
    expect(container.textContent).toContain('plain');
  });

  it('renders inline code through a real <code> element', () => {
    const { container } = renderDoc('run `pnpm test` now');
    const code = container.querySelector('code');
    expect(code).toBeTruthy();
    expect(code!.textContent).toBe('pnpm test');
  });

  it('renders links as anchors with href and external target/rel', () => {
    const { container } = renderDoc('[docs](https://example.com "Docs")');
    const anchor = container.querySelector('a');
    expect(anchor).toBeTruthy();
    expect(anchor!.getAttribute('href')).toBe('https://example.com');
    expect(anchor!.getAttribute('target')).toBe('_blank');
    expect(anchor!.getAttribute('rel')).toBe('noopener noreferrer');
    expect(anchor!.getAttribute('title')).toBe('Docs');
    expect(anchor!.textContent).toBe('docs');
  });

  it('keeps relative links same-tab without target/rel', () => {
    const { container } = renderDoc('[guide](/docs/guide)');
    const anchor = container.querySelector('a');
    expect(anchor!.getAttribute('href')).toBe('/docs/guide');
    expect(anchor!.getAttribute('target')).toBeNull();
    expect(anchor!.getAttribute('rel')).toBeNull();
  });

  it('strips unsafe link protocols instead of emitting them (XSS guard)', () => {
    const { container } = renderDoc('[evil](javascript:alert(1))');
    const anchor = container.querySelector('a');
    expect(anchor).toBeTruthy();
    expect(anchor!.getAttribute('href')).toBeNull();
    expect(anchor!.textContent).toBe('evil');
  });

  it('renders images with alt text exposed for accessibility', () => {
    const { container } = renderDoc('![a kitten](https://example.com/cat.png)');
    const labeled = container.querySelector('[aria-label="a kitten"]');
    expect(labeled).toBeTruthy();
  });

  it('renders unordered lists as ul > li with bullet markers', () => {
    const { container } = renderDoc('- alpha\n- beta');
    const ul = container.querySelector('ul');
    expect(ul).toBeTruthy();
    const items = ul!.querySelectorAll('li');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('alpha');
    expect(items[0].textContent).toContain('•');
  });

  it('renders ordered lists with a custom start offset in the markers', () => {
    const { container } = renderDoc('3. third\n4. fourth');
    const ol = container.querySelector('ol');
    expect(ol).toBeTruthy();
    const items = ol!.querySelectorAll('li');
    expect(items[0].textContent).toContain('3.');
    expect(items[1].textContent).toContain('4.');
  });

  it('renders GFM task lists as read-only checkboxes with aria-checked state', () => {
    const { container } = renderDoc('- [x] done\n- [ ] todo');
    const boxes = container.querySelectorAll('[role="checkbox"]');
    expect(boxes).toHaveLength(2);
    expect(boxes[0].getAttribute('aria-checked')).toBe('true');
    expect(boxes[1].getAttribute('aria-checked')).toBe('false');
    expect(boxes[0].getAttribute('aria-disabled')).toBe('true');
  });

  it('renders blockquote content', () => {
    const { container } = renderDoc('> wise words');
    expect(container.textContent).toContain('wise words');
  });

  it('renders GFM tables into thead/tbody with header and data cells', () => {
    const { container } = renderDoc(['| Name | Age |', '| :--- | ---: |', '| Ada | 36 |', '| Grace | 85 |'].join('\n'));
    expect(container.querySelector('table')).toBeTruthy();
    const headers = container.querySelectorAll('thead th');
    expect(headers).toHaveLength(2);
    expect(headers[0].textContent).toBe('Name');
    const bodyRows = container.querySelectorAll('tbody tr');
    expect(bodyRows).toHaveLength(2);
    expect(bodyRows[0].querySelectorAll('td')[0].textContent).toBe('Ada');
  });

  it('renders hard line breaks as <br> on web', () => {
    const { container } = renderDoc('first  \nsecond');
    expect(container.querySelector('br')).toBeTruthy();
  });

  it('renders raw html blocks via innerHTML on web', () => {
    const { container } = renderDoc('<div class="raw-html-marker">raw!</div>');
    const marker = container.querySelector('.raw-html-marker');
    expect(marker).toBeTruthy();
    expect(marker!.textContent).toBe('raw!');
  });

  it('renders a thematic break without crashing surrounding content', () => {
    const { container } = renderDoc('above\n\n---\n\nbelow');
    expect(container.textContent).toContain('above');
    expect(container.textContent).toContain('below');
  });
});

describe('renderMarkdown — custom component overrides', () => {
  it('prefers custom heading/paragraph/inline components over the built-ins', () => {
    const components: Partial<MarkdownComponents> = {
      h1: ({ children }) => <Text data-testid="custom-h1">{children}</Text>,
      p: ({ children }) => <Text data-testid="custom-p">{children}</Text>,
      strong: ({ children }) => <Text data-testid="custom-strong">{children}</Text>,
      em: ({ children }) => <Text data-testid="custom-em">{children}</Text>,
      del: ({ children }) => <Text data-testid="custom-del">{children}</Text>,
      inlineCode: ({ children }) => <Text data-testid="custom-inline-code">{children}</Text>,
    };
    const { getByTestId } = renderDoc('# Title\n\n**b** *i* ~~d~~ `c`', components);
    expect(getByTestId('custom-h1').textContent).toBe('Title');
    expect(getByTestId('custom-p')).toBeTruthy();
    expect(getByTestId('custom-strong').textContent).toBe('b');
    expect(getByTestId('custom-em').textContent).toBe('i');
    expect(getByTestId('custom-del').textContent).toBe('d');
    expect(getByTestId('custom-inline-code').textContent).toBe('c');
  });

  it('routes fenced code through the custom code component with lang and meta', () => {
    let seen: Partial<CodeBlockProps> = {};
    const components: Partial<MarkdownComponents> = {
      code: ({ children, lang, meta }) => {
        seen = { lang, meta };
        return <Text data-testid="custom-code">{children}</Text>;
      },
    };
    const { getByTestId } = renderDoc('```ts title="x"\nconst a = 1;\n```', components);
    expect(getByTestId('custom-code').textContent).toBe('const a = 1;');
    expect(seen.lang).toBe('ts');
    expect(seen.meta).toBe('title="x"');
  });

  it('routes links and images through custom a/img components', () => {
    const components: Partial<MarkdownComponents> = {
      a: ({ href, children }) => (
        <Text
          data-testid="custom-a"
          data-href={href}>
          {children}
        </Text>
      ),
      img: ({ src, alt }) => <Text data-testid="custom-img">{`${alt}:${src}`}</Text>,
    };
    const { getByTestId } = renderDoc('[x](/y)\n\n![pic](/img.png)', components);
    expect(getByTestId('custom-a').dataset.href).toBe('/y');
    expect(getByTestId('custom-img').textContent).toBe('pic:/img.png');
  });

  it('routes lists through custom ul/ol/li with ordered/start metadata', () => {
    const olSeen: { ordered: boolean; start?: number | null }[] = [];
    const components: Partial<MarkdownComponents> = {
      ol: ({ children, ordered, start }) => {
        olSeen.push({ ordered, start });
        return <View data-testid="custom-ol">{children}</View>;
      },
      li: ({ children, checked }) => (
        <Text
          data-testid="custom-li"
          data-checked={String(checked)}>
          {children}
        </Text>
      ),
    };
    const { getByTestId, getAllByTestId } = renderDoc('5. five\n6. six', components);
    expect(getByTestId('custom-ol')).toBeTruthy();
    expect(olSeen[0]).toStrictEqual({ ordered: true, start: 5 });
    expect(getAllByTestId('custom-li')).toHaveLength(2);
  });

  it('routes blockquote/hr/br/table parts through custom components', () => {
    const components: Partial<MarkdownComponents> = {
      blockquote: ({ children }) => <View data-testid="custom-bq">{children}</View>,
      hr: () => <View data-testid="custom-hr" />,
      br: () => <Text data-testid="custom-br"> </Text>,
      table: ({ children }) => <View data-testid="custom-table">{children}</View>,
      tr: ({ children, isHeader }) => (
        <View data-testid={isHeader ? 'custom-tr-head' : 'custom-tr-body'}>{children}</View>
      ),
      th: ({ children }) => <Text data-testid="custom-th">{children}</Text>,
      td: ({ children, align }) => (
        <Text
          data-testid="custom-td"
          data-align={String(align)}>
          {children}
        </Text>
      ),
    };
    const doc = ['> quote', '', '---', '', 'a  ', 'b', '', '| H |', '| :---: |', '| D |'].join('\n');
    const { getByTestId } = renderDoc(doc, components);
    expect(getByTestId('custom-bq').textContent).toContain('quote');
    expect(getByTestId('custom-hr')).toBeTruthy();
    expect(getByTestId('custom-br')).toBeTruthy();
    expect(getByTestId('custom-table')).toBeTruthy();
    expect(getByTestId('custom-tr-head')).toBeTruthy();
    expect(getByTestId('custom-tr-body')).toBeTruthy();
    expect(getByTestId('custom-th').textContent).toBe('H');
    expect(getByTestId('custom-td').textContent).toBe('D');
    expect(getByTestId('custom-td').dataset.align).toBe('center');
  });
});

describe('renderNode — unknown node degradation', () => {
  it('renders children of unknown container nodes instead of dropping them', () => {
    const { container } = renderWithProviders(
      <>
        {renderNode(
          {
            type: 'futureContainer',
            children: [{ type: 'text', value: 'still visible' }],
          } as any,
          0,
        )}
      </>,
    );
    expect(container.textContent).toContain('still visible');
  });

  it('wraps a bare text child of an unknown container in Text, never a raw string under the View', () => {
    // A raw string directly under a View is a text node (nodeType 3) and logs
    // "A text node cannot be a child of a <View>" on native and react-native-web
    // (MPO-197, Markdown/Renderer --unknown-nodes); a Text wrapper is an element.
    const { container } = renderWithProviders(
      <>
        {renderNode(
          {
            type: 'futureContainer',
            children: [{ type: 'text', value: 'still visible' }],
          } as any,
          0,
        )}
      </>,
    );
    const view = container.firstElementChild as HTMLElement;
    expect(view.textContent).toBe('still visible');
    expect([...view.childNodes].every((n) => n.nodeType === 1)).toBe(true);
  });

  it('renders unknown leaf nodes with a string value as text', () => {
    const { container } = renderWithProviders(<>{renderNode({ type: 'futureLeaf', value: 'leaf value' } as any, 0)}</>);
    expect(container.textContent).toContain('leaf value');
  });

  it('returns null for unknown nodes with neither children nor value', () => {
    expect(renderNode({ type: 'mystery' } as any, 0)).toBeNull();
  });
});
