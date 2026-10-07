# @repo/backoffice

An embeddable, cross-platform recreation of the Frappe Desk. Drop the whole
backoffice — shell chrome, workspaces, doctype lists, forms, views — into any
React app on the universal-starter-kit stack, mounted at any URL prefix, behind
your own router, with flags for everything it shows and does.

Built on `@repo/frappe` (live data client) and
`@repo/frappe-ui` (doctype-aware components), rendering through
Tamagui — the same code runs on web, React Native, and the GTK/webview
targets the monorepo supports.

## Install

```sh
pnpm add @repo/backoffice
# peers you likely already have:
pnpm add react react-dom react-i18next i18next
```

`one` is an **optional** peer — only needed if you use the
`@repo/backoffice/one-adapter` subpath.

## Concepts

Everything hangs off one component:

```
<BackofficeProvider
  frappe={…}        ← Frappe connection (feeds FrappeProvider internally)
  navigation={…}    ← how the backoffice navigates (adapter, see below)
  basePath={…}      ← URL prefix it is mounted under (default "/backoffice")
  capabilities={…}  ← visibility/behavior flags (all default ON)
  doctypes={…}      ← allow/deny doctype scoping
  slots={…}         ← render-prop replacements for built-in chrome
  onEvent={…}       ← event bus (navigation, doc lifecycle, errors)
>
```

The backoffice never imports a router. It navigates through the
`BackofficeNavigator` you hand it — three methods and a subscribable
location:

```ts
interface BackofficeNavigator {
  navigate(path: string): void;
  replace(path: string): void;
  back(): void;
  getLocation(): { path: string; params: Record<string, string | string[] | undefined> };
  subscribe(listener: () => void): () => void;
}
```

## Minimal example (one screen)

```tsx
import { BackofficeProvider, BackofficeShell, createMemoryNavigator } from '@repo/backoffice';

const navigation = createMemoryNavigator('/backoffice');

export function App() {
  return (
    <BackofficeProvider
      frappe={{ baseURL: 'https://mysite.frappe.cloud' }}
      navigation={navigation}>
      <BackofficeShell>
        <MyRoutedContent />
      </BackofficeShell>
    </BackofficeProvider>
  );
}
```

## Full shell in a One app

Routes stay thin files; the layout wires the adapter once:

```tsx
// routes/backoffice/_layout.tsx
import { Slot } from 'one';
import { BackofficeProvider, BackofficeShell } from '@repo/backoffice';
import { useOneNavigator } from '@repo/backoffice/one-adapter';

export default function BackofficeLayout() {
  const navigation = useOneNavigator();
  return (
    <BackofficeProvider
      frappe={{
        baseURL: process.env.ONE_PUBLIC_FRAPPE_URL!,
        socketPort: 9000,
        auth: { useToken: true, token: 'key:secret', type: 'token' },
        syncOptions: { persistKey: 'backoffice', cdcInterval: 30_000 },
      }}
      navigation={navigation}>
      <BackofficeShell>
        <Slot />
      </BackofficeShell>
    </BackofficeProvider>
  );
}
```

Auth note: in cross-origin dev (app on one port, bench on another) the frappe
`sid` cookie never attaches — pass token `auth`. Same-origin deployments
behind a reverse proxy can omit `auth` and ride cookie auth.

## Navigation adapters

**One router** (subpath export, keeps the main entry router-free):

```tsx
import { useOneNavigator } from '@repo/backoffice/one-adapter';
const navigation = useOneNavigator();
```

**Memory** (tests, Storybook, router-less embeddings):

```tsx
import { createMemoryNavigator } from '@repo/backoffice';
const navigation = createMemoryNavigator('/backoffice');
navigation.navigate('/backoffice/todo'); // full history stack, subscribable
```

**Anything else** — bridge your router with `ControlledNavigator`:

```tsx
import { ControlledNavigator } from '@repo/backoffice';

const navigation = new ControlledNavigator({
  navigate: (path) => myRouter.push(path),
  replace: (path) => myRouter.replace(path),
  back: () => myRouter.back(),
});
// mirror your router's location back in (e.g. in a layout effect):
navigation.setLocation({ path: myRouter.pathname, params: myRouter.query });
```

## Mount anywhere: `basePath`

```tsx
<BackofficeProvider basePath="/admin" …>
```

