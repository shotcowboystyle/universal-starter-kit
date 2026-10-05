# @repo/i18n

Internationalization for this monorepo: [i18next](https://www.i18next.com)
config factory, language detection/persistence, an optional Frappe translation
backend, and locale-aware formatters.

## Usage in this monorepo

Private workspace package. Add `"@repo/i18n": "workspace:*"` to the
consuming package's `dependencies`.

Peers: `i18next`, `react` (pair with `react-i18next` in the app).

## What it owns

- **`createI18nConfig(options)`** — builds the i18next config from
  `languages`, `namespaces`, `defaultLanguage`, `defaultNamespace`, bundled
  `resources`, and an optional Frappe backend
- **`createFrappeBackend(options)`** — loads translations from a Frappe server
- **Language handling** — `useLanguage()`, `detectLanguage()`,
  `persistLanguage()` / `getPersistedLanguage()` (cookie-based, SSR-safe)
- **Formatters** — `useFormatDate`, `useFormatNumber`, `useFormatCurrency`
  (+ non-hook `createDateFormatter`, `createNumberFormatter`,
  `createCurrencyFormatter`)

## What it must not do

- No UI and no translation _content_ — apps own their resources/namespaces

## Usage

```ts
import { createI18nConfig } from '@repo/i18n';
import common from './locales/en/common.json';

export const i18nConfig = createI18nConfig({
  languages: ['en', 'te'],
  namespaces: ['common'],
  defaultLanguage: 'en',
  defaultNamespace: 'common',
  resources: { en: { common } },
});
```

```tsx
import { useLanguage, useFormatCurrency } from '@repo/i18n';

const [language, setLanguage] = useLanguage();
const formatCurrency = useFormatCurrency();
```

## License

Apache-2.0

Derived from [multiplatform.one](https://multiplatform.one) (Apache-2.0). See the package LICENSE and the repository NOTICE.
