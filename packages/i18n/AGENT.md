# @repo/i18n — Development Context

## Overview

Single source of truth for EN/DE translations shared across `apps/web` (next-intl) and `apps/mobile` (i18next). Provides locale constants, a `Messages` type derived from the English JSON, and both locale objects for direct consumption.

## Key Files and Structure

```
packages/i18n/
├── package.json              # Exports: "." → src/index.ts, "./locales/en", "./locales/de"
└── src/
    ├── index.ts              # Exports: messages, locales, defaultLocale, Locale type, Messages type, en, de
    └── locales/
        ├── en.json           # English translations
        └── de.json           # German translations (same keys as en.json)
```

## Translation structure

Top-level namespaces in `en.json` / `de.json`:

| Namespace | Contents |
|-----------|----------|
| `metadata` | Page title, description |
| `login` | Auth form labels, messages |
| `sidebar` | Navigation labels |
| `kanban` | Board, project, and task UI strings (nested: `kanban.actions`, `kanban.project`, `kanban.task`) |
| `common` | Shared action labels (back, cancel, delete, edit, save, create, loading) |
| `user` | User actions (logOut) |
| `theme` | Theme toggle labels |
| `error` | Error page strings |

Interpolation uses `{placeholder}` syntax. Common tokens: `{appName}`, `{title}`, `{error}`, `{name}`.

## Usage

### Web (next-intl)

`apps/web/src/lib/get-cached-messages.ts` loads and interpolates translations:
```typescript
import { messages, type Locale } from "@repo/i18n";

function interpolateAppName(obj) { /* replaces {appName} with APP_NAME constant */ }

export async function getCachedMessages(locale: Locale) {
  "use cache";
  cacheLife("days");
  const localeMessages = messages[locale] ?? messages.en;
  return interpolateAppName(localeMessages);
}
```

Components use `useTranslations("kanban")` from next-intl. The `{appName}` token is resolved server-side before messages reach the client.

### Mobile (i18next)

`apps/mobile/lib/i18n/index.ts` initializes i18next with `defaultVariables: { appName: "Expo Project Manager" }`. The `{appName}` token is resolved at render time by i18next interpolation. Language preference is persisted via AsyncStorage (`apps/mobile/lib/language.ts`) and device locale is detected via `expo-localization`.

## How to add a new translation key

1. Add the key to `src/locales/en.json` under the appropriate namespace.
2. Add the matching key with German translation to `src/locales/de.json`. Both files must stay in sync — the `Messages` type is derived from `en.json`, so missing DE keys produce TypeScript errors in typed consumers.
3. Use the key in web via `useTranslations("namespace")("key")` and in mobile via `t("namespace.key")`.

## Development Guidelines

- `Messages` type is `typeof en` — `en.json` is the authoritative schema. Keep `de.json` structurally identical.
- Use `{placeholder}` tokens for dynamic values; never concatenate strings around translated text.
- Do not add app-specific keys that only one platform uses — prefer app-local translation files for those.
- `locales` is `["en", "de"] as const` and `defaultLocale` is `"en"`. Adding a new locale requires updating `src/index.ts` and creating the corresponding JSON file.
