# @repo/forms

Cross-platform form components with URL state management for this monorepo's web and mobile apps.

## Features

- 🔄 **URL State Sync**: Automatically sync form state with URL parameters
- 📱 **Cross-Platform**: Works on web, iOS, and Android
- 🎨 **Tamagui Components**: Beautiful, themeable form components
- 🏗️ **TanStack Form**: Powerful form state management
- 🔍 **SSR Support**: Server-side rendering with proper hydration
- 📝 **TypeScript**: Full type safety

## Usage in this monorepo

Private workspace package. Add `"@repo/forms": "workspace:*"` to the
consuming package's `dependencies`.

## Basic Usage

```tsx
import { Form, Input, Checkbox, Button } from '@repo/forms';

function MyForm() {
  return (
    <Form
      syncWithUrl={true}
      urlDebounceMs={500}
      onSubmit={async (values) => {
        console.log('Form submitted:', values);
      }}>
      <Input
        name="email"
        label="Email"
        validators={{
          onChange: ({ value }) => (!value?.includes('@') ? 'Invalid email' : undefined),
        }}
      />

      <Input name="password" label="Password" type="password" />

      <Checkbox name="remember" label="Remember me" />

      <Button type="submit">Sign In</Button>
    </Form>
  );
}
```

## URL State Synchronization

Enable automatic URL state synchronization to create shareable form states:

```tsx
<Form
  syncWithUrl={true}
  urlDebounceMs={500}
  formOptions={{
    defaultValues: {
      search: '',
      category: 'all',
      sortBy: 'date',
    },
  }}>
  {/* Form fields */}
</Form>
```

This will automatically sync form values to the URL:

```text
?search=hello&category=tech&sortBy=date
```

## Advanced Usage with TanStack Form

```tsx
import { useForm, Form, Input } from '@repo/forms';

function AdvancedForm() {
  const form = useForm({
    defaultValues: {
      name: '',
      age: 0,
    },
    validators: {
      onChange: ({ value }) => {
        if (value.age < 0) {
          return 'Age must be positive';
        }
      },
    },
  });

  return (
    <Form form={form} syncWithUrl={true}>
      <Input
        name="name"
        label="Name"
        validators={{
          onChange: ({ value }) => ((value?.length ?? 0) < 3 ? 'Name too short' : undefined),
        }}
      />

      <Input name="age" label="Age" type="number" />

      <Button type="submit" />
    </Form>
  );
}
```

## SSR Support

The forms work seamlessly with server-side rendering:

```tsx
// Server-side: Forms pre-populate from URL
// Client-side: Hydration preserves user input

function SSRForm() {
  return (
    <Form syncWithUrl={true}>
      <Input
        name="search"
        label="Search"
        defaultValue="" // SSR-safe default
      />
    </Form>
  );
}
```

## readOnly vs disabled

| Aspect     | readOnly        | disabled        |
| ---------- | --------------- | --------------- |
| Editable   | No              | No              |
| Submitted  | Yes             | Typically no    |
| Appearance | Normal          | Grayed out      |
| A11y       | `aria-readonly` | `aria-disabled` |

All fields support `readOnly`. Use when the value should be visible and submitted but not editable.

## Link behavior (linkResolver)

Optional link rendering when displaying values:

- **Field-level:** `linkResolver?: (value) => Href | null` on Input (and similar)

When `linkResolver` returns a non-null href, the value renders as `<Link href={...}>`. In edit mode, normal input is shown. Link behavior applies in readOnly/display mode.

**Frappe:** Schema mapping (doctype → linkResolver) belongs in an optional integration layer. Core forms stay doctype-agnostic.

## Package Structure

```text
src/
├── index.ts              # Public exports
├── form/                 # Form wrapper, context
├── fields/               # Field components
│   ├── datePicker/       # DatePicker, MultiDatePicker, DateRangePicker, Calendar
│   ├── colorPicker/
│   └── ...
├── fieldLayout.tsx       # Label, error, helper text layout
└── utils/LinkCell.tsx    # Link wrapper for linkResolver
```

## Components

### Form

Main form wrapper that provides context and handles submission.

### Input

Text input field with validation support.

### Checkbox

Checkbox input with label.

### Select

Dropdown selection field.

### Combobox

Searchable picker (single or multi select). Options filter client-side by default,
or search asynchronously via the async-options contract:

- `onSearch(query)` — called debounced (200ms) while the dropdown is open; may
  return a cleanup function to cancel in-flight work. When set, client-side
  filtering is disabled — `options` are treated as the server's result set.
- `loading` — spinner in the list area. Priority is options > loading > empty
  message, so a stale "no matches" never shows mid-request and the spinner
  never covers real results.
- `searchError` — honest failure message rendered inside the dropdown (takes
  priority over options/loading/empty).
- `valueLabel` — display label for a selected value that is not (yet) in
  `options` (async: show a saved value's title before any options load).
- `clearable` — clear (×) affordance in the trigger; fires `onChange("")`
  (the canonical change path).
- `ComboboxOption.description` — optional muted second line per option.

### Button

Form submission button; use `type="submit"` for form submission.

## Hooks

### useFormContext

Access the form instance from child components.

### useFormField / useResolvedValidators

Field-authoring hooks: initialize a field against the form context and resolve
its validator timing (see `docs/standards/frontend/field-architecture.md`).

> URL state hooks (`useUrlState`, `useSearchParams`) live in
> `@repo/router`; `<Form syncWithUrl>` uses them internally.

## License

Apache-2.0

Derived from [multiplatform.one](https://multiplatform.one) (Apache-2.0). See the package LICENSE and the repository NOTICE.
