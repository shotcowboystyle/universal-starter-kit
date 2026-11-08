import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { describe, expect, it } from 'vitest';

import { Heading } from './components/Heading';
import { HorizontalRule } from './components/HorizontalRule';
import { MarkdownImage } from './components/Image';
import { MarkdownList, MarkdownListItem } from './components/List';
import { MarkdownTable, MarkdownTableCell, MarkdownTableRow } from './components/Table';
import { MarkdownSimpleTable } from './MarkdownSimpleTable';
import { MDXTable, MDXTableBody, MDXTableCell, MDXTableHead, MDXTableHeaderCell, MDXTableRow } from './Table';

const HEIGHT_200 = /height:\s*200px/u;

const headerWeight = (container: HTMLElement) => {
  const th = container.querySelector('th');
  expect(th).toBeTruthy();
  return window.getComputedStyle(th!.querySelector('span') ?? th!).fontWeight;
};

describe('markdown design-law (MPO-60)', () => {
  it('Heading binds the heading recipe (T-HEADING)', () => {
    const { container } = renderWithProviders(<Heading level={2}>Title</Heading>);
    expect(container.textContent).toContain('Title');
    expect(container.querySelector('h2')).toBeTruthy();
  });

  it('HorizontalRule paints a separator and hides at borderWidth=none', () => {
    const shown = renderWithProviders(<HorizontalRule />);
    expect(shown.container.querySelector('[role="separator"]')).toBeTruthy();

    const hidden = renderWithProviders(
      <Preset overrides={{ borderWidth: 'none' }}>
        <HorizontalRule />
      </Preset>,
    );
    expect(hidden.container.querySelector('[role="separator"]')).toBeNull();
  });

  it('list marker column is not a fixed 24px', () => {
    const { container } = renderWithProviders(
      <MarkdownList ordered={false}>
        <MarkdownListItem>alpha</MarkdownListItem>
      </MarkdownList>,
    );
    const marker = container.querySelector<HTMLElement>('[aria-hidden="true"]');
    expect(marker).toBeTruthy();
    expect(marker!.style.width).not.toBe('24px');
    expect(container.textContent).toContain('alpha');
  });

  it('image fallback is aspect-ratio, not a fixed 200px height', () => {
    const { container } = renderWithProviders(
      <MarkdownImage
        src="https://example.com/x.png"
        alt="demo"
      />,
    );
    const img = container.querySelector('img') as HTMLElement | null;
    expect(img).toBeTruthy();
    const style = img!.getAttribute('style') ?? '';
    expect(style).not.toMatch(HEIGHT_200);
  });

  it('MarkdownTable is R-OUTER: framed, square cells, header not weight 600', () => {
    const { container } = renderWithProviders(
      <MarkdownTable>
        <MarkdownTableRow isHeader>
          <MarkdownTableCell isHeader>Col</MarkdownTableCell>
        </MarkdownTableRow>
        <MarkdownTableRow>
          <MarkdownTableCell>cell</MarkdownTableCell>
        </MarkdownTableRow>
      </MarkdownTable>,
    );
    const frame = container.querySelector<HTMLElement>("[data-markdown-table-frame='true']");
    expect(frame).toBeTruthy();
    expect(frame!.dataset.borderWidth).not.toBe('undefined');
    const th = container.querySelector('th') as HTMLElement;
    const td = container.querySelector('td') as HTMLElement;
    expect(th.style.borderRadius || window.getComputedStyle(th).borderRadius).not.toBe('50%');
    expect(td).toBeTruthy();
    const weight = headerWeight(container);
    expect(weight === '600' || weight === '500').toBe(false);
  });

  it('MDXTable shares the same R-OUTER frame contract', () => {
    const { container } = renderWithProviders(
      <MDXTable>
        <MDXTableHead>
          <MDXTableRow>
            <MDXTableHeaderCell>Col</MDXTableHeaderCell>
          </MDXTableRow>
        </MDXTableHead>
        <MDXTableBody>
          <MDXTableRow>
            <MDXTableCell>cell</MDXTableCell>
          </MDXTableRow>
        </MDXTableBody>
      </MDXTable>,
    );
    expect(container.querySelector("[data-markdown-table-frame='true']")).toBeTruthy();
    expect(container.querySelector('thead th')!.textContent).toContain('Col');
    const weight = headerWeight(container);
    expect(weight === '600' || weight === '500').toBe(false);
  });

  it('MarkdownSimpleTable shares the same R-OUTER frame contract', () => {
    const { container } = renderWithProviders(
      <MarkdownSimpleTable
        headers={['Col']}
        rows={[['cell']]}
      />,
    );
    expect(container.querySelector("[data-markdown-table-frame='true']")).toBeTruthy();
    expect(container.querySelector('thead th')!.textContent).toContain('Col');
    expect(container.querySelector('tbody td')!.textContent).toContain('cell');
    const weight = headerWeight(container);
    expect(weight === '600' || weight === '500').toBe(false);
  });

  it('table frame borderWidth=none drops the painted rule', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ borderWidth: 'none' }}>
        <MarkdownSimpleTable
          headers={['Col']}
          rows={[['cell']]}
        />
      </Preset>,
    );
    const frame = container.querySelector<HTMLElement>("[data-markdown-table-frame='true']");
    expect(frame).toBeTruthy();
    expect(frame!.dataset.borderWidth).toBe('0');
  });
});