Every path the backoffice builds (sidebar workspaces, awesomebar commands,
notification links) is rebound to the prefix. Path helpers are available to
hosts too: `createBackofficePaths("/admin").form("ToDo", "abc")` →
`"/admin/todo/abc"`.

## Capability flags

All flags default **ON**; pass booleans or per-feature config objects:

```tsx
<BackofficeProvider
  capabilities={{
    notifications: false,
    userMenu: { themeToggle: false, logout: false },
    views: { allow: ["list", "report"] },
    bulkActions: false,
  }}
  doctypes={{ allow: ["ToDo", "Note"] }}   // or deny: […]
  …
>
```

| Flag            | Gates                                     | Config                                                                |
| --------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| `awesomebar`    | Global search / command bar in the navbar | `enabled`                                                             |
| `notifications` | Notification bell + panel                 | `enabled`                                                             |
| `userMenu`      | Avatar menu                               | `enabled`, `themeToggle`, `logout`                                    |
| `help`          | Help menu (docs, shortcuts, about)        | `enabled`                                                             |
| `sidebar`       | Workspace sidebar (rail + drawer)         | `enabled`                                                             |
| `quickEntry`    | Quick-entry create dialogs                | `enabled`                                                             |
| `views`         | List views                                | `enabled`, `allow` (list/report/kanban/calendar/tree/image/dashboard) |
| `newDoc`        | "New <doctype>" affordances               | `enabled`                                                             |
| `bulkActions`   | List multi-select action bar              | `enabled`                                                             |
| `attachments`   | Form sidebar attachments                  | `enabled`                                                             |
| `timeline`      | Form activity timeline                    | `enabled`                                                             |
| `assignments`   | Assignment surfaces                       | `enabled`                                                             |
| `tags`          | Tag surfaces                              | `enabled`                                                             |
| `shares`        | Document shares                           | `enabled`                                                             |
| `print`         | Print affordances                         | `enabled`                                                             |
| `email`         | Email / communication affordances         | `enabled`                                                             |

`doctypes.allow` / `doctypes.deny` scope which doctypes are reachable
(awesomebar commands and document hits today; lists/links as surfaces land).

## Slots

Provider-level render props replace built-in chrome; everything else keeps
rendering:

| Slot                                                  | Replaces                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| `renderShellHeader({ defaultContent })`               | Navbar content (wrap or rebuild; `defaultContent` is the built-in row) |
| `renderSidebarFooter()`                               | Appended under the workspace sidebar                                   |
| `renderListEmpty({ doctype })`                        | List screen empty state                                                |
| `renderFormHeader({ doctype, name, defaultContent })` | Document form header row                                               |

```tsx
slots={{
  renderSidebarFooter: () => <MyEnvironmentBadge />,
  renderShellHeader: ({ defaultContent }) => (
    <>
      {defaultContent}
      <MyTenantSwitcher />
    </>
  ),
}}
```

## Events

```tsx
<BackofficeProvider
  onEvent={(event) => {
    switch (event.type) {
      case "navigate":   // { path, mode: "push" | "replace" | "back" }
      case "doc-opened": // { doctype, name }
      case "doc-saved":  // { doctype, name, isNew? }
      case "doc-deleted":
      case "error":      // { error, context? }
    }
  }}
  …
>
```

## Custom fields

```tsx
<BackofficeProvider
  // merged into frappe-ui's field registry (fieldtype → renderer)
  fields={{ Rating: MyRatingField }}
  …
>
```

## Action registry (per-doctype toolbar actions)

The desk's `add_custom_button` sugar (e.g. User → "Reset Password") does not
carry over from desk-side JS — the backoffice replaces it with a typed
registry on the provider. `actions.form` lands on the document form's ⋯
menu; `actions.list` lands on the list's multi-select bulk-actions bar.
Scope an action to specific doctypes with `doctypes` (omit for all):

```tsx
<BackofficeProvider
  actions={{
    form: [
      {
        id: "reset-password",
        label: "Reset Password",
        doctypes: ["User"],
        onPress: ({ doctype, name }) => resetPassword(name!),
      },
    ],
    list: [
      {
        id: "sync-crm",
        label: "Sync to CRM",
        doctypes: ["Contact", "Lead"],
        onPress: ({ doctype, selection }) => syncToCrm(doctype, selection!),
      },
    ],
  }}
  …
>
```

