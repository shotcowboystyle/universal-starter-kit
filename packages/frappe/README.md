# Frappe Live Sync SDK

Real-time sync for Frappe with **TanStack DB integration**, **virtual pagination**, **active tab priority leadership**, and enterprise features.

## Documentation

### [docs/complete-reference.md](./docs/complete-reference.md)

Comprehensive technical reference containing architecture, implementation details, server specification, and production deployment.

### Live protocol spec (of record)

The wire protocol — change stream ordering, compound cursors, tombstones, idempotency, and Keycloak auth — is specified in `agent-os/specs/2026-08-12-frappe-live-protocol/spec.md` in the [universal-starter-kit repo](https://github.com/shotcowboystyle/universal-starter-kit/mpo). Where this README and the spec disagree, the spec wins.

## Core Features

### Virtual Pagination

- Progressive cache with page islands for efficient large datasets
- Cursor-based pagination via the Frappe Live extension app (`live`)
- Opt-in via `progressive: true` on subscription queries
- Automatic consistency across pages

### Data Integrity

- **Version checking** with 409/412 errors (OCC via `If-Match` header)
- **Three-way merge** conflict resolution with field-level strategies
- **Idempotency** via `Idempotency-Key` headers — the server dedupes replayed create/delete requests (24h retention)
- **CRDT-like field merging** (sum, max, min, union-set, custom)

### Offline Support

- **IndexedDB / KV persistence** via `persistKey` config
- **Mutation journal** with configurable TTL (default: 24hr)
- **Automatic replay** on reconnection
- **Cross-tab coordination** via BroadcastChannel + leader election

### Real-time Sync

- **WebSocket** via Socket.IO with exponential backoff
- **CDC with checkpoints** for incremental sync after disconnects
- **Tombstone support** for tracking deletions
- **Optional periodic CDC polling** via `cdcInterval` for safety net
- **Intelligent rehydration** after mutations and remote changes

### Advanced Features

- **Active tab priority leadership** with graceful handoffs
- **Mutation batching** (opt-in via `enableBatching`)
- **Progressive pagination** for infinite scroll with full sync
- **Normalized cache** with optional LRU eviction
- **Devtools panel** for inspecting subscriptions, cache, and journal

## Installation

```bash
npm install @repo/frappe
```

## Authentication

`auth.token` accepts a string **or an async getter** — pass a getter so rotated tokens are resolved lazily per request (e.g. a Keycloak access token from `@repo/keycloak`'s `getKeycloakBearerToken()`):

```typescript
import { AuthType, FrappeApp } from '@repo/frappe';

const app = new FrappeApp('https://your-instance.frappe.cloud', {
  useToken: true,
  type: AuthType.Bearer,
  token: async () => (await getToken()) ?? '', // empty = guest, no bare header
});
```

The same `Authorization` header authenticates the realtime socket. Browsers cannot set headers on a WebSocket handshake, so on web the client handshakes over Socket.IO polling (the XHR carries the header) and upgrades to websocket afterwards; Node/native attach it to the websocket directly. On `disconnect`, `connect_error`, and every reconnect attempt the token getter is re-resolved into the live socket manager, so subscriptions and rooms survive token expiry mid-session (`updateAuth()` covers explicit rotation). With Keycloak, the bench validates the JWT via the `frappe_keycloak` app — REST and socket connections take the same validation path.

## React Hooks

### When to Use What

| Hook                    | Use Case                                                                     | Updates               |
| ----------------------- | ---------------------------------------------------------------------------- | --------------------- |
| `useFrappeCollection`   | Creates a TanStack DB collection backed by a Frappe doctype                  | Auto-updates          |
| `useLiveQuery`          | Reactive TanStack DB query with `.where()`, `.orderBy()`, etc.               | Auto-updates          |
| `useFrappeInfiniteList` | Infinite scroll with full sync (realtime, offline, CDC)                      | Auto-updates          |
| `useLinkSearch`         | Debounced backend link search (`frappe.desk.search.search_link`) for pickers | Per query (debounced) |
| `useLinkTitle`          | Resolve a link value's display title (`get_link_title`, session-cached)      | On value change       |

### useFrappeCollection + useLiveQuery

```tsx
import { useFrappeCollection, useLiveQuery, eq } from '@repo/frappe';

// List with ordering
const collection = useFrappeCollection<Pokemon>(config, 'Pokemon', { fields });
const { data } = useLiveQuery(
  (q) => (collection ? q.from({ pokemon: collection }).orderBy(({ pokemon }) => pokemon.poke_id, 'asc') : null),
  [collection],
);

// Single document with filtering
const { data } = useLiveQuery(
  (q) => (collection ? q.from({ pokemon: collection }).where(({ pokemon }) => eq(pokemon.name, id)) : null),
  [collection, id],
);
```

### useFrappeInfiniteList

```tsx
import { useFrappeInfiniteList } from '@repo/frappe';

function PokemonList() {
  const { items, hasMore, isLoading, sentinelRef } = useFrappeInfiniteList<Pokemon>({
    config: { baseURL: 'https://your-instance.frappe.cloud', auth: { token: '...' } },
    doctype: 'Pokemon',
    fields: ['name', 'pokemon_name', 'poke_id'],
    orderBy: { field: 'poke_id', order: 'asc' },
    pageSize: 20,
  });

  if (isLoading && items.length === 0) return <Spinner />;

  return (
    <div>
      {items.map((pokemon) => (
        <PokemonCard
          key={pokemon.name}
          pokemon={pokemon}
        />
      ))}
      <div ref={sentinelRef}>{hasMore ? <Spinner /> : 'No more items'}</div>
    </div>
  );
}
```

## Quick Start

```typescript
import { FrappeApp } from '@repo/frappe';

const app = new FrappeApp('https://your-instance.frappe.cloud', {
  token: 'your-token',
});

// Use the sync module for advanced features
const sync = app.sync();

// Subscribe to documents
const { subscriptionId } = await sync.subscribe({
  doctype: 'Task',
  filters: { status: 'Open' },
  limit: 20,
});

// Mutate with automatic conflict resolution
await sync.mutate({
  mutationId: crypto.randomUUID(),
  operation: 'update',
  doc: { doctype: 'Task', name: 'TASK-001', status: 'Complete' },
  version: task.modified,
});
```

## Architecture

```
SyncModule (orchestrator)
├── SubscriptionManager
│   ├── Subscribe / unsubscribe lifecycle
│   ├── CDC backfill (backfillSub)
│   ├── Client-side filter evaluation
│   └── VirtualPageManager (opt-in progressive pagination)
│       ├── Page islands (contiguous + non-contiguous cache)
│       ├── Cursor + offset fetching
│       └── Remote change handlers
├── MutationEngine
│   ├── Optimistic create / update / delete with rollback
│   ├── Version checking (OCC via If-Match)
│   ├── Three-way merge with field-level strategies
│   ├── Cross-page coordination (global optimistic doc registry)
│   └── Optional batch queue (enableBatching)
├── MutationJournal
│   ├── Pending / confirmed / failed tracking
│   ├── TTL-based auto-cleanup
│   └── Rate-limited replay on reconnect
├── NormalizedCache
│   ├── Per-doctype document store
│   └── Optional LRU eviction (maxCacheSize)
├── RealtimeHandler
│   ├── Socket.IO doc_update / list_update events
│   ├── Authoritative REST fetch on event
│   └── Connection state management
├── RehydrationManager
│   ├── FetchItemOnly / FullRefresh strategies
│   ├── Priority-based task queue
│   └── Debounced processing
└── PersistenceManager
    ├── IndexedDB / KV snapshots (persistKey)
    ├── Multi-tab leader election (localStorage)
    ├── BroadcastChannel cross-tab sync
    └── Active tab priority handoff
```

## Lifecycle catch-up for resource-only servers

CDC remains the default. Servers that provide resource reads without the CDC
extension can explicitly select snapshot catch-up on the shared provider:

```tsx
<FrappeProvider
  baseURL={baseURL}
  realtime={false}
  syncOptions={{ catchUpStrategy: 'snapshot' }}>
  <App />
</FrappeProvider>
```

`realtime={false}` controls the socket only. Focus, online, socket reconnect and
cross-tab catch-up use the selected strategy. The optional `cdcInterval` is the
interval in milliseconds for either strategy; zero or omission disables the
timer. Snapshot catch-up uses `refreshSubscriptions()` and preserves mounted
collection identity. It does not provide CDC or cursor-extension endpoints.
Snapshot mode refuses progressive subscriptions before their first fetch.

```tsx
import { useFrappeCatchUp } from '@repo/frappe';
import { useFrappeConfig } from '@repo/frappe-ui';

const { refreshing, stale, error, retry } = useFrappeCatchUp(useFrappeConfig());
// Keep current rows mounted; show stale/error beside them when present.
// A Retry button can call: () => void retry()
```

The hook exposes connection-level catch-up state. `stale` means at least one
selected active subscription could not reconcile; it does not identify every
individual row as wrong. `refreshing` is independent of initial collection
loading. Network failures retain rows and the error. Retrying keeps the old
qualification until successful catch-up clears it. Snapshot errors aggregate
the failed subscriptions' original errors; CDC errors retain the original error.
Undefined config and SSR expose idle state and an inert retry.

The underlying `sync.catchUp()` and hook `retry()` resolve to
`{ refreshing, stale, error }`, including on network failure. Direct
`sync.backfill(args)` still means CDC and still rejects, even on a snapshot
module. Direct `refreshSubscriptions()` retains its per-subscription results.
Catch-up state describes the latest lifecycle/retry attempt; direct refreshes
do not clear a previous catch-up error. No failure causes a collection remount
or an automatic retry on render.

Overlapping catch-up triggers join one active operation, with at most one
trailing read per burst. Triggers during that trailing read join it; a later
event or explicit Retry can start another operation. Reset/dispose invalidates
pending catch-up state publication.

Shared live and fixture modules distinguish effective sync options, including
the strategy. Equivalent plain option values share a module. Callbacks and
storage implementations are compared by reference; keep those references
stable if they describe the same connection. Changing options moves collection
and status hooks to the corresponding module. The cache key is never logged.

### Writes on a resource-only server

Create, update and delete call the `live` app too (`live.live.api.create_doc`,
`update_doc`, `delete_doc`, `batch_mutations`), so a bench without it refuses
every write with 417 "App live is not installed". Select resource writes for
such a bench:

```tsx
<FrappeProvider
  baseURL={baseURL}
  syncOptions={{ catchUpStrategy: 'snapshot', writeStrategy: 'resource' }}>
  <App />
</FrappeProvider>
```

Writes then go to Frappe's own routes: `POST /api/resource/<doctype>`,
`PUT /api/resource/<doctype>/<name>` and `DELETE /api/resource/<doctype>/<name>`.
Permissions are the bench's, exactly as on the live path. A `FrappeApp` takes
the same choice as `frappeLive: { writeStrategy: "resource" }`.

What changes against `live`:

- An update carries its `base_modified` as `modified`, so Frappe's own check
  refuses a stale write. The resulting TimestampMismatchError surfaces as a 409,
  and an update of a missing document as a 412, so the mutation engine
  reconciles conflicts the same way it does on `live`.
- A delete of a document that is already gone succeeds, like `live`'s.
- There is no idempotency key. A create retried after a lost response can
  insert a second document.
- A batch runs one request per mutation, in order, and reports each outcome.
  An atomic batch is refused before anything is sent, since nothing spans the
  requests to roll back.

## Refresh mounted snapshots

```typescript
const results = await sync.refreshSubscriptions({ doctypes: ['Task'] });
const failures = results.filter((result) => !result.ok);
```

`refreshSubscriptions()` refreshes every active subscription. `doctypes: []` or
unknown doctypes select none; dormant persisted subscriptions are excluded.
Shared subscriptions return one result per id. No `persistKey` is required.
`SubscriptionRefreshOptions` and `SubscriptionRefreshResult` are exported from
the package root.

Each refresh reads the original fields, filters, order and query window. An
omitted or null limit uses the default page length; `limit: 0` stays unlimited.
Accepted responses replace membership, including deletions and empty results,
while mounted collections keep their identity. Cached documents outside that
membership remain available to other subscriptions.

Failures return `{ subscriptionId, ok: false, error }`, retain the last committed
snapshot and mark the active subscription stale. Progressive subscriptions return
`Snapshot refresh does not support progressive subscriptions` without fetching or
changing their pagination state. Other selected subscriptions still refresh.

Requests overlapping an in-flight read coalesce into a trailing read. All callers
receive its final outcome; superseded responses never commit. Detaching the last
consumer or resetting the cache invalidates pending refreshes. Re-adoption serves
cached rows immediately and coordinates its background refresh with explicit calls.
Store readers are notified when selected operations settle.

## Conflict Resolution

```typescript
const sync = new SyncModule(db, realtime, {
  fieldMergeConfig: {
    Task: {
      tags: 'union-set',
      progress: 'max',
      time_spent: 'sum',
      description: 'server-wins',
      custom_field: (base, client, server) => {
        // Custom resolution logic
        return client ?? server;
      },
    },
  },
});
```

## Server Requirements

The SDK works with standard Frappe REST API for reads and uses the Frappe Live extension app (`live`, endpoints `live.live.api.*`) for enhanced write operations. The extension provides:

- **Idempotent create/delete** — the server records each successful `create_doc`/`delete_doc` outcome against its `Idempotency-Key` (scoped per user and per endpoint, 24h TTL) and a retry with the same key returns the recorded outcome instead of re-executing. The SDK sends its `client_mutation_id` as this header on every mutation.
- **OCC update** via `If-Match` header (409/412 on version mismatch) — update retries are guarded by version checking, not idempotency dedup
- **Cursor-based pagination** via `get_list_with_cursor`
- **Batch mutations** via `batch_mutations`
- **CDC endpoints** via `list_since` and `backfill` — one merged change stream of rows + deletions, ordered by an opaque compound `"timestamp|name"` checkpoint that never advances past an undelivered change
- **Tombstone feed** — names-only deletions sourced from frappe core's `Deleted Document` rows (30-day retention; older cursors full-refresh) plus a `doc_deleted` realtime event after the deleting transaction commits
- **Permission-checked reads** — the change feed goes through frappe's permission engine; unauthorized doctypes raise instead of leaking rows

For Keycloak bearer auth, the bench additionally needs the `frappe_keycloak` app (JWT validation + role mapping on REST and socket connections).

## Production Configuration

```typescript
const sync = new SyncModule(db, realtime, {
  persistKey: 'my-app', // Enable IndexedDB persistence
  cdcInterval: 30000, // Periodic CDC every 30s (safety net)
  backfillMaxPages: 20, // Max CDC pages drained per backfill (bounds both drain paths)
  maxCacheSize: 5000, // LRU eviction threshold
  mutationTTL: 24 * 60 * 60 * 1000, // 24hr mutation journal TTL
  enableBatching: false, // Opt-in mutation batching
  fieldMergeConfig: {/* ... */}, // Per-doctype merge strategies
  onConflict: (info) => console.warn('Conflict:', info),
  onMutationError: ({ mutation, err }) => reportError(err),
});
```

## Testing

```bash
pnpm test
```

## License

Apache 2.0
