# URL State Management Hooks

Cross-platform hooks for managing URL state in forms and other components. These hooks work seamlessly across web (React Router) and native (React Navigation) platforms.

## Installation

```bash
npm install @repo/router
```

## Hooks

### `useSearchParams`

Basic hook for reading and writing URL search parameters.

```typescript
import { useSearchParams } from "@repo/router";

function SearchForm() {
  const [searchParams, setSearchParams] = useSearchParams();

  const handleSearch = (query: string) => {
    setSearchParams({ q: query }, { debounceMs: 300 });
  };

  return (
    <input
      value={searchParams.q || ""}
      onChange={(e) => handleSearch(e.target.value)}
    />
  );
}
```

### `useUrlState`

Advanced hook for syncing complex form state with URL parameters, with automatic serialization/deserialization.

```typescript
import { useUrlState } from "@repo/router";

interface FormState {
  name: string;
  age: number;
  tags: string[];
  settings: {
    theme: "light" | "dark";
    notifications: boolean;
  };
}

function MyForm() {
  const [formState, setFormState] = useUrlState<FormState>({
    name: "",
    age: 0,
    tags: [],
    settings: {
      theme: "light",
      notifications: true,
    },
  }, {
    debounceMs: 500, // Debounce URL updates by 500ms
  });

  return (
    <form>
      <input
        value={formState.name}
        onChange={(e) => setFormState({ name: e.target.value })}
      />
      {/* Form fields... */}
    </form>
  );
}
```

### `useTypedSearchParams`

Type-safe parsing of URL parameters with schema validation.

```typescript
import { useTypedSearchParams } from "@repo/router";

function DataTable() {
  const params = useTypedSearchParams({
    page: {
      default: 1,
      parse: (value) => value ? parseInt(String(value), 10) : 1,
    },
    limit: {
      default: 20,
      parse: (value) => value ? parseInt(String(value), 10) : 20,
    },
    sortBy: {
      default: "created",
    },
    sortOrder: {
      default: "desc" as "asc" | "desc",
      parse: (value) => value === "asc" ? "asc" : "desc",
    },
  });

  // params is fully typed: { page: number; limit: number; sortBy: string; sortOrder: "asc" | "desc" }

  return (
    <div>
      Page {params.page} of results
    </div>
  );
}
```

### `useShareableUrl`

Generate a shareable URL with current state.

```typescript
import { useShareableUrl } from "@repo/router";

function ShareButton() {
  const shareableUrl = useShareableUrl();

  const handleShare = () => {
    navigator.clipboard.writeText(shareableUrl);
  };

  return (
    <button onClick={handleShare}>
      Copy Link: {shareableUrl}
    </button>
  );
}
```

## Integration with TanStack Form

Example of integrating URL state with TanStack Form:

```typescript
import { useForm } from "@tanstack/react-form";
import { useUrlState } from "@repo/router";

function UrlSyncedForm() {
  const [urlState, setUrlState] = useUrlState({
    name: "",
    email: "",
    subscribe: false,
  });

  const form = useForm({
    defaultValues: urlState,
    onSubmit: async ({ value }) => {
      // Submit logic
      console.log("Submitting:", value);
    },
  });

  // Sync form changes to URL
  useEffect(() => {
    const subscription = form.subscribe((state) => {
      if (state.values) {
        setUrlState(state.values);
      }
    });
    return () => subscription.unsubscribe();
  }, [form, setUrlState]);

  return (
    <form.Provider>
      <form onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}>
        <form.Field name="name">
          {(field) => (
            <input
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        {/* More fields... */}
      </form>
    </form.Provider>
  );
}
```

## Features

- ✅ **Cross-platform**: Works on web, iOS, and Android
- ✅ **Type-safe**: Full TypeScript support
- ✅ **Debouncing**: Built-in debounce support for performance
- ✅ **SSR-friendly**: Works with server-side rendering
- ✅ **Flexible serialization**: Customize how state is stored in URLs
- ✅ **Array & object support**: Handle complex data structures
- ✅ **Default values**: Automatic fallback to defaults

## Best Practices

1. **Debounce text inputs** - Use 300-500ms debounce for text fields
2. **Update on blur** - For better UX, consider updating URL on field blur
3. **Keep URLs readable** - Use meaningful parameter names
4. **Limit URL length** - Store only essential state in URLs
5. **Handle hydration** - Use `defaultValue` for SSR compatibility

## SSR Considerations

These hooks are SSR-safe. During server-side rendering:

- URL parameters are read from the request
- Forms are pre-populated with URL values
- Hydration preserves user input

```typescript
// SSR-safe form with URL state
function SSRForm() {
  const [state, setState] = useUrlState(
    { search: "" },
    { debounceMs: 500 }
  );

  return (
    <input
      defaultValue={state.search} // Use defaultValue for SSR
      onChange={(e) => setState({ search: e.target.value })}
    />
  );
}
```