The `onPress` context carries `doctype`, `name` (form actions; undefined for
unsaved docs), and `selection` (list actions: the selected row names).
Per-screen additions/removals ride the surface props instead:
`DocFormScreen actionOverrides={{ hide: ["print"], extra: […] }}` and
`DoctypeListScreen toolbarActions={[…]}`.

## Surfaces

Every desk surface is exported standalone — mount them individually (inside
the provider) or let the slug router compose them:

| Surface             | Renders                                                       | Flexible props                                                                                                                                      |
| ------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BackofficeShell`   | Full desk chrome (navbar, sidebar, palette)                   | `children`                                                                                                                                          |
| `HomeRedirect`      | Default-workspace redirect (home route)                       | —                                                                                                                                                   |
| `SlugScreen`        | Runtime slug → workspace page or doctype list                 | `slug`, `filtersParam`                                                                                                                              |
| `NotFoundScreen`    | Unmatched-path state with a way home                          | —                                                                                                                                                   |
| `WorkspaceScreen`   | Workspace page (shortcuts, links, charts, …)                  | `workspace`, `hiddenBlocks`, `onShortcutPress`, `renderBlock`                                                                                       |
| `DoctypeListScreen` | Doctype list (filters, saved filters, bulk bar, sidebar)      | `views` (allowlist), `initialFilters`, `fixedFilters` (always ANDed), `pageSize`, `onRowOpen`, `hideNewButton`, `toolbarActions`, `columnOverrides` |
| `DoctypeViewScreen` | Alternate views (report/kanban/calendar/tree/image/dashboard) | `doctype`, `view`, per-view props (`readOnly` kanban, `onCardOpen`, …)                                                                              |
| `DocFormScreen`     | Desk chrome over FrappeForm (toolbar, sidebar, timeline)      | `readOnly`, `hiddenSections`, `hiddenFields`, `defaults` (create prefill), `onSaved`, `onDeleted`, `actionOverrides`                                |
| `QueryReportScreen` | Query/Script Report page                                      | `reportName`, `initialFilters`, `hiddenColumns`, `onRowOpen`, `fixture`                                                                             |
| `QuickEntryDialog`  | Compact create dialog (quick entry)                           | `doctype`, `onCreated`                                                                                                                              |

`hiddenSections` / `hiddenFields` prune the form layout (Section/Tab Break
fieldname or label; fieldnames); capability flags prune whole feature
surfaces; `doctypes` scoping prunes reachability. All three compose.

## Theme toggle

The user menu's "Toggle Theme" needs a host adapter (the package does not own
your color-scheme store):

```tsx
<BackofficeProvider
  appearance={{ scheme, setScheme }}   // e.g. from one's useUserScheme()
  …
>
```

Without it the item renders disabled (some platforms have no scheme store).

## i18n

The package ships English translations under the **`backoffice`** namespace
and registers them on the global i18next instance at provider mount —
additive only (`deep: true, overwrite: false`), so your bundles win. If you
never initialize i18next, the provider brings up a minimal English-only
instance itself.

Override any key:

```ts
import i18next from 'i18next';

i18next.addResourceBundle(
  'en',
  'backoffice',
  { shell: { title: 'Acme Admin' }, userMenu: { logOut: 'Sign out' } },
  true, // deep
  true, // overwrite the bundled defaults
);
```

Ship another language the same way (`addResourceBundle("de", "backoffice", …)`).
Every built-in string also carries an inline English default, so a missing
bundle never renders raw keys.

## Testing your embedding

```tsx
import { render } from "@testing-library/react";
import {
  BackofficeProvider,
  BackofficeShell,
  createMemoryNavigator,
} from "@repo/backoffice";
import { InMemoryFixtureProvider } from "@repo/frappe";

const navigation = createMemoryNavigator("/backoffice");
render(
  <BackofficeProvider
    frappe={{ baseURL: "https://mock.test", fixtures: new InMemoryFixtureProvider({ Workspace: […] }) }}
    navigation={navigation}
  >
    <BackofficeShell>…</BackofficeShell>
  </BackofficeProvider>,
);
navigation.navigate("/backoffice/todo");
expect(navigation.getLocation().path).toBe("/backoffice/todo");
```

`fixtures` swaps every network read for in-memory data — no bench needed.
