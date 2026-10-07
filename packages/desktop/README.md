# @repo/desktop

Capability interfaces for desktop-only concerns — file system, dialogs, paths,
and updater — behind one import that no-ops (or throws clearly) everywhere the
capability does not exist.

## Install

```bash
pnpm add @repo/desktop
```

Peers (Tauri builds only, all optional): `@tauri-apps/api`,
`@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`,
`@tauri-apps/plugin-updater`.

## What it owns

- **`fs`** — `readTextFile`, `writeTextFile`, `exists`, `mkdir`, `remove`,
  `rename`, `copyFile`
- **`dialog`** — `open`, `save`, `message`, `ask`, `confirm`, `prompt`
- **`paths`** — well-known directories (home, app data, …)
- **`updater`** — check/install app updates

Each API is an interface plus a default implementation, so shared code (for
example `@repo/frappe-ui`'s `FrappeForm` delete confirm) can
import it unconditionally on every platform.

> **State of play.** Tauri is the one backend with a full implementation:
> each API has a `.tauri` file (selected at build time in Tauri bundles) that
> rides the matching `@tauri-apps/plugin-*` peer. A Tauri window running the
> plain web bundle (dev mode) gets the web defaults, which work there — the
> webview has the browser modals.
>
> Outside Tauri: `dialog.message`, `.ask`, `.confirm` and `.prompt` are the
> browser's modal globals and are therefore **web-only**. On GNOME they
> **throw** a named error: GJS has no `window.confirm`, and neither silently
> returning `false` (a confirm button that appears broken) nor silently
> returning `true` (a delete nobody agreed to) is a defensible default for a
> confirmation. `dialog.open` and `.save` return `null` on both. `fs` and
> `paths` report unsupported outside Tauri; `updater` is a no-op there.
>
> The GNOME target has real GTK equivalents available (`Gtk.FileDialog`,
> `Adw.AlertDialog`, `GLib.get_user_*_dir`); wiring them up as
> `index.gnome.ts` files behind these same interfaces is the natural next
> step — the interfaces exist precisely so that lands as an implementation
> rather than an API change.

## What it must not do

- No UI and no window management — this package wraps capabilities, not chrome

## Usage

```ts
import { dialog, fs } from '@repo/desktop';

export async function exportNotes(contents: string) {
  const path = await dialog.save({ defaultPath: 'notes.md' });
  if (!path) return;
  await fs.writeTextFile(path, contents);
  await dialog.message('Notes exported');
}
```

## License

Apache-2.0
