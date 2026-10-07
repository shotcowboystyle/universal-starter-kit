/**
 * mdxComponents mapping specs — the HTML-tag → Tamagui component table MDX
 * documents render through. Locks down real DOM semantics per tag (headings
 * with data-heading anchors, inline strong/em/del, list/table structure) and
 * the `code` dual mode (inline CodeInline without className vs block).
 *
 * The `a` mapping is not covered here: it renders through the router Link,
 * which needs a live router host.
 */

import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it } from 'vitest';

import { mdxComponents } from './mdxComponents';

function C(tag: keyof typeof mdxComponents): any {
  const component = mdxComponents[tag];
  expect(component, `mdxComponents.${tag}`).toBeTruthy();
  return component;
}

describe('mdxComponents — headings', () => {
  it('renders h1 as a real h1', () => {
    const H1 = C('h1');
    const { container } = renderWithProviders(<H1>Top</H1>);
    expect(container.querySelector('h1')?.textContent).toBe('Top');
  });

  it('renders h2 with the data-heading marker used by TOC scrapers', () => {
    const H2 = C('h2');
    const { container } = renderWithProviders(<H2>Section</H2>);
    const h2 = container.querySelector('h2');
    expect(h2?.textContent).toBe('Section');
    expect(h2?.hasAttribute('data-heading')).toBe(true);
  });

  it('renders h3 as a self-linking anchor heading with its id', () => {
    const H3 = C('h3');
    const { container } = renderWithProviders(<H3 id="install">Install</H3>);
    const anchor = container.querySelector('a[href="#install"]');
    expect(anchor).toBeTruthy();
    expect(anchor!.getAttribute('id')).toBe('install');
    expect(anchor!.textContent).toContain('Install');
    expect(container.querySelector('h3')).toBeTruthy();
  });

  it('renders h4/h5/h6 at their own levels', () => {
    const H4 = C('h4');
    const H5 = C('h5');
    const H6 = C('h6');
    const { container } = renderWithProviders(
      <>
        <H4>four</H4>
        <H5>five</H5>
        <H6>six</H6>
      </>,
    );
    expect(container.querySelector('h4')?.textContent).toBe('four');
    expect(container.querySelector('h5')?.textContent).toBe('five');
    expect(container.querySelector('h6')?.textContent).toBe('six');
  });
});

describe('mdxComponents — inline and block text', () => {
  it('renders p as a real paragraph element', () => {
    const P = C('p');
    const { container } = renderWithProviders(<P>body copy</P>);
    expect(container.querySelector('p')?.textContent).toBe('body copy');
  });

  it('renders strong/em/del with their native semantics', () => {
    const Strong = C('strong');
    const Em = C('em');
    const Del = C('del');
    const { container } = renderWithProviders(
      <>
        <Strong>bold</Strong>
        <Em>slanted</Em>
        <Del>removed</Del>
      </>,
    );
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('em')?.textContent).toBe('slanted');
    expect(container.querySelector('del')?.textContent).toBe('removed');
  });

  it('renders blockquote content through the quote treatment', () => {
    const Blockquote = C('blockquote');
    const { container } = renderWithProviders(<Blockquote>quoted wisdom</Blockquote>);
    expect(container.textContent).toContain('quoted wisdom');
  });

  it('renders hr without crashing', () => {
    const Hr = C('hr');
    const { container } = renderWithProviders(<Hr />);
    expect(container.firstChild).toBeTruthy();
  });
});

describe('mdxComponents — code', () => {
  it('renders inline code (no className) as a real <code> element', () => {
    const Code = C('code');
    const { container } = renderWithProviders(<Code>npm i tamagui</Code>);
    const code = container.querySelector('code');
    expect(code).toBeTruthy();
    expect(code!.textContent).toBe('npm i tamagui');
  });
});

describe('mdxComponents — lists', () => {
  it('renders ul > li structure and strips stray string children', () => {
    const Ul = C('ul');
    const Li = C('li');
    const { container } = renderWithProviders(
      <Ul>
        {'\n'}
        <Li>first</Li>
        {'\n'}
        <Li>second</Li>
      </Ul>,
    );
    const ul = container.querySelector('ul');
    expect(ul).toBeTruthy();
    const items = ul!.querySelectorAll('li');
    expect(items).toHaveLength(2);
    expect(ul!.textContent).not.toContain('\n');
  });

  it('renders ol as a real ordered list', () => {
    const Ol = C('ol');
    const Li = C('li');
    const { container } = renderWithProviders(
      <Ol>
        <Li>one</Li>
      </Ol>,
    );
    expect(container.querySelector('ol')).toBeTruthy();
    expect(container.querySelector('ol li')?.textContent).toContain('one');
  });
});

describe('mdxComponents — media and tables', () => {
  it('renders img nested in a span wrapper with forwarded src/alt', () => {
    const Img = C('img');
    const { container } = renderWithProviders(
      <Img
        src="https://example.com/x.png"
        alt="diagram"
      />,
    );
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img!.getAttribute('src')).toBe('https://example.com/x.png');
    expect(img!.getAttribute('alt')).toBe('diagram');
  });

  it('renders the full table family into table/thead/tbody/tr/th/td', () => {
    const Table = C('table');
    const Thead = C('thead');
    const Tbody = C('tbody');
    const Tr = C('tr');
    const Th = C('th');
    const Td = C('td');
    const { container } = renderWithProviders(
      <Table>
        <Thead>
          <Tr>
            <Th>Header</Th>
          </Tr>
        </Thead>
        <Tbody>
          <Tr>
            <Td>Data</Td>
          </Tr>
        </Tbody>
      </Table>,
    );
    expect(container.querySelector('table')).toBeTruthy();
    expect(container.querySelector('thead th')?.textContent).toBe('Header');
    expect(container.querySelector('tbody td')?.textContent).toBe('Data');
  });

  it('pre passes children through unchanged (code block owns the chrome)', () => {
    const Pre = C('pre');
    const { container } = renderWithProviders(<Pre>inner text</Pre>);
    expect(container.textContent).toContain('inner text');
    expect(container.querySelector('pre')).toBeNull();
  });
});
