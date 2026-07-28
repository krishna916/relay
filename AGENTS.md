# Repository Guidelines

## Project Structure & Module Organization

Relay is a local task sidecar with a layered TypeScript backend and React UI. Keep business rules in `src/domain/`, use cases and ports in `src/application/`, SQLite code and migrations in `src/database/`, and delivery adapters in `src/interfaces/{http,mcp,cli}/`. The UI lives in `web/src/` and communicates only with the loopback HTTP API. Place tests under `tests/unit/` or `tests/integration/`, mirroring their source area; UI tests sit beside UI code (for example, `web/src/App.test.tsx`). Treat `docs/` and `skills/` as maintained product artifacts.

## Build, Test, and Development Commands

Use Node 24.x and pnpm 10.2.0 (via Corepack).

- `pnpm dev:ui` starts the HTTP API and Vite UI together.
- `pnpm test` runs the Vitest suite; `pnpm test:coverage` also enforces coverage.
- `pnpm lint`, `pnpm typecheck`, and `pnpm format:check` validate code quality.
- `pnpm format` applies Prettier formatting.
- `pnpm build` creates the CLI, MCP, HTTP, and web artifacts in `dist/`.
- `pnpm verify` is the required full gate: formatting, lint, types, coverage, build, asset validation, and dependency audit.

## Coding Style & Naming Conventions

Use two-space indentation, LF endings, UTF-8, and TypeScript ESM. Let Prettier format changes; do not hand-format around it. Use `camelCase` for functions and variables, `PascalCase` for types, React components, and classes, and kebab-case filenames such as `task-status.ts`. Prefer `import type` for type-only imports. Avoid `any`, unhandled promises, and unused arguments (prefix intentionally unused arguments with `_`). Do not call `console` from MCP adapter code.

## Testing Guidelines

Write Vitest tests named `*.test.ts` (or `*.test.tsx` for UI). Cover normal flows, validation failures, and lifecycle boundaries in the layer where they belong. Coverage is enforced at 80% for statements, branches, functions, and lines across the configured backend and UI targets. Use `pnpm test` while iterating and `pnpm verify` before requesting review.

## Commit & Pull Request Guidelines

Follow the existing concise, imperative history: `feat: add canonical Relay agent skills` or `docs: define Relay session semantics`. Keep each commit focused. Pull requests should explain the behavioral change, link the issue when applicable, list validation performed, and include UI screenshots for visible changes. Update relevant contracts, migration files, docs, and skills in the same PR when their behavior changes.

## Configuration & Data Safety

Use `RELAY_DB_PATH` for disposable development databases; never test against a database containing valuable tasks. The HTTP service is loopback-only. Do not edit applied migrations—add a new migration instead.
