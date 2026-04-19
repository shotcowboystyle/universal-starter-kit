# API — Development Context

## Overview

NestJS (Express) REST API for a task management system. Runs on port `3001`. Deployed to Vercel as a serverless function (see `main.ts` bootstrap export). Built with Rspack (not webpack/tsc directly). MongoDB via Mongoose.

Swagger docs available at `/api/docs` when running locally.

## Key Files and Structure

```
apps/api/
├── src/
│   ├── main.ts                          # Bootstrap, CORS, ValidationPipe, Swagger, HMR
│   ├── app.module.ts                    # Root module: registers all feature modules + APP_FILTER
│   ├── constants/
│   │   └── api.ts                       # API_PORT = 3001
│   ├── common/
│   │   ├── events/
│   │   │   ├── board-deleted.event.ts   # BoardDeletedEvent(boardId, userId)
│   │   │   ├── project-deleted.event.ts # ProjectDeletedEvent(projectId)
│   │   │   └── index.ts
│   │   ├── filters/
│   │   │   └── all-exceptions.filter.ts # Global error handler (APP_FILTER)
│   │   ├── interfaces/
│   │   │   └── request-with-user.interface.ts # RequestWithUser extends Request
│   │   ├── modules/
│   │   │   └── event-emitter.module.ts  # Global EventEmitter2 provider
│   │   └── pipes/
│   │       └── parse-object-id.pipe.ts  # Validates + transforms string → Types.ObjectId
│   └── modules/
│       ├── auth/
│       │   ├── auth.controller.ts       # POST /auth/login, GET /auth/profile, POST /auth/logout
│       │   ├── auth.service.ts          # validateUser(), login() → JWT
│       │   ├── auth.module.ts
│       │   ├── decorators/
│       │   │   └── current-user.decorator.ts  # @CurrentUser() param decorator
│       │   ├── guards/
│       │   │   ├── jwt-auth.guard.ts    # AuthGuard("jwt") — protects most routes
│       │   │   └── email-auth.guard.ts  # AuthGuard("email") — login route only
│       │   └── strategies/
│       │       ├── jwt.strategy.ts      # Extracts JWT from cookie OR Bearer header
│       │       └── email.strategy.ts    # passport-custom: validates req.body.email
│       ├── boards/
│       │   ├── boards.controller.ts
│       │   ├── boards.service.ts        # Injects BoardRepository + EventEmitter2
│       │   ├── boards.module.ts
│       │   ├── dto/
│       │   ├── repositories/
│       │   │   └── boards.repository.ts # Aggregation pipelines for owner/member populate
│       │   └── schemas/
│       │       └── boards.schema.ts
│       ├── projects/
│       │   ├── projects.controller.ts
│       │   ├── projects.service.ts      # OnModuleInit: listens to "board.deleted"
│       │   ├── projects.module.ts
│       │   ├── dto/
│       │   ├── repositories/
│       │   │   └── projects.repository.ts
│       │   └── schemas/
│       │       └── projects.schema.ts
│       ├── tasks/
│       │   ├── tasks.controller.ts
│       │   ├── tasks.service.ts         # OnModuleInit: listens to "project.deleted"
│       │   ├── tasks.module.ts
│       │   ├── dto/
│       │   ├── repositories/
│       │   │   └── tasks.repository.ts
│       │   └── schemas/
│       │       └── tasks.schema.ts
│       ├── users/
│       │   ├── users.controller.ts
│       │   ├── users.service.ts
│       │   ├── users.module.ts
│       │   ├── repositories/
│       │   │   └── users.repository.ts
│       │   └── schemas/
│       │       └── users.schema.ts
│       └── database/
│           └── database.module.ts       # Global @Global(), MongooseModule.forRootAsync
├── __tests__/                           # Mirrors src/ structure
├── database/                            # Seed scripts (init-db-data.ts)
├── env.example
└── vitest.config.ts
```

## Architecture Patterns

### Service → Repository → Model (strict layering)
- Controllers call services only.
- Services inject repositories. Services NEVER inject `Model<T>` directly.
- Repositories inject `Model<T>` via `@InjectModel(Schema.name)` and own all Mongoose queries.

### Global Exception Handling
`AllExceptionsFilter` is registered as `APP_FILTER` in `app.module.ts`. It catches all exceptions and formats the JSON response. Controllers do NOT use try/catch — throw NestJS HTTP exceptions directly from services.

```typescript
// Correct — throw from service, let the filter handle it
throw new NotFoundException(`Board with ID "${id}" not found`);
```

### Cascade Deletes via EventEmitter2
Deletion cascades through domain events, not direct service calls (avoids circular dependencies):

1. `BoardService.remove()` emits `"board.deleted"` → `BoardDeletedEvent(boardId, userId)`
2. `ProjectsService` listens via `onModuleInit()`, deletes all projects in the board, emits `"project.deleted"` per project → `ProjectDeletedEvent(projectId)`
3. `TasksService` listens via `onModuleInit()`, deletes all tasks in the project.

Event classes live in `src/common/events/`. Register listeners in `onModuleInit()`, not constructors.

### Authentication
- Login uses `passport-custom` ("email" strategy): receives `{ email }` in request body, finds user, no password.
- JWT is issued on login and set as both an `httpOnly` cookie (`jwt`) and returned in the response body (`access_token`).
- A non-httpOnly cookie (`isAuthenticated: "true"`) is set for client-side UI checks.
- `JwtStrategy` extracts the token from the `jwt` cookie first, then falls back to `Authorization: Bearer` header. Both paths work.
- All protected routes use `@UseGuards(JwtAuthGuard)`. The `@CurrentUser()` decorator returns `{ _id: string, email: string }`.

