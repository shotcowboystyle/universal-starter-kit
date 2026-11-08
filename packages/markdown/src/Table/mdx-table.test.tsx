/**
 * MDXTable spec (MPO-177). Stories live in Markdown/Tables; this file is the
 * colocated lock that the MDX table family still paints real table semantics.
 */

import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it } from 'vitest';

import { MDXTable, MDXTableBody, MDXTableCell, MDXTableHead, MDXTableHeaderCell, MDXTableRow } from './index';

describe(MDXTable, () => {
  it('renders the family into table/thead/tbody/tr/th/td', () => {
    const { container } = renderWithProviders(
      <MDXTable>
        <MDXTableHead>
          <MDXTableRow>
            <MDXTableHeaderCell>Header</MDXTableHeaderCell>
          </MDXTableRow>
        </MDXTableHead>
        <MDXTableBody>
          <MDXTableRow>
            <MDXTableCell>Data</MDXTableCell>
          </MDXTableRow>
        </MDXTableBody>
      </MDXTable>,
    );
    expect(container.querySelector('table')).toBeTruthy();
    expect(container.querySelector('thead th')?.textContent).toContain('Header');
    expect(container.querySelector('tbody td')?.textContent).toContain('Data');
  });
});
