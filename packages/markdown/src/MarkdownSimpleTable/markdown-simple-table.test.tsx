/**
 * MarkdownSimpleTable contract specs — headers/rows render into real
 * table/thead/tbody semantics, and string cells get the mini inline-markdown
 * pass (links, bold links, bold, inline code) while element cells and plain
 * strings pass through untouched.
 */

import { renderWithProviders } from '@repo/test-utils';
import { Text } from 'tamagui';
import { describe, expect, it } from 'vitest';

import { MarkdownSimpleTable } from './index';

describe(MarkdownSimpleTable, () => {
  it('renders headers into thead and rows into tbody', () => {
    const { container } = renderWithProviders(
      <MarkdownSimpleTable
        headers={['Name', 'Role']}
        rows={[
          ['Ada', 'Engineer'],
          ['Grace', 'Admiral'],
        ]}
      />,
    );
    expect(container.querySelector('table')).toBeTruthy();
    const ths = container.querySelectorAll('thead th');
    expect(ths).toHaveLength(2);
    expect(ths[0].textContent).toBe('Name');
    const bodyRows = container.querySelectorAll('tbody tr');
    expect(bodyRows).toHaveLength(2);
    expect(bodyRows[1].querySelectorAll('td')[1].textContent).toBe('Admiral');
  });

  it('parses [label](url) cell syntax into a real link', () => {
    const { container } = renderWithProviders(
      <MarkdownSimpleTable
        headers={['Docs']}
        rows={[['see [guide](https://example.com/guide)']]}
      />,
    );
    const anchor = container.querySelector('tbody a');
    expect(anchor).toBeTruthy();
    expect(anchor!.getAttribute('href')).toBe('https://example.com/guide');
    expect(anchor!.textContent).toBe('guide');
    expect(container.textContent).toContain('see');
  });

  it('parses **[label](url)** into a bold link', () => {
    const { container } = renderWithProviders(
      <MarkdownSimpleTable
        headers={['Docs']}
        rows={[['**[api](https://example.com/api)**']]}
      />,
    );
    const anchor = container.querySelector('tbody a');
    expect(anchor).toBeTruthy();
    expect(anchor!.getAttribute('href')).toBe('https://example.com/api');
    expect(anchor!.textContent).toBe('api');
  });

  it('parses **bold** and `code` cell fragments', () => {
    const { container } = renderWithProviders(
      <MarkdownSimpleTable
        headers={['Col']}
        rows={[['a **strong** and `snippet` end']]}
      />,
    );
    const cell = container.querySelector('tbody td');
    expect(cell!.textContent).toBe('a strong and snippet end');
    // Both fragments render as distinct styled spans, not raw markup.
    expect(cell!.textContent).not.toContain('**');
    expect(cell!.textContent).not.toContain('`');
  });

  it('leaves plain string cells untouched', () => {
    const { container } = renderWithProviders(
      <MarkdownSimpleTable
        headers={['Col']}
        rows={[['just plain text']]}
      />,
    );
    expect(container.querySelector('tbody td')!.textContent).toBe('just plain text');
    expect(container.querySelector('tbody a')).toBeNull();
  });

  it('passes ReactNode cells through without a markdown pass', () => {
    const { getByTestId } = renderWithProviders(
      <MarkdownSimpleTable
        headers={['Col']}
        rows={[
          [
            <Text
              key="x"
              data-testid="element-cell">
              **not parsed**
            </Text>,
          ],
        ]}
      />,
    );
    // The literal asterisks survive because element cells skip parseCell.
    expect(getByTestId('element-cell').textContent).toBe('**not parsed**');
  });
});
