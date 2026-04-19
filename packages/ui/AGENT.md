# @repo/ui — Development Context

## Overview

Web-only shared component library built on Shadcn UI (new-york style), Radix UI primitives, Tailwind CSS v4, and `class-variance-authority`. Not used by the mobile app. Consumed exclusively by `apps/web`.

## Key Files and Structure

```
packages/ui/
├── components.json              # Shadcn CLI config (style: new-york, cssVariables: true, iconLibrary: lucide)
├── package.json                 # Exports map: ".", "./components/*", "./lib/*", "./styles.css"
├── src/
│   ├── index.ts                 # Re-exports everything from ./lib/utils and ./components/ui
│   ├── styles/
│   │   └── globals.css          # Tailwind v4 entry: @import "tailwindcss", CSS variables (light/dark), @source paths
│   ├── lib/
│   │   └── utils.ts             # cn() helper (clsx + twMerge), getLocalePath()
│   ├── hooks/
│   │   └── use-mobile.ts        # useIsMobile() — window.matchMedia breakpoint at 768px
│   └── components/ui/
│       ├── index.ts             # Named re-exports for every component
│       ├── alert-dialog.tsx
│       ├── avatar.tsx
│       ├── badge.tsx
│       ├── breadcrumb.tsx
│       ├── button.tsx
│       ├── calendar.tsx
│       ├── card.tsx
│       ├── checkbox.tsx
│       ├── collapsible.tsx
│       ├── command.tsx
│       ├── dialog.tsx
│       ├── dropdown-menu.tsx
│       ├── form.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── popover.tsx
│       ├── radio-group.tsx
│       ├── scroll-area.tsx
│       ├── select.tsx
│       ├── separator.tsx
│       ├── sheet.tsx
│       ├── sidebar.tsx
│       ├── skeleton.tsx
│       ├── textarea.tsx
│       └── tooltip.tsx
```

Each component also has a `.stories.tsx` and `.mdx` file for Storybook.

## Usage

### Import patterns

```typescript
// Barrel import from package root (all components + cn utility)
import { Button, Input, cn } from "@repo/ui";

// Direct component import via exports map
import { Button } from "@repo/ui/components/button";

// Utilities
import { cn } from "@repo/ui/lib/utils";

// Styles — import once in apps/web layout
import "@repo/ui/styles.css";
```

### Tailwind CSS

`globals.css` uses Tailwind v4 with `@source` directives that scan both `packages/ui/src/components` and `apps/web/src`. All colors are CSS custom properties (HSL variables). Theme tokens: `bg-background`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `bg-destructive`, etc.

## Development Guidelines

### When to use `packages/ui` vs `apps/web/src/components`

- **Use `packages/ui`**: Generic, reusable primitives needed as-is (Button, Dialog, Input, etc.).
- **Use `apps/web/src/components`**: App-specific compositions built on top of these primitives (e.g., a `BoardCard` that uses `Card` + `Button`). Prefer this before modifying Shadcn components.

### Adding a new Shadcn component

1. Run the Shadcn CLI from `packages/ui`: `pnpm dlx shadcn@latest add <component-name>`
2. The component lands in `src/components/ui/<component-name>.tsx`.
3. Add named exports to `src/components/ui/index.ts`.
4. The exports map wildcard (`"./components/*"`) already covers it — no `package.json` change needed.

### Modifying existing components

Modify `apps/web/src/components` first. Only modify files in `src/components/ui/` as a last resort when the change must be shared across the monorepo.

### Theme customization

Edit CSS variable values in `src/styles/globals.css` under `@layer base :root` and `.dark`. Never hardcode color values in component files — always use Tailwind token classes.

### `cn()` utility

Always use `cn()` from `@repo/ui` (or `@repo/ui/lib/utils`) for conditional className merging. It combines `clsx` and `tailwind-merge` to handle Tailwind class conflicts correctly.
