# @repo/platform

Platform detection flags and small cross-platform utilities for this
monorepo — one import to answer "where is this code running?" on web,
native, desktop, and extension surfaces.

## Usage in this monorepo

Private workspace package. Add `"@repo/platform": "workspace:*"` to the
consuming package's `dependencies`.

## What it owns

- **Detection flags** — `isWeb`, `isNative`, `isIos`, `isAndroid`, `isServer`,
  `isClient`, `isGnome`, `isTauri`, `isDesktop`, `isExpo`, `isNext`, `isStorybook`,
  `isChrome`, `isFirefox`, `isWebExtension`, `isChromeExtension`,
  `isFirefoxExtension`, `isIframe`, `isTouchable`, `isWebTouchable`,
  `isWindowDefined`, … plus the full `platform` object (`platform.preciseName`)
- **Env config** — the `config` reader used across packages
- **Utilities** — cookies, clipboard, `downloadFile`, `openUrl`, lifecycle
  helpers

## What it must not do

- No UI, no theming, no data fetching — packages above it (e.g. `theme`)
  build on these flags, so this package stays dependency-light

## Usage

```tsx
import { isGnome, isNative, isServer, isTauri } from '@repo/platform';

export function saveFile(contents: string) {
  if (isServer) return;
  if (isTauri) {
    // webview desktop path (optional integration)
    return;
  }
  if (isGnome) {
    // GTK desktop path (optional integration)
    return;
  }
  if (isNative) {
    // share sheet / expo-file-system path
    return;
  }
  // browser download path
}
```

Flags are evaluated once at module load and are safe to use in render logic
and module scope.

## Save bytes to a file

Import the opt-in subpath from a user action:

```ts
import { FileSaveError, saveFile } from '@repo/platform/file';

try {
  const result = await saveFile({
    bytes: new TextEncoder().encode('café\n'),
    filename: 'example.txt',
    mimeType: 'text/plain; charset=utf-8',
  });
  // Render the returned status, not a blanket success message.
} catch (error) {
  if (error instanceof FileSaveError) {
    console.error(error.code, error.cause, error.cleanupError);
  }
}
```

| Result                                     | What it establishes                                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `written`                                  | Native byte writing completed at `uri`, with `byteLength` and `requestedFilename`. The actual `filename` is optional. Cloud synchronization is not confirmed. |
| `download-requested`                       | A browser download was activated. Browser completion or cancellation is unknown.                                                                              |
| `not-saved`, reason `cancelled-or-refused` | The native picker reported cancellation or refused directory access. No file was created. iOS reports these with the same code.                               |

`WrittenFile.requestedFilename` always records the supplied filename. The optional
`filename` reports the actual name only for an iOS file URI. Android content URIs
omit it: Expo 55.0.26 derives `File.name` from the URI, which can contain an opaque
document ID instead of a provider display name. Consumers must distinguish the
requested name from an actual name and use `uri` for the saved destination.

Errors reject with `FileSaveError`: `invalid-input`, `unavailable`, `busy`,
`picker-failed` or `write-failed`. The original failure is in `cause`.
`cleanupError` records a second failure removing a partially written new file.
Only `ERR_PICKER_CANCELLED` and `ERR_FILE_PICKING_CANCELLED` are classified as
`not-saved`; other picker errors remain observable.

Native iOS/Android requires `expo-file-system` (`~55.0.26`, tested against
55.0.26) in the app and its native binary. Install it explicitly in the native
host. JavaScript or an OTA update cannot add a missing native module. The module
loads only when `saveFile` is invoked, and isn't exported through the platform
root. Other hosts require browser download support or return `unavailable`.

Native opens the system directory picker and creates a new child through the
selected provider. It doesn't request overwrite. A provider can refuse an
existing name or choose a suffix. `requestedFilename` doesn't confirm which name
the provider chose; `filename` is omitted when that metadata isn't established.
Successful files belong to the user and are **never automatically deleted**.
On write failure, cleanup attempts to delete only the newly created child.
No shared cache file or share sheet is involved.

Pass a `Uint8Array`, a nonempty single filename without separators, dot/dot-dot
or control characters, and a MIME type. Unicode filenames and empty files are
valid. Bytes are copied before awaiting the directory picker, including the
exact range of a sliced view. Native creation uses the MIME type without
parameters; the browser Blob retains the supplied type.

The existing root `downloadFile` and `downloadBlob` remain synchronous `void`
helpers. Blob URLs are released after 60 seconds; this delay manages resources
and does not indicate that a download completed.

`Platform/FileSave` is a generic Storybook specimen for parent browser/native
checks. Unit tests model native boundaries. Packed ESM/CJS and Metro checks
are package preflight, not real-device save evidence or registry publication.

## License

Apache-2.0

Derived from [multiplatform.one](https://multiplatform.one) (Apache-2.0). See the package LICENSE and the repository NOTICE.
