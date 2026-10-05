# @repo/test-utils

Shared testing utilities for this monorepo's packages and apps: provider-aware
rendering for Tamagui/React Native Web components, DOM query helpers, and
optional mocks for Frappe and Keycloak integrations.

## Usage in this monorepo

Private workspace package. Add `"@repo/test-utils": "workspace:*"` to the
consuming package's `devDependencies`.

Peers: `react`, `react-dom`, `vitest` (pairs with `@testing-library/react`).

## What it owns

- **`renderWithProviders(ui, options?)`** — renders inside `TamaguiProvider` +
  `QueryClientProvider` (both on by default), optional theme / Frappe / Keycloak
  wrappers; returns an enhanced result with RNW-aware queries (`getInput`,
  `getButton`, `getCheckbox`, `getSelect`, `getSlider`, `getSwitch`,
  `getLabel`, `getError`, …)
- **`TestProviders`**, `createFixture`, `findTextInContainer`
- **`/mocks`** — `createMockFrappeApp`, `mockDocList`, `mockGetDoc`,
  `mockCreateDoc`, `mockUpdateDoc`, `mockDeleteDoc`,
  `createMockKeycloakContext`
- **`/setup`** — vitest setup entry (jsdom shims) for `setupFiles`

## What it must not do

- Never imported by production code — dev dependency only

## Usage

```tsx
import { renderWithProviders } from '@repo/test-utils';

test('renders the user card', () => {
  const { getByText, getButton } = renderWithProviders(<UserCard name="Ada" />);
  expect(getByText('Ada')).toBeInTheDocument();
  expect(getButton('Save')).toBeDefined();
});
```

```ts
// vitest.config.ts
export default defineConfig({
  test: { setupFiles: ['@repo/test-utils/setup'] },
});
```

## License

Apache-2.0

Derived from [multiplatform.one](https://multiplatform.one) (Apache-2.0). See the package LICENSE and the repository NOTICE.
