# global-tsconfig — Development Context

## Overview

Provides a single shared TypeScript base configuration consumed by all packages and apps in the monorepo. Acts as the canonical compiler options baseline to ensure consistency across the workspace.

## Key Files and Structure

```
packages/global-tsconfig/
├── package.json            # name: "global-tsconfig", main: "base-tsconfig.json"
└── base-tsconfig.json      # Shared compiler options baseline
```

## Configuration

`base-tsconfig.json` compiler options:

| Option | Value | Notes |
|--------|-------|-------|
| `target` | `es2024` | Modern JS output |
| `module` | `es2022` | ESM modules |
| `moduleResolution` | `bundler` | Resolves imports like Vite/Next.js bundlers do |
| `strict` | `true` | Full strict mode |
| `esModuleInterop` | `true` | CommonJS default import compatibility |
| `skipLibCheck` | `true` | Skip type-checking of `.d.ts` files in node_modules |
| `forceConsistentCasingInFileNames` | `true` | Prevents case-sensitivity bugs across OSes |
| `outDir` | `dist` | Output directory for compiled files |

`__tests__` is excluded from compilation.

## Usage

Extend in any package or app `tsconfig.json`:

```json
{
  "extends": "global-tsconfig/base-tsconfig.json",
  "compilerOptions": {
    // app/package-specific overrides
  },
  "include": ["src"]
}
```

The package is referenced as `"global-tsconfig": "workspace:*"` in `devDependencies`.

## Development Guidelines

- All packages and apps in the monorepo must extend this config — do not define duplicate compiler options locally.
- Add overrides in the consuming `tsconfig.json` only when a package genuinely requires different settings (e.g., `apps/mobile` adds React Native-specific `lib` entries, `apps/web` adds Next.js plugin).
- Changes to `base-tsconfig.json` affect the entire monorepo — verify all workspaces still build (`pnpm build`) before committing.
- `moduleResolution: "bundler"` is intentional for compatibility with Vite, Next.js, and Expo bundlers. Do not change it to `node` or `node16`.
