# @repo/frappe-ui

Pre-wired Tamagui components for [Frappe](https://frappeframework.com) doctypes
with live data: tables, forms, kanban, calendar, dashboards, and the doctype
field registry.

## Install

```bash
pnpm add @repo/frappe-ui
```

## What it owns

- **`FrappeProvider`** — Frappe connection context (`baseURL`, auth, socket port)
- **View wrappers** — `FrappeTable`, `FrappeForm`, `FrappeList`, `FrappeListView`,
  `FrappeKanban`, `FrappeCalendar`, `FrappeGantt`, `FrappeReportBuilder`,
  `FrappeDashboard` (+ `FrappeKPICard`, `FrappeChartCard`), `FormSidebar`
- **Document collaboration** — `FrappeAssignment` (assign-to over live ToDo CRUD),
  `FrappeLikedBy` (`_liked_by` heart + avatar cluster), `FrappeAttachments`,
  `FrappeTags`, `FrappeTimeline` (live File / Tag Link / Comment + Version feeds)
- **Live aggregates** — `useFrappeAggregate` (server-side count/sum/avg/min/max +
  `groupBy`, refetched on realtime events)
- **Field registry** — maps Frappe fieldtypes to form field components
  (`registerField`, `getFieldComponent`, `initDefaultRegistry`,
  `fieldtypeToTableField`, `childFieldsToColumns`)
- **Desk list** — `buildListColumns` (the desk list's column derivation, which
  `FrappeTable` defaults to), `listFieldsToFetch`, and the one filterable-field
  vocabulary both list stacks read (`filterableFieldsFromMeta`,
  `docFieldsToFilterFields`, desk's operators and tuple conversion)

## What it must not do

- Never re-implement table or forms primitives — it **adapts** them.
  Dependency direction: `frappe-ui` → `table` / `forms` / `components` / `theme`;
  those packages never depend back on `frappe-ui` or `frappe`.
- Adapters forward the shared field contract (disabled / readOnly / error /
  required / skeleton / compact) — they do not translate it.

## Usage

```tsx
import { FrappeProvider, FrappeTable } from '@repo/frappe-ui';

interface ToDo {
  name: string;
  doctype: string;
  description: string;
  status: 'Open' | 'Closed';
}

export function ToDoTable() {
  return (
    <FrappeProvider baseURL="https://mysite.frappe.cloud">
      <FrappeTable<ToDo>
        doctype="ToDo"
        columns={[
          { accessorKey: 'description', header: 'Description' },
          { accessorKey: 'status', header: 'Status' },
        ]}
        fields={['name', 'description', 'status']}
      />
    </FrappeProvider>
  );
}
```

`FrappeTable` accepts the rest of the `DataTable` props from
`@repo/table` (filtering, sorting, pagination, `serverSide`, …).

`columns` is optional. Without it the table renders the doctype the way desk's
list does: `buildListColumns` derives the title, the `in_list_view` fields the
session's roles may read and the activity cluster from the doctype's meta, and
a bench read asks for `listFieldsToFetch`. The table waits for meta and the
roles before that read, so it happens once.

```tsx
<FrappeTable<ToDo>
  doctype="ToDo"
  serverSide
/>
```

### Infinite scroll (server-side)

With `serverSide` and `paginationMode="infinite"`, `FrappeTable` supplies the
`DataTable` page loader automatically: each page maps through the same
Frappe query params as the classic fetch path (`limit_start`,
`limit_page_length`, `order_by`, operator-aware `filters`, global search),
the total count is fetched once per query state (on page 0), and the table
pre-loads page N+1 while page N is on screen. A consumer-provided `loadPage`
prop overrides the built-in loader.

```tsx
<FrappeTable<ToDo> doctype="ToDo" serverSide paginationMode="infinite" ... />
```

### Link field (backend search)

The `Link` field (foreign-key picker) is a combobox whose typing searches the
backend — the same server search stock Frappe's link control uses
(`frappe.desk.search.search_link`): relevance ranking, the doctype's link
`get_query` conditions, `searchfield` semantics, and permissions are all
enforced server-side.

- Opening fetches the first page with an empty query (stock focus behavior);
  keystrokes are debounced (~300ms effective) and every query renders the
  server's result set — never client-side filtering of a preloaded list. No
  requests fire while the dropdown is closed or the field is locked.
- `pageLength` (default 20) sets results per page; `filters` apply server-side
  on top of the doctype's link query; `searchFields` maps to `searchfield`;
  `referenceDoctype` feeds the server's link-query context.
- A saved value's display title resolves on mount via
  `frappe.desk.search.get_link_title` (session-cached, falls back to the raw
  name), so an existing FK never renders as a bare id while titles are enabled.
- Search failures render inside the dropdown ("You don't have permission to
  search {doctype}" for 401/403, "Search failed" otherwise).
- In table cells the registry mounts the same combobox chromeless; the editor
  opens as a popover and picking a value commits the row (single-value picker).
- Canonical change prop: `onChange(name)`. `allowCreate` + `onCreateNew` offer
  a create affordance when the typed text matches nothing.

The underlying data hooks (`useLinkSearch`, `useLinkTitle`) live in
`@repo/frappe`; the combobox primitives (async `onSearch`,
`valueLabel`, `searchError`) live in `@repo/forms`.

### Live aggregates

Dashboard numbers are computed **server-side** (`frappe.client.get_count`, or
`get_list` with an aggregate expression + `group_by` over the whole filtered
doctype) and refetched when the doctype's realtime room reports a change —
never counted from the synced row window, which is bounded to a page.
`useFrappeAggregate` coalesces event bursts through a debounce window
(default 300ms, `debounceMs`) and reports honest states: `isLoading` (first
load), `isStale` (refetch in flight), `error` + `isPermissionError` (403),
and `value === undefined` for empty aggregates. Widgets watching the same
doctype share one socket room.

```tsx
import { FrappeKPICard, FrappeChartCard } from "@repo/frappe-ui";

// Inside a <FrappeProvider> (or pass baseURL/auth props directly)
<FrappeKPICard
  config={{ id: "open-todos", title: "Open ToDos", value: 0 }} // value overridden live
  dataSource={{ doctype: "ToDo", aggregate: "count", filters: { status: "Open" } }}
/>
<FrappeChartCard
  config={{ id: "by-status", title: "ToDos by status", type: "bar" }}
  dataSource={{ doctype: "ToDo", groupBy: "status" }}
/>
```

Without a `dataSource`, both cards are static passthroughs of the catalog
`KPICard` / `ChartCard`. `FrappeDashboard` and `FrappeReportBuilder` stream
rows live through the sync client and show a subtle stale affordance while a
post-event refresh is in flight.

## Related packages

- `@repo/frappe` — the live-sync client this package fetches through
- `@repo/table` — the framework-agnostic `DataTable` being wrapped
- `@repo/forms` — the field components the registry maps onto

## Styling

Structural styling flows through the knobs system in `@repo/theme`
(see `docs/standards/frontend/knobs-system.md` in the
[universal-starter-kit repo](https://github.com/shotcowboystyle/universal-starter-kit/mpo)).

## License

Apache-2.0
