# @repo/table-primitives

Semantic, knob-aware table primitives (`<Table>`, rows, cells) plus the table
cell context that lets form fields render chromeless inside cells. Layer 1
only: depends on theme + Tamagui — no forms, no data-table logic.

## Usage in this monorepo

Private workspace package. Add `"@repo/table-primitives": "workspace:*"` to the
consuming package's `dependencies`.

## What it owns

- **`Table`** compound component — `Table.Head`, `Table.Body`, `Table.Row`,
  `Table.Cell`, `Table.HeaderCell`, `Table.Foot`, `Table.Caption`
- **`TableCellContext`** / `useIsInTableCell()` / `useTableCellContext()` —
  the signal `@repo/forms` fields use to auto-detect they are
  inside a cell and drop their chrome

## What it must not do

- No data-table features (filtering, sorting, pagination, virtualization) —
  data tables are out of scope for this package
- No form fields, no Frappe/API assumptions

## Usage

```tsx
import { Table } from '@repo/table-primitives';

export function PeopleTable() {
  return (
    <Table>
      <Table.Head>
        <Table.Row>
          <Table.HeaderCell>Name</Table.HeaderCell>
          <Table.HeaderCell>Role</Table.HeaderCell>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        <Table.Row>
          <Table.Cell>Ada Lovelace</Table.Cell>
          <Table.Cell>Admin</Table.Cell>
        </Table.Row>
      </Table.Body>
    </Table>
  );
}
```

## Styling

Table chrome (borders, padding, radius) resolves through the knobs system in
`@repo/theme` — flip knobs or wrap in a `<Preset>` instead of
overriding style props.

## License

Apache-2.0

Derived from [multiplatform.one](https://multiplatform.one) (Apache-2.0). See the package LICENSE and the repository NOTICE.
