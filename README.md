# Full-Stack Multi-Platform Monorepo with AI-Assisted Development: Next.js + Nest.js + React Native (Expo)

[![codecov](https://codecov.io/gh/shotcowboystyle/universal-starter-kit/graph/badge.svg?token=WvGIkvgW39)](https://codecov.io/gh/shotcowboystyle/universal-starter-kit)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=shotcowboystyle_universal-starter-kit&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=shotcowboystyle_universal-starter-kit)
[![CI](https://github.com/shotcowboystyle/universal-starter-kit/actions/workflows/CI.yml/badge.svg)](https://github.com/shotcowboystyle/universal-starter-kit/actions/workflows/CI.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> A production-grade multi-platform monorepo demonstrating shared business logic across Web and Mobile. Built with a write-once approach for state management, validation, and types — while each platform retains full control over its UI and navigation. Showcases engineering practices, decision-making and AI-assisted optimization for senior full-stack roles.

## Architecture & Engineering Decisions

### web

<img src="./apps/web/public/assets/Screen_Recording.gif" alt="Screen Recording" width="270" height="579">

### mobile

<img src="./apps/mobile/assets/images/simulator-screenshot.png" alt="Screen Recording" width="270" height="579">

A production-grade Kanban application demonstrating monorepo architecture, test-driven development, and modern tooling practices. Originally built as a monolithic Next.js app ([next-dnd-starter-kit](https://github.com/shotcowboystyle/next-dnd-starter-kit)), then strategically re-architected to a decoupled frontend/backend system, and now expanded to a **multi-platform solution** with shared business logic across Web and Mobile by AI-assisted development.

### Architectural Evolution

| Aspect                | Before (Monolithic)                        | After (Decoupled Monorepo)                                            | Now (Multi-Platform)                                                | Trade-off Reasoning                                     |
| --------------------- | ------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------- |
| **Team Structure**    | Full-stack developers required             | Specialized Frontend & Backend Teams                                  | **+ Mobile Team with shared domain knowledge**                      | Teams share types/state; onboard faster via shared code |
| **Development Cycle** | Tightly coupled; one change can impact all | Independent development cycles                                        | **Web & Mobile iterate independently on shared foundations**        | Platform teams move at their own pace                   |
| **Deployment**        | Single, monolithic deployment              | Independent Frontend/Backend deployment                               | **+ OTA updates for Mobile via Expo**                               | Three independent release channels                      |
| **Scalability**       | Vertical scaling of the entire app         | Targeted horizontal scaling (e.g., scale only the API service)        | **Same API serves Web & Mobile clients**                            | Single backend; multiple frontends                      |
| **Technology Stack**  | Locked into Next.js for backend            | Flexible backend choice (Nest.js); can add more services (Go, Python) | **+ React Native (Expo) with Tamagui**                              | Best tool per platform; shared logic layer              |
| **Code Reusability**  | Limited to the Next.js app                 | Centralized `ui` & `config` packages                                  | **+ Shared Tamagui `ui`/`forms`/`theme`, `store` and `i18n` packages** | Write once for logic and UI primitives; platform-specific navigation |

### Code Sharing Strategy

The monorepo shares business logic across platforms while keeping UI and navigation platform-specific:

```text
┌──────────────────────────────────────────────────────────────────┐
│                       Shared Packages                            │
│                                                                  │
│  @repo/store       @repo/i18n       @repo/ui       @repo/forms   │
│  ├── Types         ├── en.json      Tamagui        TanStack Form │
│  ├── Zustand       ├── de.json      components    + Tamagui      │
│  │   stores        └── Locale                       fields       │
│  └── Storage           config +     @repo/theme    @repo/tokens  │
│      Adapter           i18next      @repo/router   @repo/config  │
│                        helpers      @repo/platform ...and more   │
├───────────────────┬──────────────────┬───────────────────────────┤
│    apps/web       │   apps/mobile    │   apps/api                │
│    Next.js        │   Expo latest    │   Nest.js                 │
│    App Router     │   Expo Router    │   Express                 │
│    Tamagui        │   Tamagui        │   Rspack                  │
│    localStorage   │   SecureStore    │   MongoDB                 │
│    next-intl      │   i18next        │   EventEmitter2           │
└───────────────────┴──────────────────┴───────────────────────────┘
```

**Shared packages** enable write-once logic across platforms:

- `@repo/store` exports a `createAuthStore()` factory with an injectable `StorageAdapter`, allowing Web to use `localStorage` and Mobile to use `expo-secure-store` — same state logic, platform-appropriate persistence.
- `@repo/i18n` provides a single source of truth for translation strings (EN/DE), consumed by `next-intl` on Web and `i18next` on Mobile. App-specific text (e.g., app name) uses `{appName}` interpolation resolved at runtime by each platform.
- `@repo/ui`, `@repo/forms` and `@repo/theme` provide the Tamagui component catalog, form fields (TanStack Form) and theme config used by both apps.

Most packages are derived from [multiplatform.one](https://multiplatform.one) and are Apache-2.0 licensed; each package keeps its `LICENSE`, and the root `NOTICE` file lists the attribution.

### Features

- Drag-and-drop Kanban with multi-project support (web) / gesture-driven interactions (mobile)
- Custom sorting and synchronization for projects and tasks
- Role-based permissions (Owner / Member)
- Task assignment with audit tracking (lastModifier)
- Search, filter by board ownership (my/team), and status filter (TODO/IN_PROGRESS/DONE)
- Theme switching (light/dark/system) with persisted preferences on both platforms
- Native UX patterns: haptic feedback, context menus, formSheet modals, ActionSheet pickers
- Pull-to-refresh, native search bar (`headerSearchBarOptions`), and platform-specific date pickers
- i18n (English, German) with device locale detection and persisted language preference

### Engineering Metrics

| Metric         | Result                                                        |
| -------------- | ------------------------------------------------------------- |
| Test Coverage  | **80%+** via Vitest (unit + integration)                      |
| Code Quality   | **SonarQube A** across Security, Reliability, Maintainability |
| Performance    | **Lighthouse 90+** on all categories                          |
| E2E Validation | Cross-browser (Chrome, Safari, Edge) via Playwright           |
| CI/CD Pipeline | GitHub Actions → SonarQube + Codecov → Vercel                 |

<img src="./apps/web/public/assets/lighthouse_scores.png" alt="Lighthouse Scores" width="380" height="125">

### Quality Assurance

| Type              | Tool       | Rationale                                     |
| ----------------- | ---------- | --------------------------------------------- |
| Unit/Integration  | Vitest     | Faster than Jest, native ESM, simpler config  |
| E2E               | Playwright | Cross-browser support, lighter than Cypress   |
| Static Analysis   | SonarQube  | Enterprise-grade quality gates in CI          |
| Coverage Tracking | Codecov    | Automated PR integration                      |
| Documentation     | Storybook  | Stories exist for the Tamagui catalog; Storybook config is being reworked |
| Visual Testing    | Storybook  | Planned once the Tamagui Storybook setup is wired |
| Accessibility     | a11y-addon | WCAG compliance checks during development     |

**Testing Strategy:**

- Unit tests target store logic, validations, and isolated components
- Package tests live next to source as `*.test.ts(x)`; apps keep theirs in `__tests__/`
- **Mobile**: test files covering hooks, API clients, auth service, i18n, theme, and store — with monorepo-aware Vitest config that aliases `react-native` to `react-native-web` and deduplicates React across workspaces
- E2E tests validate critical flows (auth)
- Every PR triggers the full pipeline before merge

### Frontend (Web)

| Type      | Choice                   | Rationale                                               |
| --------- | ------------------------ | ------------------------------------------------------- |
| Framework | Next.js (App Router)     | Cache Components (PPR) for mixed static/dynamic content |
| State     | Zustand (shared)         | 40% less boilerplate than Redux, simpler testing        |
| Forms     | TanStack Form + Zod      | Type-safe validation, composable schemas                |
| Database  | MongoDB + Mongoose       | Document model fits board/project/task hierarchy        |
| DnD       | @dnd-kit                 | Lightweight, accessible, extensible                     |
| i18n      | next-intl                | App Router native support, auto locale routing          |
| UI        | Tamagui (`@repo/ui`, `@repo/forms`) | Shared cross-platform design system, tokens and themes |
| Theme     | next-themes + Tamagui themes | Scheme mirrored to a cookie for SSR                 |
| Toasts    | sonner                   | Lightweight, accessible notifications                   |

### Mobile

| Type         | Choice                                         | Rationale                                                              |
| ------------ | ---------------------------------------------- | ---------------------------------------------------------------------- |
| Framework    | Expo latest                                    | Rapid iteration, OTA updates, New Architecture                         |
| Navigation   | Expo Router (typed routes)                     | File-based routing, consistent with Next.js model                      |
| Styling      | Tamagui (`@tamagui/core`)                      | Theme tokens shared with web via `@repo/ui`/`@repo/theme`, dark/light  |
| State        | Zustand (shared via `@repo/store`)             | Same auth store as web with injectable StorageAdapter                  |
| Data Fetch   | TanStack Query                                 | Same caching strategy as web, query key factories                      |
| Gestures     | Gesture Handler + Reanimated                   | Swipe-to-cycle-status, swipe-to-move, spring animations                |
| Storage      | expo-secure-store                              | Encrypted keychain/keystore for auth tokens                            |
| i18n         | i18next + expo-localization                    | Shared translations via `@repo/i18n`, persisted language pref          |
| UX Patterns  | Haptics, Context Menus, FormSheet, ActionSheet | iOS-native interactions: `Link.Menu`, `expo-haptics`, formSheet modals |
| Optimization | React Compiler (experimental)                  | Enabled via `experiments.reactCompiler` in app.json                    |

### Backend

| Type        | Choice                       | Rationale                                            |
| ----------- | ---------------------------- | ---------------------------------------------------- |
| Framework   | Nest.js (Express)            | Structured, scalable architecture for APIs           |
| Language    | TypeScript                   | Strict typing, shared types with frontend            |
| Database    | MongoDB + Mongoose           | Flexible schema, rich querying capabilities          |
| Data Access | Repository Pattern           | Abstracts Mongoose queries, improves testability     |
| Decoupling  | Event-driven (EventEmitter2) | Cascade deletes via events, no circular dependencies |
| Validation  | class-validator              | Decorator-based validation for DTOs                  |
| Auth        | Passport + JWT               | Standard, secure authentication strategies           |

### Developer Experience

| Tool       | Purpose                                           |
| ---------- | ------------------------------------------------- |
| Rspack     | Rust-based bundler for 5-10x faster than webpack  |
| Turbopack  | Rust bundler with filesystem caching for fast HMR |
| Oxlint     | 50-100x faster than ESLint, clearer diagnostics   |
| Oxfmt      | 30x faster formatter than Prettier                |
| Husky      | Pre-commit quality enforcement                    |
| Commitizen | Conventional commits for clean history            |

---

## Quick Start

### Requirements

- Node.js latest LTS version
- PNPM latest version
- Docker / OrbStack (for local MongoDB)
- **For Mobile:** iOS Simulator (Xcode) or Android Emulator (Android Studio), or [Expo Go](https://expo.dev/go) on a physical device

### Environment Configuration

Local Development:

Create a `.env (.env.test for testing)` file in the `apps/api` with the following variables:

```text
# Application Environment
# Options: default: development | production | test: for testing
NODE_ENV=development

# Authentication Secret
# Required: A secure random string for JWT token encryption
# Generate: openssl rand -base64 32
# Warning: Keep this value private and unique per environment
JWT_SECRET=[your_secret]

# Database Connection
# Format: mongodb://[username]:[password]@[host]:[port]/[database]?[options]
# Required fields:
# - username: Database user with appropriate permissions (default: root)
# - password: User's password (default: 123456)
# - host: Database host (localhost for development)
# - port: MongoDB port (default: 27017)
# - database: Database name (REQUIRED: next-project-manager)
# - options: Additional connection parameters (default: authSource=admin)
#
# ⚠️  IMPORTANT: The database name MUST be included in the URL
# If omitted, MongoDB will default to "test" database
#
# Local MongoDB example:
# DATABASE_URL="mongodb://root:123456@localhost:27017/next-project-manager?authSource=admin"
#
# MongoDB Atlas (Cloud) example:
# DATABASE_URL="mongodb+srv://username:password@cluster.mongodb.net/next-project-manager?retryWrites=true&w=majority"
```

### Setup

```bash
pnpm install

# API Environment
cp apps/api/env.example apps/api/.env

# Generate Secret and replace NEXTAUTH_SECRET in .env
openssl rand -base64 32

# Web Environment
cp apps/web/env.example apps/web/.env

# start mongodb by docker-compose
cd /apps/api/database
docker-compose up -d

# initialize mongodb in root folder
pnpm init-db

# Basic Commands
pnpm dev                   # Development (including api, web and ios simulator)
pnpm test                  # Unit tests (including api, web and mobile)
pnpm playwright:install    # Install browsers before E2E tests for web
pnpm playwright            # E2E tests for web
pnpm storybook             # Storybook for @repo/ui (config being reworked for Tamagui, may not run yet)
pnpm storybook:build       # Build Storybook (same caveat)
pnpm storybook:test        # Storybook interaction tests (same caveat)
pnpm build                 # Production build (including api, web and mobile)
```

---

## Engineering Decisions

### Version Isolation Strategy

While this monorepo shares business logic across platforms, **React and React Native maintain independent version life cycles**. This is a deliberate architectural choice:

| Concern              | Web (Next.js)                    | Mobile (Expo)                           |
| -------------------- | -------------------------------- | --------------------------------------- |
| **React Version**    | Latest stable (via PNPM catalog) | Pinned to Expo SDK requirements         |
| **Update Cadence**   | Immediate adoption               | Follows Expo SDK release cycle          |
| **Bundler**          | Turbopack                        | Metro                                   |
| **Version Coupling** | None — independent               | Locked to Expo SDK latest compatibility |

**Why:** Expo SDK releases are tightly coupled to specific React Native and React versions. Attempting to unify versions across platforms would create constant breakage. Turborepo's workspace isolation ensures each app resolves the correct dependency versions without conflict, while `@repo/store` remains version-agnostic (pure TypeScript, no React dependency).

### Storage Adapter Pattern

`@repo/store` uses dependency injection for platform persistence:

```typescript
// Web: uses localStorage (default)
const useAuthStore = createAuthStore();

// Mobile: injects expo-secure-store adapter
const useAuthStore = createAuthStore(secureStorageAdapter);
```

This pattern enables shared state logic without platform-specific imports leaking across boundaries.

### Tamagui Styling (Web & Mobile)

Both apps style with Tamagui. Mobile uses `@tamagui/core` configured in `apps/mobile/lib/tamagui/tamagui.config.ts`; web consumes the shared catalog from `@repo/ui` and form fields from `@repo/forms`. Components use theme tokens (`$background`, `$color`, ...) rather than hardcoded colors, and `useTheme()` for inline values:

```tsx
import { YStack, Text } from "@repo/ui";

<YStack flex={1} alignItems="center" justifyContent="center" backgroundColor="$background">
  <Text color="$color">Hello</Text>
</YStack>
```

Mobile dark mode is driven by `Appearance.setColorScheme()`. On web, `next-themes` switches the Tamagui theme and mirrors the scheme to a cookie so the server can render the right theme.

### i18n Shared Package

`@repo/i18n` provides a single source of truth for all translation strings:

```typescript
// packages/i18n — shared translations with {appName} interpolation
import { messages, locales, defaultLocale } from "@repo/i18n";

// Web (next-intl): replaces {appName} at build time in getCachedMessages()
// Mobile (i18next): sets defaultVariables: { appName: "Project Manager" }
```

Both `next-intl` and `i18next` use `{variable}` interpolation syntax, enabling the same JSON files to work on both platforms without format conversion.

### Mobile Interaction Design

The mobile app deliberately uses **platform-appropriate interactions** instead of directly porting web drag-and-drop:

| Action                      | Web                   | Mobile                                           | Rationale                                                                         |
| --------------------------- | --------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------- |
| Reorder tasks in column     | Drag & drop           | Sortable list with `orderInProject`              | Server-synced ordering, no complex drag on small screens                          |
| Move task to another column | Drag across columns   | Swipe left → iOS ActionSheet / Android Modal     | Cross-column drag is poor UX on mobile (screen too small, finger occludes target) |
| Change task status          | Click status dropdown | Swipe right → auto-cycle (TODO→IN_PROGRESS→DONE) | One-gesture with haptic feedback, similar to Apple Mail                           |
| Edit/delete task            | Click action menu     | `Link.Menu` native context menu + haptics        | iOS-native pattern via Expo Router's context menu API                             |
| Filter tasks by status      | Dropdown/sidebar      | Horizontal scrollable pill bar                   | Touch-friendly filter chips at board detail level                                 |
| Create board/project/task   | Dialog / inline form  | FormSheet presentation with sheet grabber        | iOS-native modal pattern with keyboard avoidance                                  |

This follows the principle that good cross-platform development means **same goals, platform-appropriate means** — not 1:1 feature porting.

---

## Permission Model

| Capability          | Owner | Member |
| ------------------- | ----- | ------ |
| Manage Board        | Yes   | No     |
| Create Project/Task | Yes   | Yes    |
| Edit All Content    | Yes   | No     |
| Edit Own Content    | Yes   | Yes    |
| View All Content    | Yes   | Yes    |

---

## Project Structure

```text
.github/                    # GitHub Actions workflows
.husky/                     # Husky configuration
ai-docs/                    # AI documentations including skills and prompts
apps/
├── api/                    # Nest.js API server
│   ├── __tests__/          # Unit tests (by Vitest)
│   ├── database/           # MongoDB docker-compose and initialization
│   ├── src/
│   │   ├── common/
│   │   │   ├── events/     # Domain events (BoardDeleted, ProjectDeleted)
│   │   │   ├── filters/    # Global exception filter
│   │   │   ├── interfaces/ # Shared interfaces
│   │   │   └── pipes/      # Validation pipes (ParseObjectId)
│   │   ├── constants/      # API constants and demo data
│   │   └── modules/        # Feature modules (auth, boards, projects, tasks, users)
│   │       └── */
│   │           ├── repositories/  # Repository pattern (data access layer)
│   │           ├── schemas/       # Mongoose schemas
│   │           ├── dto/           # Request/response DTOs
│   │           ├── *.service.ts   # Business logic
│   │           ├── *.controller.ts
│   │           └── *.module.ts
│   └── env.example         # Environment variables example
├── mobile/                 # React Native (Expo SDK) app
│   ├── __tests__/          # Test files: hooks, API clients, auth, i18n, theme (Vitest)
│   ├── app/                # Expo Router file-based routes (typed routes enabled)
│   │   ├── (auth)/         # Auth routes (login) — Stack, headerShown: false
│   │   ├── (tabs)/         # Tab navigation (boards, settings) + error/loading boundaries
│   │   ├── boards/         # Board detail & form screens (formSheet presentation)
│   │   ├── projects/       # Project create/edit (formSheet presentation)
│   │   └── tasks/          # Task detail & new task (formSheet presentation)
│   ├── components/         # board-card, task-card (swipe gestures), project-column, move-task-sheet
│   ├── constants/          # API_ROUTES (configurable via EXPO_PUBLIC_API_URL), APP_NAME
│   ├── hooks/              # useAuth, useBoards, useProjects, useTasks, useUsers (TanStack Query)
│   ├── lib/                # API clients (fetchWithAuth), auth service, i18n, theme, Tamagui config
│   │   ├── api/            # board-api, project-api, task-api, user-api, fetch-with-auth
│   │   ├── auth/           # auth-service (SecureStore token management)
│   │   ├── i18n/           # i18next init with @repo/i18n shared translations
│   │   └── tamagui/        # tamagui.config.ts
│   ├── stores/             # Auth store (SecureStore adapter via @repo/store factory)
│   └── types/              # Environment types (EXPO_PUBLIC_API_URL)
├── web/                    # Next.js Web app (Cache Components enabled)
│   ├── __tests__/
│   │   ├── e2e/            # End-to-end tests (by Playwright)
│   │   └── units/          # Unit tests (by Vitest)
│   ├── messages/           # i18n translations (en, de)
│   ├── public/             # Static files such as images
│   ├── src/
│   │   ├── app/
│   │   │   ├── [locale]/           # i18n locale routers
│   │   │   │   ├── (auth)/         # Authentication routes
│   │   │   │   ├── (workspace)/    # Workspace routes (RSC layout)
│   │   │   │   ├── error.tsx       # Locale-level error boundary
│   │   │   │   └── not-found.tsx   # 404 page
│   │   │   ├── actions/            # Server Actions (board, project, task)
│   │   │   └── global-error.tsx    # Global error boundary
│   │   ├── components/
│   │   │   ├── auth/               # Auth components (SignIn, UserAuthForm)
│   │   │   ├── kanban/
│   │   │   │   ├── board/          # Board + BoardContext + DnD hooks
│   │   │   │   ├── project/        # Project column components
│   │   │   │   └── task/           # Task card components
│   │   │   └── layout/             # App shell (Sidebar, Header, etc.)
│   │   ├── hooks/                  # Custom React hooks
│   │   ├── i18n/                   # i18n config (routing, navigation)
│   │   ├── lib/
│   │   │   ├── api/                # API clients + TanStack Query hooks
│   │   │   ├── auth/               # Auth service
│   │   │   └── config/             # Environment config
│   │   ├── providers/              # React Query + Tamagui/theme providers
│   │   ├── stores/                 # Zustand stores (board, project, task slices)
│   │   ├── types/                  # Type definitions + Zod schemas
│   │   └── proxy.ts                # Middleware (i18n + auth guard)
│   └── types/              # Type definitions
packages/
├── config/                 # tsconfig presets (base.json, app.json), vite/vitest/storybook presets, oxlint plugin
├── forms/                  # Tamagui form fields + Form on TanStack Form (@repo/forms)
├── i18n/                   # Shared translations (@repo/i18n)
│   └── src/
│       ├── locales/
│       │   ├── en.json     # English translations (single source of truth)
│       │   └── de.json     # German translations
│       └── ...             # Locale config, Messages type, i18next helpers
├── platform/               # Platform detection flags, runtime config, file save helpers
├── router/                 # Cross-platform router facade (Next.js variant via .next.* extension)
├── store/                  # Shared state & types (@repo/store)
│   └── src/
│       ├── types.ts        # Domain types (Board, Task, User, etc.)
│       ├── auth-store.ts   # Auth store factory with StorageAdapter
│       ├── storage.ts      # StorageAdapter interface
│       └── workspace-types.ts  # Shared workspace interface
├── storybook/              # Storybook 10 helpers
├── table-primitives/       # Knob-aware table primitives
├── test-utils/             # Vitest setup + renderWithProviders
├── theme/                  # Tamagui theme config, knobs, presets
├── tokens/                 # DTCG design token JSON themes
├── ui/                     # Tamagui component catalog (@repo/ui)
│   ├── .storybook/         # Storybook config (being reworked for Tamagui)
│   └── src/                # Components, *.stories.tsx and *.test.tsx side by side
└── utils/                  # Node-only build utilities
```

Packages are source-consumed and keep tests next to source as `*.test.ts(x)`.

---

## Storybook: Component Documentation & Visual Testing

> [!NOTE]
> Status: stories exist for the Tamagui catalog in `packages/ui/src/*.stories.tsx`; Storybook configuration is being reworked. `packages/ui/.storybook` still targets the removed Tailwind styles, so `pnpm storybook`, `pnpm storybook:build` and `pnpm storybook:test` (which run the `@repo/ui` scripts) may not work yet. There is no live demo at the moment.

The goal is for Storybook to serve as the Single Source of Truth (SSOT) for the `@repo/ui` Tamagui components, with interaction tests (play functions), accessibility checks (`@storybook/addon-a11y`) and light/dark theme verification. Shared Storybook helpers live in `packages/storybook`, and presets in `packages/config`.

---

## AI-Augmented Engineering Workflow

This project demonstrates a "Human-in-the-Loop" architecture where AI tools are orchestrated to amplify engineering impact. The focus is not just on code generation, but on **architectural leverage, rigorous quality assurance, and accelerated velocity**.

### Orchestration & Agency

I utilize a suite of specialized AI tools, each assigned specific roles to mimic a high-performing engineering team structure.

| Role              | Tool                                                                    | Responsibility                      | Impact                                                                                                                                   |
| :---------------- | :---------------------------------------------------------------------- | :---------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| **Architect**     | [Claude Code](https://github.com/anthropics/claude-code)                | System design & complex refactoring | Handles multi-file architectural changes with deep context awareness, perfect for making plans for other AI tools.                       |
| **Plan Executor** | [Kilo Code](https://github.com/Kilo-Org/kilocode)                       | Code writing                        | Follow the plan by Architect, implement functionality and refactor using a faster and cheaper models coming from MiniMax, Z.AI and Kimi. |
| **QA**            | [Gemini CLI](https://github.com/google-gemini/gemini-cli)               | Writing test cases                  | Gemini Flash is the cheapest option in top models, perfect for writing test cases.                                                       |
| **PR Reviewer**   | [Gemini Code Assist](https://github.com/marketplace/gemini-code-assist) | Automated PR Review                 | Enforces code standards and catches potential bugs before human reviewer.                                                                |

### MCP (Model Context Protocol) Servers

MCP enables AI tools to interact directly with development infrastructure, eliminating context-switching overhead:

| Server                                                                       | Integration Point     | Workflow Enhancement                                                                         |
| ---------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) | Browser state         | Allows AI agents to directly inspect and manipulate browser state via the DevTools Protocol. |
| [context7-mcp](https://github.com/upstash/context7)                          | Documentation         | Get current library docs for AI agents                                                       |
| [nextjs-mcp](https://nextjs.org/docs/app/guides/mcp)                         | Framework diagnostics | Allow AI agents direct access to dev server logs and routes                                  |
| [playwright-mcp](https://github.com/microsoft/playwright-mcp)                | E2E testing           | Allow AI agents direct access to run e2e tests                                               |

**AI Skills** (in `ai_docs/skills/`)

Skills extend AI capabilities for specialized tasks. Each skill contains instructions and resources that AI assistants can use. Skills are organized by platform:

**AI Optimization Skills** (`ai_docs/skills/ai-optimization/`)

Based on [karpathy-guidelines](https://github.com/forrestchang/andrej-karpathy-skills)

| Skill                 | Purpose                                          | When to Use                                                                                                                                                                    |
| :-------------------- | :----------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `karpathy-guidelines` | Behavioral guidelines to reduce AI coding errors | Writing, reviewing, or refactoring code to avoid overcomplication, make surgical changes, surface assumptions, and define verifiable success criteria (Thinking before coding) |

**API Skills** (`ai_docs/skills/api/`)

Based on and refined from [nestjs-best-practices](https://github.com/davila7/claude-code-templates/tree/main/cli-tool/components/skills/development/nestjs-expert)

| Skill                   | Purpose                        | When to Use                                                                     |
| :---------------------- | :----------------------------- | :------------------------------------------------------------------------------ |
| `nestjs-best-practices` | NestJS architecture & patterns | Writing, reviewing, or refactoring NestJS code (Mongoose, Vitest, DI, security) |

**Mobile Skills** (`ai_docs/skills/mobile/`)

Based on [expo-skills](https://github.com/expo/skills)

| Skill                  | Purpose                          | When to Use                                                            |
| :--------------------- | :------------------------------- | :--------------------------------------------------------------------- |
| `building-native-ui`   | Expo Router UI guide             | Building screens, navigation, animations, native tabs, or styling      |
| `expo-api-routes`      | Expo Router API routes           | Creating server-side API endpoints with EAS Hosting                    |
| `expo-dev-client`      | Dev client builds & TestFlight   | Custom native code, Apple targets, or third-party native modules       |
| `native-data-fetching` | Networking & data fetching       | Any API call, fetch, caching, offline support, or auth token handling  |
| `upgrading-expo`       | Expo SDK upgrades                | Upgrading Expo SDK versions or fixing dependency compatibility issues  |
| `use-dom`              | DOM components for web-in-native | Using web libraries on native, migrating web code, Canvas/WebGL embeds |

**Web Skills** (`ai_docs/skills/web/`)

Based on [Vercel Agent Skills](https://vercel.com/docs/agent-resources/skills)

| Skill                         | Purpose                     | When to Use                                                                                         |
| :---------------------------- | :-------------------------- | :-------------------------------------------------------------------------------------------------- |
| `next-best-practices`         | Next.js best practices      | Writing, reviewing, or refactoring Next.js code                                                     |
| `next-cache-components`       | Next.js 16 cache components | Implementing `use cache`, PPR, cacheLife, cacheTag, or updateTag                                    |
| `vercel-composition-patterns` | React composition patterns  | Refactoring components, building reusable component APIs, compound components                       |
| `vercel-react-best-practices` | React performance rules     | Writing, reviewing, or refactoring React/Next.js code for performance                               |
| `web-design-guidelines`       | UI/UX accessibility audits  | "Review my UI", "Check accessibility", "Audit design"                                               |
| `turborepo`                   | Turborepo best practices    | Build system guide for JavaScript and TypeScript monorepos with task caching and parallel execution |

**AI Guidelines** (`ai_docs/PROMPTS.md`)

Project-specific instructions for AI assistants including repository structure, commands, file conventions, and example workflows. Adhering to these guidelines reduces AI hallucinations and increases the accurate utilization of skills and MCP servers by approximately 40-60%. AI tools should reference this file first when working on this project.

**How to Use:**

This is an example of how to use prompts and skills in Claude Code, you should check the documentation of other AI tools for more details.

- Create a folder named `.claude`
- Copy skills you need from `ai_docs/skills/` to `.claude/skills/`
- Copy or create a symbolic link of `PROMPTS.md` to your AI tool's context file location

  | AI Tool     | Target Path               |
  | ----------- | ------------------------- |
  | Claude Code | `[root-folder]/CLAUDE.md` |

- Restart the Claude Code or other AI tools

### Measurable Impact

By treating AI as an integrated part of the stack, this project achieves:

- **Velocity**: 5-10x faster implementation of boilerplate and standard patterns.
- **Quality**: Higher test coverage (80%+) through AI-generated test scaffolding.
- **Learning**: Rapid mastery of new tools (Rspack, Playwright, Storybook...and more) via AI-guided implementation.
- **Cost**: Lower costs by using AI agents skills to reduce tokens and match the best practice in frontend.
- **Focus**: Shifted engineering time from syntax to system architecture and user experience.

---

## Modern Tooling Adoption

Part of my engineering approach involves continuously evaluating emerging tools and making data-driven adoption decisions. This section documents tools I've integrated after hands-on evaluation, demonstrating measurable impact on developer productivity.

### Oxlint (Rust-based Linter)

| Aspect           | Details                                               |
| ---------------- | ----------------------------------------------------- |
| Status           | **Production** - core and type-aware linting enabled  |
| Performance      | 50-100x faster than ESLint                            |
| DX Improvement   | Clearer error messages, simpler config than ESLint 9+ |
| Migration Impact | Removed 10 ESLint packages from dependency tree       |

[Oxlint](https://oxc.rs/docs/guide/usage/linter.html) | [Type-Aware Linting](https://oxc.rs/docs/guide/usage/linter/type-aware.html)

### Oxfmt (Rust-based Formatter)

| Aspect      | Details                                          |
| ----------- | ------------------------------------------------ |
| Status      | **Production** - enabled                         |
| Performance | 30x faster than Prettier with instant cold start |

[Oxfmt](https://oxc.rs/docs/guide/usage/formatter)

### Turbopack + Filesystem Caching

| Aspect      | Details                                    |
| ----------- | ------------------------------------------ |
| Status      | **Production** - default in Next.js latest |
| Performance | Near-instant HMR, incremental compilation  |
| Caching     | Filesystem caching persists artifacts      |

[Turbopack](https://nextjs.org/docs/app/api-reference/turbopack) | [FS Caching](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopackFileSystemCache)

### Rspack (Nest.js Backend)

| Aspect      | Details                                                 |
| ----------- | ------------------------------------------------------- |
| Status      | **Production** - replaced Webpack for Nest.js           |
| Performance | 5-10x faster builds than Webpack                        |
| Benefit     | Dramatic reduction in dev server startup and build time |

[Rspack](https://github.com/web-infra-dev/rspack)

### TypeScript 7

| Aspect    | Details                                                                                   |
| --------- | ----------------------------------------------------------------------------------------- |
| Status    | **Evaluation** - tracking for future adoption                                             |
| What      | A native port of the TypeScript compiler from JavaScript to Go, releasing as TypeScript 7 |
| Build     | ~10x faster `tsc` builds                                                                  |
| Editor    | ~8x faster project load time with LSP migration                                           |
| Memory    | ~50% reduction in memory usage compared to the JS-based compiler                          |
| Trade-off | Will evaluate migration once TS 7 reaches stable maturity and ecosystem readiness         |

[TypeScript Native Port](https://devblogs.microsoft.com/typescript/typescript-native-port/) | [typescript-go repo](https://github.com/microsoft/typescript-go)

### React Compiler

| Aspect    | Details                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------- |
| Status    | **Production on Mobile** (Expo `experiments.reactCompiler`), **deferred on Web**               |
| Trade-off | Web: +5-10% Lighthouse score vs +30-40% build time; Mobile: no measurable penalty              |
| Decision  | Enabled on mobile where Metro handles compilation; deferred on web due to Turbopack build cost |

[React Compiler](https://react.dev/learn/react-compiler)

---

## Live Demo Constraints

| Aspect             | Current State                       | Production Recommendation           |
| ------------------ | ----------------------------------- | ----------------------------------- |
| **Hosting Region** | Hong Kong (free tier)               | Multi-region CDN deployment         |
| **Response Time**  | Variable latency for non-Asia users | Edge functions or regional backends |
| **Translations**   | EN complete, DE partial             | Professional localization service   |

The demo deployment uses free-tier infrastructure to minimize costs. Production deployments should implement proper CDN and regional optimization.
