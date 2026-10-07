# Frappe TypeScript Language Service Plugin

This plugin generates TypeScript type definitions from your Frappe instance's OpenAPI specification, providing IntelliSense and type checking for your Frappe documents and API calls.

## Installation

The plugin is included in the main `@repo/frappe` package:

```bash
npm install @repo/frappe
```

## Usage

### 1. Configure TypeScript Compiler

Add the plugin to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "@repo/frappe/plugin",
        "openapiUrl": "https://your-frappe-instance.com/api/doc",
        "namespace": "@frappe/types",
        "cacheTTL": 60000
      }
    ]
  }
}
```

### 2. Plugin Configuration Options

| Option       | Type     | Default           | Description                                         |
| ------------ | -------- | ----------------- | --------------------------------------------------- |
| `openapiUrl` | `string` | `""`              | URL to your Frappe instance's OpenAPI documentation |
| `namespace`  | `string` | `"@frappe/types"` | Module namespace for generated types                |
| `cacheTTL`   | `number` | `60000`           | Cache TTL in milliseconds (1 minute)                |

### 3. Import Generated Types

```typescript
import type { User, Task, Doctype } from '@frappe/types';

// Use generated types
const user: User = {
  name: 'john_doe',
  email: 'john@example.com',
  full_name: 'John Doe',
};

// Use generated doctype union
function getDocType(): Doctype {
  return 'User'; // IntelliSense will show all available doctypes
}
```

## How It Works

1. **OpenAPI Fetching**: The plugin fetches your Frappe instance's OpenAPI specification
2. **Type Generation**: Converts OpenAPI schemas to TypeScript interfaces and types
3. **Virtual Files**: Creates a virtual `frappe-virtual-types.d.ts` file with generated types
4. **IntelliSense**: Provides full IntelliSense support for Frappe documents and API calls

## Generated Types

### Document Types

For each Frappe DocType, the plugin generates:

- Interface definitions for document fields
- Optional/required field detection based on Frappe schema
- Proper TypeScript types (string, number, boolean, arrays, etc.)

### Enum Types

For fields with predefined options, the plugin generates:

- Union types for enum values
- Proper string literal types

### Doctype Union

A union type of all available DocType names:

```typescript
type Doctype = "User" | "Task" | "Project" | ...;
```

## Example Generated Output

```typescript
declare module '@frappe/types' {
  export type Doctype = 'User' | 'Task' | 'Project';

  export interface User {
    name: string;
    email: string;
    full_name: string;
    user_type?: 'System User' | 'Website User';
    enabled?: number;
  }

  export interface Task {
    name: string;
    subject: string;
    status?: 'Open' | 'Working' | 'Completed' | 'Cancelled';
    priority?: 'Low' | 'Medium' | 'High' | 'Urgent';
    assigned_to?: string;
  }
}
```

## Integration with Main Library

The plugin works seamlessly with the main `@repo/frappe` library:

```typescript
import { FrappeApp } from '@repo/frappe';
import type { User, Task } from '@frappe/types';

const frappe = new FrappeApp({
  url: 'https://your-frappe-instance.com',
});

// Fully typed API calls
const users: User[] = await frappe.db.getList('User');
const user: User = await frappe.db.getDoc('User', 'john_doe');

// Type-safe mutations
await frappe.db.setValue('Task', 'task-001', 'status', 'Completed');
```

## Caching

The plugin caches the OpenAPI specification to improve performance:

- Default cache TTL: 60 seconds
- Configurable via `cacheTTL` option
- Automatic cache invalidation

## Troubleshooting

### Plugin Not Loading

- Ensure the plugin is correctly configured in `tsconfig.json`
- Verify the `openapiUrl` is accessible
- Check TypeScript server logs for errors

### Types Not Appearing

- Restart your TypeScript language server
- Clear your editor's TypeScript cache
- Verify OpenAPI endpoint is returning valid JSON

### Performance Issues

- Increase `cacheTTL` for less frequent API calls
- Use a local OpenAPI spec file if network is slow
- Consider excluding large schemas from generation