### DTOs and Validation
- DTOs use `class-validator` decorators (`@IsString()`, `@IsMongoId()`, `@IsOptional()`, etc.).
- `ValidationPipe` is global (`whitelist: true`, `transform: true`, `forbidNonWhitelisted: true`).
- `@ApiProperty()` decorators are added to DTOs and schemas used in Swagger responses.

### Mongoose Schemas
- Defined with `@Schema({ timestamps: true })` and `@Prop()` decorators (`@nestjs/mongoose`).
- Export pattern: `export type BoardDocument = Board & Document` alongside the class.
- Indexes are defined at the bottom of each schema file via `Schema.index(...)`.
- Aggregation pipelines (not `.populate()`) are used in `BoardRepository` for nested population of owner, members, and projects.

### ParseObjectIdPipe
Applied to `@Param()` arguments in `TasksController` to validate and transform string IDs:

```typescript
@Get(":id")
async findOne(@Param("id", ParseObjectIdPipe) id: string) { ... }
```

Not yet used in all controllers — boards and projects controllers validate IDs manually via `Types.ObjectId.isValid()` in the service layer.

## Module Conventions

| Module   | Controller prefix | Service dependencies                           | Event emitted         | Event listened        |
|----------|-------------------|------------------------------------------------|-----------------------|-----------------------|
| auth     | `/auth`           | UserService, JwtService                        | —                     | —                     |
| boards   | `/boards`         | BoardRepository, EventEmitter2                 | `board.deleted`       | —                     |
| projects | `/projects`       | ProjectRepository, BoardService, EventEmitter2 | `project.deleted`     | `board.deleted`       |
| tasks    | `/tasks`          | TaskRepository, ProjectsService, EventEmitter2 | —                     | `project.deleted`     |
| users    | `/users`          | UserRepository                                 | —                     | —                     |

**Task permission rules:**
- `update` / `moveTask`: requires user is creator OR assignee.
- `remove`: requires user is creator (strict).

**Project permission rules:**
- `update` title/description/status/dueDate/assignee: requires owner.
- `update` `orderInBoard` only: requires board membership (not necessarily project owner).
- `remove`: requires project owner.

**Board permission rules:**
- `update`: requires owner or member.
- `remove` / `addMember` / `removeMember`: requires owner.

## Testing Strategy

Tests use **Vitest** with manual constructor instantiation. `@nestjs/testing` / `TestingModule` is NOT used.

### Service tests
Construct the service directly, passing `vi.fn()` mock objects as dependencies:

```typescript
beforeEach(() => {
  boardRepository = {
    create: vi.fn(),
    findById: vi.fn(),
    // ...all repository methods
  };
  eventEmitter = { emit: vi.fn() };

  service = new BoardService(
    boardRepository as unknown as BoardRepository,
    eventEmitter as any
  );
});
```

### Repository tests
Mock the Mongoose model as a callable constructor with static methods:

```typescript
const MockModel = vi.fn().mockImplementation(function (data) {
  return { ...data, save: vi.fn().mockResolvedValue(data) };
}) as any;

MockModel.aggregate = vi.fn().mockResolvedValue([]);
MockModel.findById = vi.fn().mockReturnThis();
MockModel.exec = vi.fn();

repository = new BoardRepository(mockModel);
```

### Test file locations
`__tests__/` mirrors the source structure:
- `__tests__/boards/boards.service.test.ts` ↔ `src/modules/boards/boards.service.ts`
- `__tests__/modules/boards/repositories/boards.repository.test.ts` ↔ `src/modules/boards/repositories/boards.repository.ts`

Run tests: `pnpm test` (from repo root) or `vitest run --coverage` (from `apps/api`).

## Common Tasks

### Adding a new domain module
1. Create `src/modules/<name>/` with: `<name>.schema.ts`, `<name>.repository.ts`, `<name>.service.ts`, `<name>.controller.ts`, `<name>.module.ts`, `dto/`.
2. Register schema in the module: `MongooseModule.forFeature([{ name: Schema.name, schema: SchemaSchema }])`.
3. Import the new module in `app.module.ts`.
4. Write tests in `__tests__/modules/<name>/` and `__tests__/<name>/`.

### Adding a cascade delete
1. Create an event class in `src/common/events/`.
2. Export it from `src/common/events/index.ts`.
3. In the emitting service, inject `EventEmitter2` and call `this.eventEmitter.emit("event.name", new MyEvent(...))`.
4. In the listening service, implement `OnModuleInit` and register the listener in `onModuleInit()`.

### Adding a protected route
Apply `@UseGuards(JwtAuthGuard)` at controller or method level. Use `@CurrentUser()` to access `{ _id: string, email: string }`.

### Environment variables
Copy `env.example` to `.env`. Required vars:
- `DATABASE_URL` — MongoDB connection string
- `JWT_SECRET` — JWT signing secret
- `NODE_ENV` — affects SSL, cookie `secure` flag, Mongoose `autoIndex`
- `NEXT_PUBLIC_WEB_URL` — added to CORS allowed origins
- `VERCEL` — set automatically on Vercel; triggers serverless export mode
