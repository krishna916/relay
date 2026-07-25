# Relay

Local task sidecar for human–AI workflows.

> **Status:** Scaffold stage (Issue #1). Task tracking, companion skills, vendor integration configs, and packaging are explicitly deferred to subsequent issues (Issue #2+).

## Prerequisites

- Node.js `24.x` LTS (`.nvmrc`)
- pnpm `10.2.0` (managed via Corepack)

## Setup

```bash
corepack enable
pnpm install --frozen-lockfile
```

## Available Scripts

- `pnpm verify` — **Non-mutating** aggregate quality gate. Executes `format:check -> lint -> typecheck -> test:coverage -> build -> validate:assets -> audit --audit-level high`.
- `pnpm format` — **Mutating**. Format codebase with Prettier.
- `pnpm format:check` — **Non-mutating**. Check formatting with Prettier.
- `pnpm lint` — **Non-mutating**. Run ESLint (`--max-warnings=0`).
- `pnpm typecheck` — **Non-mutating**. Perform strict TypeScript type checking (`tsc --build --noEmit`).
- `pnpm test` — **Non-mutating**. Run Vitest unit & integration tests once.
- `pnpm test:coverage` — **Non-mutating**. Run Vitest tests with V8 coverage threshold enforcement.
- `pnpm build:node` — **Mutating (dist/)**. Build Node backend entry points (`dist/mcp/main.js`, `dist/http/main.js`).
- `pnpm build:web` — **Mutating (dist/)**. Build Vite React web UI (`dist/web`).
- `pnpm build` — **Mutating (dist/)**. Run `build:node` and `build:web`.
- `pnpm dev:mcp` — **Non-mutating**. Run MCP stdio entry point from source via `tsx`.
- `pnpm dev:http` — **Non-mutating**. Run HTTP server from source (`http://127.0.0.1:43110`).
- `pnpm dev:web` — **Non-mutating**. Run Vite development server with proxy `/api` -> `http://127.0.0.1:43110`.
- `pnpm dev:ui` — **Non-mutating**. Run HTTP server and Vite development server concurrently.
- `pnpm validate:assets` — **Non-mutating**. Validate repository assets, package `bin`, and configuration.

## Development Servers & Ports

- Default HTTP loopback address: `127.0.0.1`
- Default HTTP port: `43110` (`GET /api/health`)
- Vite dev server port: `5173` (proxies `/api` to `http://127.0.0.1:43110`)

## Configuration & Environment Variables

- `RELAY_DB_PATH`: Custom file path to SQLite database.
  - Windows default: `%APPDATA%\relay\relay.db`
  - macOS default: `~/Library/Application Support/relay/relay.db`
  - Linux default: `${XDG_DATA_HOME:-~/.local/share}/relay/relay.db`
- `RELAY_HTTP_PORT`: Custom port for loopback HTTP server (default: `43110`).

## Database & Migrations

Relay uses `better-sqlite3` with plain SQL migrations located under `src/database/migrations/`.

On every database connection:

- `PRAGMA foreign_keys = ON;`
- `PRAGMA journal_mode = WAL;`
- `PRAGMA busy_timeout = 5000;`

Applied SQL migrations are tracked in `_relay_migrations` with SHA-256 checksums. **Applied migration SQL files are immutable**.

## Invoking Built MCP Command Locally

Build the scaffold Node entry points:

```bash
pnpm build
```

Start the MCP stdio process:

```bash
node dist/mcp/main.js
```

Or invoke via package binary entry point:

```bash
./dist/mcp/main.js
```

The process exposes one scaffold health tool: `relay_health`. Diagnostics are written exclusively to `stderr`.

## Architecture Boundaries

```text
src/
  domain/         # Domain entities & rules (deferred to Issue #2+)
  application/    # Application services (getHealth)
  database/       # SQLite connection factory & migration runner
  interfaces/
    mcp/          # MCP stdio server adapter (relay_health)
    http/         # Loopback HTTP server adapter (GET /api/health)
  shared/         # Custom errors & package metadata
web/              # Vite React 19 UI shell
```

Boundary rules:

- `domain` and `application` layers have zero dependencies on interface protocols (`mcp`, `http`) or database implementations.
- `interfaces` call application services (`getHealth()`) and do not construct domain responses independently.
- `web/` calls loopback HTTP `/api/health` only and never imports Node modules.

## Current Limitations

- No task CRUD, task table, or product task behavior (deferred to Issue #2+).
- No companion skills, plugin manifests, or vendor MCP configs (deferred to Issue #2+).
- No remote network binding, authentication, multi-user accounts, background daemon, or desktop shell.

## Troubleshooting

- **`better-sqlite3` build issues:** Ensure Python and a C++ compiler build toolchain are installed if prebuilt binaries are unavailable.
- **Node version mismatch:** Relay requires Node.js `24.x`. Use `nvm use` or `fnm use` to switch Node versions according to `.nvmrc`.
