# Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a clean, production-shaped Relay scaffold in `D:\projects\relay` proving Node/TS ESM compilation, SQLite database with plain SQL migrations, an MCP stdio server with a `relay_health` tool, a loopback HTTP server with `GET /api/health`, a Vite/React shell UI displaying health status, repository asset validation, and a non-mutating `pnpm verify` CI gate.

**Architecture:** A single private root Node.js/TypeScript ESM package with clean layer separation (`domain`, `application`, `database`, `interfaces/mcp`, `interfaces/http`, `shared`) and a frontend web shell (`web/`). Layer boundaries: `domain` and `application` have zero dependencies on interface protocols (`mcp`, `http`) or database implementations. Adapters call `getHealth()` for health state.

**Tech Stack:** Node.js 24, pnpm (pinned via Corepack), TypeScript (strict ESM), `better-sqlite3`, `@modelcontextprotocol/sdk`, Zod, built-in `node:http`, React 19, Vite, Vitest, `@testing-library/react`, ESLint flat config, Prettier, `tsup`.

## Global Constraints

- Node version: `>=24 <25` strictly enforced via `.nvmrc` (`24`) and `package.json#engines`.
- Package manager: Pinned pnpm version with `package.json#packageManager` and committed `pnpm-lock.yaml`.
- ESM mandatory: `"type": "module"` in `package.json` across backend and frontend.
- Zero diagnostic output on stdout for MCP stdio process; all diagnostics use stderr via `logger.ts`.
- Loopback binding only (`127.0.0.1`) for HTTP server on default port `43110` (overridable via `RELAY_HTTP_PORT`).
- Database configuration precedence: explicit function argument > `RELAY_DB_PATH` > OS user-data directory default.
- SQLite PRAGMAs on every connection: `foreign_keys = ON`, `journal_mode = WAL`, `busy_timeout = 5000`.
- SQL migrations: transactional, checksummed with SHA-256, immutable once applied, executed in numeric prefix order.
- UI scope: minimal connectivity shell with loading, connected/version, failure, and retry states; no task CRUD or premature design system.
- Quality gate: `pnpm verify` runs `format:check -> lint -> typecheck -> test:coverage -> build -> validate:assets -> audit` non-mutatingly.
- Scope boundary: No ORM, web framework, daemon, authentication, multi-user tenancy, remote binding, agent skills, vendor configs, or task tables in Issue #1.

---

### Task 1: Repository Scaffold & Package Metadata

**Files:**

- Create: `.nvmrc`
- Create: `.editorconfig`
- Create: `.gitignore`
- Create: `.prettierignore`
- Create: `.prettierrc.json`
- Create: `package.json`
- Create: `README.md`

**Interfaces:**

- Consumes: None
- Produces: Root package manifest, ignore files, editor rules, and formatted environment foundation.

- [ ] **Step 1: Write `.nvmrc`**

```text
24
```

- [ ] **Step 2: Write `.editorconfig`**

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 3: Write `.gitignore` and `.prettierignore`**

`.gitignore`:

```text
node_modules/
dist/
coverage/
*.log
.DS_Store
*.tmp
```

`.prettierignore`:

```text
node_modules/
dist/
coverage/
pnpm-lock.yaml
```

- [ ] **Step 4: Write `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 5: Write initial `package.json`**

```json
{
  "name": "relay",
  "version": "0.1.0",
  "description": "Local task sidecar for human–AI workflows",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=24 <25"
  },
  "packageManager": "pnpm@10.2.0",
  "bin": {
    "relay-mcp": "./dist/mcp/main.js"
  },
  "scripts": {
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

- [ ] **Step 6: Write initial `README.md` skeleton**

````markdown
# Relay

Local task sidecar for human–AI workflows.

> **Status:** Scaffold stage (Issue #1). Task tracking, companion skills, and agent features are deferred to subsequent issues.

## Prerequisites

- Node.js 24.x LTS (`.nvmrc`)
- pnpm 10.2.0 (managed via Corepack)

## Setup

```bash
corepack enable
pnpm install
```

- [ ] **Step 7: Install initial dependencies and lock file**

Run: `corepack enable && pnpm install`
Expected: `pnpm-lock.yaml` generated cleanly.

- [ ] **Step 8: Verify formatting check**

Run: `pnpm format:check`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 9: Commit**

```bash
git add .nvmrc .editorconfig .gitignore .prettierignore .prettierrc.json package.json pnpm-lock.yaml README.md
git commit -m "chore: initialize repository scaffold and package metadata"
````

---

### Task 2: TypeScript Project Configurations & Layer Directory Structure

**Files:**

- Create: `tsconfig.base.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`
- Create: `tsconfig.test.json`
- Create: `src/domain/README.md`

**Interfaces:**

- Consumes: Package structure from Task 1
- Produces: Strict TS configurations for Node, web, and tests; domain directory marker.

- [ ] **Step 1: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "useUnknownInCatchVariables": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 2: Write `tsconfig.node.json`**

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts", "web/**/*"]
}
```

- [ ] **Step 3: Write `tsconfig.web.json`**

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "noEmit": true
  },
  "include": ["web/src/**/*"]
}
```

- [ ] **Step 4: Write `tsconfig.test.json`**

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "moduleResolution": "Bundler",
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node", "vitest/globals"],
    "noEmit": true
  },
  "include": [
    "src/**/*",
    "web/src/**/*",
    "tests/**/*",
    "scripts/**/*",
    "*.config.ts",
    "*.config.js"
  ]
}
```

- [ ] **Step 5: Write `tsconfig.json` (Solution Configuration)**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" },
    { "path": "./tsconfig.test.json" }
  ]
}
```

- [ ] **Step 6: Write `src/domain/README.md`**

```markdown
# Domain Layer

Domain models, entities, and business rules for Relay.

> **Note:** Domain task lifecycle rules and entities are intentionally deferred to subsequent issues (Issue #2+).
```

- [ ] **Step 7: Install TypeScript & Node Types**

Run: `pnpm add -D typescript @types/node`
Expected: Packages added to `devDependencies`.

- [ ] **Step 8: Commit**

```bash
git add tsconfig*.json src/domain/README.md package.json pnpm-lock.yaml
git commit -m "chore: add strict TypeScript configuration and domain documentation boundary"
```

---

### Task 3: ESLint Flat Config & Code Quality Tooling

**Files:**

- Create: `eslint.config.js`
- Modify: `package.json`

**Interfaces:**

- Consumes: TypeScript setup from Task 2
- Produces: `lint` and `typecheck` npm scripts with zero warning tolerance.

- [ ] **Step 1: Install ESLint & TypeScript ESLint plugins**

Run: `pnpm add -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-react-hooks eslint-plugin-react-refresh`
Expected: ESLint 9+ flat config tooling installed.

- [ ] **Step 2: Write `eslint.config.js`**

```js
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: ['./tsconfig.test.json'],
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...tsPlugin.configs['recommended'].rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'no-console': 'off',
    },
  },
  {
    files: ['src/interfaces/mcp/**/*.ts'],
    rules: {
      'no-console': 'error',
    },
  },
];
```

- [ ] **Step 3: Update `package.json` scripts**

Add to `package.json#scripts`:

```json
"lint": "eslint . --max-warnings=0",
"typecheck": "tsc --build --noEmit"
```

- [ ] **Step 4: Run lint and typecheck verification**

Run: `pnpm lint && pnpm typecheck`
Expected: Both exit 0 with zero warnings.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js package.json pnpm-lock.yaml
git commit -m "tooling: configure ESLint flat config with type-checking and strict warning limits"
```

---

### Task 4: Shared Errors, Package Metadata & Health Application Contract

**Files:**

- Create: `src/shared/errors.ts`
- Create: `src/shared/package-metadata.ts`
- Create: `src/application/health/health.ts`
- Create: `src/application/health/get-health.ts`
- Create: `tests/unit/shared/package-metadata.test.ts`
- Create: `tests/unit/application/get-health.test.ts`

**Interfaces:**

- Consumes: Package name and version from `package.json`
- Produces: `getHealth(): HealthStatus` function returning `{ name: "relay", status: "ok", version: "0.1.0" }`.

- [ ] **Step 1: Install Vitest**

Run: `pnpm add -D vitest`
Expected: Vitest installed.

- [ ] **Step 2: Create Vitest config `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'web/src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/application/**',
        'src/database/**',
        'src/interfaces/mcp/create-mcp-server.ts',
        'src/interfaces/http/create-http-server.ts',
        'web/src/api/**',
        'web/src/App.tsx',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
```

- [ ] **Step 3: Write failing unit test for `package-metadata.ts`**

`tests/unit/shared/package-metadata.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getPackageMetadata } from '../../../src/shared/package-metadata.js';

describe('package-metadata', () => {
  it('returns package name and version', () => {
    const meta = getPackageMetadata();
    expect(meta.name).toBe('relay');
    expect(meta.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
```

- [ ] **Step 4: Run test to verify failure**

Run: `pnpm vitest run tests/unit/shared/package-metadata.test.ts`
Expected: FAIL - module `package-metadata.js` not found.

- [ ] **Step 5: Implement `src/shared/errors.ts` and `src/shared/package-metadata.ts`**

`src/shared/errors.ts`:

```ts
export class RelayError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'RelayError';
  }
}
```

`src/shared/package-metadata.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface PackageMetadata {
  readonly name: string;
  readonly version: string;
}

let cachedMetadata: PackageMetadata | null = null;

export function getPackageMetadata(): PackageMetadata {
  if (cachedMetadata) return cachedMetadata;

  const pkgPath = join(process.cwd(), 'package.json');
  const content = readFileSync(pkgPath, 'utf-8');
  const parsed = JSON.parse(content) as { name: string; version: string };

  cachedMetadata = {
    name: parsed.name,
    version: parsed.version,
  };
  return cachedMetadata;
}
```

- [ ] **Step 6: Run metadata test to verify pass**

Run: `pnpm vitest run tests/unit/shared/package-metadata.test.ts`
Expected: PASS.

- [ ] **Step 7: Write failing unit test for `getHealth()`**

`tests/unit/application/get-health.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getHealth } from '../../../src/application/health/get-health.js';

describe('getHealth', () => {
  it('returns exact deterministic health status contract', () => {
    const health = getHealth();
    expect(health).toEqual({
      name: 'relay',
      status: 'ok',
      version: '0.1.0',
    });
  });
});
```

- [ ] **Step 8: Implement `src/application/health/health.ts` and `src/application/health/get-health.ts`**

`src/application/health/health.ts`:

```ts
export interface HealthStatus {
  readonly name: 'relay';
  readonly status: 'ok';
  readonly version: string;
}
```

`src/application/health/get-health.ts`:

```ts
import type { HealthStatus } from './health.js';
import { getPackageMetadata } from '../../shared/package-metadata.js';

export function getHealth(): HealthStatus {
  const meta = getPackageMetadata();
  return {
    name: 'relay',
    status: 'ok',
    version: meta.version,
  };
}
```

- [ ] **Step 9: Run tests to verify pass**

Run: `pnpm vitest run tests/unit/application/get-health.test.ts`
Expected: PASS.

- [ ] **Step 10: Update `package.json` test scripts**

```json
"test": "vitest run",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 11: Commit**

```bash
git add src/shared/ src/application/ vitest.config.ts tests/package.json pnpm-lock.yaml
git commit -m "feat(application): implement health status application contract and package metadata helper"
```

---

### Task 5: SQLite Database Configuration, Connection Factory & Plain SQL Migration Runner

**Files:**

- Create: `src/database/database-config.ts`
- Create: `src/database/connection.ts`
- Create: `src/database/migration.ts`
- Create: `src/database/migrate.ts`
- Create: `src/database/migrations/0001_scaffold.sql`
- Create: `tests/support/temporary-database.ts`
- Create: `tests/unit/database/database-config.test.ts`
- Create: `tests/unit/database/migration.test.ts`
- Create: `tests/integration/database-migrations.test.ts`

**Interfaces:**

- Consumes: Environment variable `RELAY_DB_PATH` or explicit path parameter
- Produces: Configured `better-sqlite3` Database connection with WAL/Foreign Keys/Busy Timeout, and transactional SHA-256 migration runner.

- [ ] **Step 1: Install `better-sqlite3` and type definitions**

Run: `pnpm add better-sqlite3 && pnpm add -D @types/better-sqlite3`
Expected: SQLite driver installed.

- [ ] **Step 2: Write failing unit test for `database-config.ts`**

`tests/unit/database/database-config.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveDatabasePath } from '../../../src/database/database-config.js';

describe('resolveDatabasePath', () => {
  const origEnv = process.env.RELAY_DB_PATH;

  afterEach(() => {
    if (origEnv !== undefined) {
      process.env.RELAY_DB_PATH = origEnv;
    } else {
      delete process.env.RELAY_DB_PATH;
    }
  });

  it('prefers explicit argument over environment variable', () => {
    process.env.RELAY_DB_PATH = '/env/path.db';
    const path = resolveDatabasePath('/explicit/path.db');
    expect(path).toBe('/explicit/path.db');
  });

  it('uses RELAY_DB_PATH env var when no explicit path passed', () => {
    process.env.RELAY_DB_PATH = '/env/path.db';
    const path = resolveDatabasePath();
    expect(path).toBe('/env/path.db');
  });

  it('rejects empty or whitespace-only explicit path', () => {
    expect(() => resolveDatabasePath('')).toThrow();
    expect(() => resolveDatabasePath('   ')).toThrow();
  });
});
```

- [ ] **Step 3: Implement `src/database/database-config.ts`**

```ts
import { join } from 'node:path';
import { homedir } from 'node:os';
import { RelayError } from '../shared/errors.js';

export function getDefaultDatabasePath(): string {
  const home = homedir();
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming');
    return join(appData, 'relay', 'relay.db');
  }
  if (process.platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'relay', 'relay.db');
  }
  const xdgData = process.env.XDG_DATA_HOME || join(home, '.local', 'share');
  return join(xdgData, 'relay', 'relay.db');
}

export function resolveDatabasePath(explicitPath?: string): string {
  if (explicitPath !== undefined) {
    if (!explicitPath.trim()) {
      throw new RelayError('Database path cannot be empty or whitespace only.');
    }
    return explicitPath.trim();
  }

  const envPath = process.env.RELAY_DB_PATH;
  if (envPath && envPath.trim()) {
    return envPath.trim();
  }

  return getDefaultDatabasePath();
}
```

- [ ] **Step 4: Implement `src/database/connection.ts`**

```ts
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolveDatabasePath } from './database-config.js';

export interface DatabaseConnectionOptions {
  readonly path?: string;
  readonly readonly?: boolean;
}

export function createDatabaseConnection(
  options: DatabaseConnectionOptions = {},
): Database.Database {
  const dbPath = resolveDatabasePath(options.path);

  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath, { readonly: options.readonly });

  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  return db;
}
```

- [ ] **Step 5: Write scaffold SQL migration `src/database/migrations/0001_scaffold.sql`**

```sql
CREATE TABLE IF NOT EXISTS relay_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO relay_metadata (key, value) VALUES ('schema_version', '1');
```

- [ ] **Step 6: Implement migration loader and runner `src/database/migration.ts` & `src/database/migrate.ts`**

`src/database/migration.ts`:

```ts
import { createHash } from 'node:hash';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RelayError } from '../shared/errors.js';

export interface MigrationFile {
  readonly version: number;
  readonly name: string;
  readonly filename: string;
  readonly sql: string;
  readonly checksum: string;
}

export function computeChecksum(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

export function loadMigrationFiles(migrationsDir: string): readonly MigrationFile[] {
  const entries = readdirSync(migrationsDir, { withFileTypes: true });
  const files: MigrationFile[] = [];
  const seenVersions = new Set<number>();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.sql')) continue;

    const match = /^(\d{4})_(.+)\.sql$/.exec(entry.name);
    if (!match) {
      throw new RelayError(
        `Malformed migration filename: ${entry.name}. Expected format: NNNN_description.sql`,
      );
    }

    const versionStr = match[1];
    const name = match[2];
    if (!versionStr || !name) continue;

    const version = parseInt(versionStr, 10);
    if (seenVersions.has(version)) {
      throw new RelayError(`Duplicate migration version prefix: ${versionStr}`);
    }
    seenVersions.add(version);

    const fullPath = join(migrationsDir, entry.name);
    const sql = readFileSync(fullPath, 'utf-8');
    const checksum = computeChecksum(sql);

    files.push({ version, name, filename: entry.name, sql, checksum });
  }

  return files.sort((a, b) => a.version - b.version);
}
```

`src/database/migrate.ts`:

```ts
import type Database from 'better-sqlite3';
import { join } from 'node:path';
import { loadMigrationFiles } from './migration.js';
import { RelayError } from '../shared/errors.js';

export interface MigrationOptions {
  readonly migrationsDir?: string;
}

export function runMigrations(db: Database.Database, options: MigrationOptions = {}): void {
  const migrationsDir =
    options.migrationsDir || join(process.cwd(), 'src', 'database', 'migrations');

  db.exec(`
    CREATE TABLE IF NOT EXISTS _relay_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db
    .prepare('SELECT version, name, checksum FROM _relay_migrations ORDER BY version ASC')
    .all() as {
    version: number;
    name: string;
    checksum: string;
  }[];

  const appliedMap = new Map(appliedRows.map((r) => [r.version, r]));
  const migrationFiles = loadMigrationFiles(migrationsDir);

  for (const file of migrationFiles) {
    const applied = appliedMap.get(file.version);
    if (applied) {
      if (applied.checksum !== file.checksum || applied.name !== file.name) {
        throw new RelayError(
          `Migration mismatch for version ${file.version} (${file.filename}). ` +
            `Applied checksum/name does not match repository SQL file. Applied SQL files are immutable.`,
        );
      }
      continue;
    }

    const applyTransaction = db.transaction(() => {
      db.exec(file.sql);
      db.prepare(
        `INSERT INTO _relay_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      ).run(file.version, file.name, file.checksum);
    });

    applyTransaction();
  }
}
```

- [ ] **Step 7: Implement temporary database test helper `tests/support/temporary-database.ts`**

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { createDatabaseConnection } from '../../src/database/connection.js';

export interface TemporaryDatabaseContext {
  readonly dir: string;
  readonly dbPath: string;
  readonly db: Database.Database;
  readonly cleanup: () => void;
}

export function createTemporaryDatabase(): TemporaryDatabaseContext {
  const dir = mkdtempSync(join(tmpdir(), 'relay-test-'));
  const dbPath = join(dir, 'test.db');
  const db = createDatabaseConnection({ path: dbPath });

  const cleanup = () => {
    try {
      db.close();
    } catch {
      // ignore
    }
    rmSync(dir, { recursive: true, force: true });
  };

  return { dir, dbPath, db, cleanup };
}
```

- [ ] **Step 8: Write database integration tests `tests/integration/database-migrations.test.ts`**

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { createTemporaryDatabase } from '../support/temporary-database.js';
import { runMigrations } from '../../src/database/migrate.js';

describe('database-migrations integration', () => {
  let tempDb: ReturnType<typeof createTemporaryDatabase> | null = null;

  afterEach(() => {
    tempDb?.cleanup();
    tempDb = null;
  });

  it('runs migrations on a fresh temporary SQLite database and verifies PRAGMAs', () => {
    tempDb = createTemporaryDatabase();
    const { db } = tempDb;

    runMigrations(db);

    const fk = db.pragma('foreign_keys', { simple: true });
    const jm = db.pragma('journal_mode', { simple: true });
    const bt = db.pragma('busy_timeout', { simple: true });

    expect(fk).toBe(1);
    expect(jm).toBe('wal');
    expect(bt).toBe(5000);

    const migrations = db.prepare('SELECT version, name FROM _relay_migrations').all() as {
      version: number;
      name: string;
    }[];
    expect(migrations).toHaveLength(1);
    expect(migrations[0]?.version).toBe(1);
    expect(migrations[0]?.name).toBe('scaffold');

    // Idempotence test
    expect(() => runMigrations(db)).not.toThrow();
  });
});
```

- [ ] **Step 9: Run database unit and integration tests**

Run: `pnpm vitest run tests/unit/database tests/integration/database-migrations.test.ts`
Expected: ALL PASS.

- [ ] **Step 10: Commit**

```bash
git add src/database/ tests/database tests/support/package.json pnpm-lock.yaml
git commit -m "feat(database): implement SQLite connection factory, PRAGMAs, and transactional SHA-256 SQL migration runner"
```

---

### Task 6: MCP Server Factory & In-Process Integration Test

**Files:**

- Create: `src/interfaces/mcp/logger.ts`
- Create: `src/interfaces/mcp/create-mcp-server.ts`
- Create: `tests/unit/interfaces/mcp/create-mcp-server.test.ts`

**Interfaces:**

- Consumes: `getHealth()` from application layer
- Produces: `createMcpServer()` factory exposing `relay_health` tool, and `logger.ts` writing only to stderr.

- [ ] **Step 1: Install `@modelcontextprotocol/sdk` and `zod`**

Run: `pnpm add @modelcontextprotocol/sdk zod`
Expected: MCP SDK and Zod installed.

- [ ] **Step 2: Write stderr logger `src/interfaces/mcp/logger.ts`**

```ts
export const mcpLogger = {
  info(message: string): void {
    process.stderr.write(`[INFO] ${message}\n`);
  },
  error(message: string, error?: unknown): void {
    const detail = error instanceof Error ? `: ${error.message}` : '';
    process.stderr.write(`[ERROR] ${message}${detail}\n`);
  },
};
```

- [ ] **Step 3: Write failing unit test for `createMcpServer`**

`tests/unit/interfaces/mcp/create-mcp-server.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../../../src/interfaces/mcp/create-mcp-server.js';

describe('createMcpServer', () => {
  it('exposes relay_health tool via in-memory transport', async () => {
    const server = createMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client({ name: 'test-client', version: '1.0.0' });

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const tools = await client.listTools();
    expect(tools.tools.some((t) => t.name === 'relay_health')).toBe(true);

    const result = await client.callTool({ name: 'relay_health', arguments: {} });
    expect(result.content[0]?.type).toBe('text');
    if (result.content[0]?.type === 'text') {
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toEqual({ name: 'relay', status: 'ok', version: '0.1.0' });
    }
  });
});
```

- [ ] **Step 4: Implement `src/interfaces/mcp/create-mcp-server.ts`**

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getHealth } from '../../application/health/get-health.js';
import { getPackageMetadata } from '../../shared/package-metadata.js';
import { z } from 'zod';

export function createMcpServer(): McpServer {
  const meta = getPackageMetadata();
  const server = new McpServer({
    name: meta.name,
    version: meta.version,
  });

  server.tool('relay_health', 'Return health status of the local Relay service', {}, async () => {
    const health = getHealth();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(health),
        },
      ],
    };
  });

  return server;
}
```

- [ ] **Step 5: Run unit test to verify pass**

Run: `pnpm vitest run tests/unit/interfaces/mcp/create-mcp-server.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/interfaces/mcp/ tests/unit/interfaces/mcp/ package.json pnpm-lock.yaml
git commit -m "feat(mcp): implement MCP server factory exposing relay_health tool over SDK in-memory transport"
```

---

### Task 7: MCP Stdio Entry Point, Build Setup & Built-Process Integration Test

**Files:**

- Create: `src/interfaces/mcp/main.ts`
- Create: `tsup.config.ts`
- Modify: `package.json`
- Create: `tests/integration/mcp-stdio.test.ts`

**Interfaces:**

- Consumes: `createMcpServer()` factory
- Produces: `dist/mcp/main.js` built executable, and `pnpm dev:mcp` command.

- [ ] **Step 1: Install `tsup`**

Run: `pnpm add -D tsup`
Expected: `tsup` build tool installed.

- [ ] **Step 2: Create `tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/interfaces/mcp/main.ts', 'src/interfaces/http/main.ts'],
  format: ['esm'],
  target: 'node24',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  bundle: true,
  shims: true,
});
```

- [ ] **Step 3: Implement `src/interfaces/mcp/main.ts`**

```ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './create-mcp-server.js';
import { mcpLogger } from './logger.js';

async function main(): Promise<void> {
  try {
    const server = createMcpServer();
    const transport = new StdioServerTransport();

    process.on('SIGINT', () => {
      mcpLogger.info('Received SIGINT, shutting down MCP server...');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      mcpLogger.info('Received SIGTERM, shutting down MCP server...');
      process.exit(0);
    });

    await server.connect(transport);
  } catch (error) {
    mcpLogger.error('Fatal error starting MCP stdio server', error);
    process.exit(1);
  }
}

void main();
```

- [ ] **Step 4: Update `package.json` scripts for `build:node` and `dev:mcp`**

Add scripts:

```json
"build:node": "tsup",
"dev:mcp": "node --import tsx/esm src/interfaces/mcp/main.ts"
```

Install `tsx` for ts node running: `pnpm add -D tsx`

- [ ] **Step 5: Run `pnpm build:node` and verify build output**

Run: `pnpm build:node`
Expected: `dist/mcp/main.js` generated.

- [ ] **Step 6: Write integration test for built MCP stdio process `tests/integration/mcp-stdio.test.ts`**

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

describe('mcp-stdio integration', () => {
  beforeAll(() => {
    execSync('pnpm build:node', { stdio: 'inherit' });
  });

  it('spawns built MCP stdio process and calls relay_health tool cleanly', async () => {
    const builtJsPath = join(process.cwd(), 'dist', 'mcp', 'main.js');

    const transport = new StdioClientTransport({
      command: 'node',
      args: [builtJsPath],
    });

    const client = new Client({ name: 'integration-tester', version: '1.0.0' });

    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools.tools.some((t) => t.name === 'relay_health')).toBe(true);

    const res = await client.callTool({ name: 'relay_health', arguments: {} });
    expect(res.content[0]?.type).toBe('text');
    if (res.content[0]?.type === 'text') {
      const payload = JSON.parse(res.content[0].text);
      expect(payload).toEqual({ name: 'relay', status: 'ok', version: '0.1.0' });
    }

    await transport.close();
  });
});
```

- [ ] **Step 7: Run integration test**

Run: `pnpm vitest run tests/integration/mcp-stdio.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/interfaces/mcp/main.ts tsup.config.ts tests/integration/mcp-stdio.test.ts package.json pnpm-lock.yaml
git commit -m "feat(mcp): add MCP stdio executable entry point, tsup build configuration, and stdio integration test"
```

---

### Task 8: Loopback HTTP Server Factory, Entry Point & Integration Tests

**Files:**

- Create: `src/interfaces/http/create-http-server.ts`
- Create: `src/interfaces/http/main.ts`
- Create: `tests/integration/http-health.test.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: `getHealth()` application contract
- Produces: `node:http` server binding to `127.0.0.1` exposing `GET /api/health`, and `pnpm dev:http` script.

- [ ] **Step 1: Write failing integration test `tests/integration/http-health.test.ts`**

```ts
import { describe, it, expect, afterEach } from 'vitest';
import {
  createHttpServer,
  type HttpServerInstance,
} from '../../src/interfaces/http/create-http-server.js';

describe('http-health integration', () => {
  let serverInstance: HttpServerInstance | null = null;

  afterEach(async () => {
    if (serverInstance) {
      await serverInstance.stop();
      serverInstance = null;
    }
  });

  it('starts on 127.0.0.1 and returns 200 for GET /api/health', async () => {
    serverInstance = await createHttpServer({ host: '127.0.0.1', port: 0 });
    const { url } = serverInstance;

    const res = await fetch(`${url}/api/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const body = await res.json();
    expect(body).toEqual({ name: 'relay', status: 'ok', version: '0.1.0' });
  });

  it('returns 405 Method Not Allowed for POST /api/health', async () => {
    serverInstance = await createHttpServer({ host: '127.0.0.1', port: 0 });
    const { url } = serverInstance;

    const res = await fetch(`${url}/api/health`, { method: 'POST' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });

  it('returns 404 Not Found for unknown routes', async () => {
    serverInstance = await createHttpServer({ host: '127.0.0.1', port: 0 });
    const { url } = serverInstance;

    const res = await fetch(`${url}/unknown-route`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'not_found' });
  });
});
```

- [ ] **Step 2: Implement `src/interfaces/http/create-http-server.ts`**

```ts
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { getHealth } from '../../application/health/get-health.js';
import { RelayError } from '../../shared/errors.js';

export interface HttpServerOptions {
  readonly host?: string;
  readonly port?: number;
}

export interface HttpServerInstance {
  readonly server: Server;
  readonly host: string;
  readonly port: number;
  readonly url: string;
  readonly stop: () => Promise<void>;
}

export function resolveHttpPort(explicitPort?: number): number {
  if (explicitPort !== undefined) {
    if (explicitPort < 0 || explicitPort > 65535) {
      throw new RelayError(`Invalid HTTP port: ${explicitPort}. Must be between 0 and 65535.`);
    }
    return explicitPort;
  }

  const envPort = process.env.RELAY_HTTP_PORT;
  if (envPort) {
    const parsed = parseInt(envPort, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
      throw new RelayError(`Invalid RELAY_HTTP_PORT environment variable: ${envPort}.`);
    }
    return parsed;
  }

  return 43110;
}

export function createHttpServer(options: HttpServerOptions = {}): Promise<HttpServerInstance> {
  const host = options.host || '127.0.0.1';
  const port = resolveHttpPort(options.port);

  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new RelayError(
      `Loopback security restriction: HTTP server host must be 127.0.0.1 or localhost (got ${host}).`,
    );
  }

  const requestHandler = (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

    if (url.pathname === '/api/health') {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', Allow: 'GET' });
        res.end(JSON.stringify({ error: 'method_not_allowed' }));
        return;
      }

      const health = getHealth();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(health));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'not_found' }));
  };

  const server = createServer(requestHandler);

  return new Promise((resolve, reject) => {
    server.on('error', (err) => reject(new RelayError('HTTP server error', err)));

    server.listen(port, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      const serverUrl = `http://${host}:${actualPort}`;

      const stop = (): Promise<void> => {
        return new Promise((resStop, rejStop) => {
          server.close((err) => {
            if (err) rejStop(err);
            else resStop();
          });
        });
      };

      resolve({
        server,
        host,
        port: actualPort,
        url: serverUrl,
        stop,
      });
    });
  });
}
```

- [ ] **Step 3: Implement HTTP entry point `src/interfaces/http/main.ts`**

```ts
import { createHttpServer } from './create-http-server.js';

async function main(): Promise<void> {
  try {
    const instance = await createHttpServer();
    process.stderr.write(`[INFO] HTTP server running at ${instance.url}\n`);

    const shutdown = () => {
      process.stderr.write('[INFO] Stopping HTTP server...\n');
      void instance.stop().then(() => process.exit(0));
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[ERROR] Fatal HTTP server error: ${msg}\n`);
    process.exit(1);
  }
}

void main();
```

- [ ] **Step 4: Update `package.json` for `dev:http`**

Add script:

```json
"dev:http": "node --import tsx/esm src/interfaces/http/main.ts"
```

- [ ] **Step 5: Run HTTP integration tests**

Run: `pnpm vitest run tests/integration/http-health.test.ts`
Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add src/interfaces/http/ tests/integration/http-health.test.ts package.json pnpm-lock.yaml
git commit -m "feat(http): implement loopback node:http server factory with GET /api/health route and integration tests"
```

---

### Task 9: Vite React Shell & Health Client

**Files:**

- Create: `web/index.html`
- Create: `web/src/vite-env.d.ts`
- Create: `web/src/api/health-client.ts`
- Create: `web/src/App.tsx`
- Create: `web/src/main.tsx`
- Create: `vite.config.ts`
- Create: `tests/unit/web/health-client.test.ts`
- Create: `web/src/App.test.tsx`
- Modify: `package.json`

**Interfaces:**

- Consumes: HTTP endpoint `/api/health`
- Produces: React 19 connectivity shell displaying loading, connected/version, and failure/retry states; `pnpm dev:web` and `pnpm dev:ui` scripts.

- [ ] **Step 1: Install React 19, Vite, and Testing Library**

Run: `pnpm add react react-dom && pnpm add -D vite @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom`

- [ ] **Step 2: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'web',
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:43110',
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 3: Create `web/index.html` and `web/src/vite-env.d.ts`**

`web/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Relay</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`web/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 4: Implement browser health client `web/src/api/health-client.ts`**

```ts
import { z } from 'zod';

export const HealthStatusSchema = z.object({
  name: z.literal('relay'),
  status: z.literal('ok'),
  version: z.string(),
});

export type HealthStatusResponse = z.infer<typeof HealthStatusSchema>;

export async function fetchHealth(signal?: AbortSignal): Promise<HealthStatusResponse> {
  const res = await fetch('/api/health', { signal });
  if (!res.ok) {
    throw new Error(`Health check failed with status ${res.status}`);
  }
  const data = await res.json();
  const parsed = HealthStatusSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Invalid health check response schema');
  }
  return parsed.data;
}
```

- [ ] **Step 5: Write unit test `tests/unit/web/health-client.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchHealth } from '../../../web/src/api/health-client.js';

describe('health-client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses valid /api/health response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ name: 'relay', status: 'ok', version: '0.1.0' }),
      }),
    );

    const health = await fetchHealth();
    expect(health).toEqual({ name: 'relay', status: 'ok', version: '0.1.0' });
  });

  it('throws on non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }),
    );

    await expect(fetchHealth()).rejects.toThrow('Health check failed with status 500');
  });
});
```

- [ ] **Step 6: Implement `web/src/App.tsx`**

```tsx
import { useEffect, useState, useCallback } from 'react';
import { fetchHealth, type HealthStatusResponse } from './api/health-client.js';

export function App() {
  const [health, setHealth] = useState<HealthStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHealth = useCallback(() => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();

    fetchHealth(controller.signal)
      .then((data) => {
        setHealth(data);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLoading(false);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    return loadHealth();
  }, [loadHealth]);

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Relay</h1>
      <p>Local task sidecar for human–AI workflows.</p>

      <div
        style={{
          marginTop: '1.5rem',
          padding: '1rem',
          border: '1px solid #ccc',
          borderRadius: '4px',
        }}
      >
        {loading && <p data-testid="status-loading">Checking local service…</p>}
        {!loading && error && (
          <div data-testid="status-error">
            <p style={{ color: 'red' }}>Relay service unavailable</p>
            <button onClick={loadHealth} type="button">
              Retry
            </button>
          </div>
        )}
        {!loading && health && <p data-testid="status-success">Connected (v{health.version})</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Implement `web/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
```

- [ ] **Step 8: Write UI smoke test `web/src/App.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from './App.js';
import * as healthClient from './api/health-client.js';

describe('App component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading, then success state', async () => {
    vi.spyOn(healthClient, 'fetchHealth').mockResolvedValue({
      name: 'relay',
      status: 'ok',
      version: '0.1.0',
    });

    render(<App />);

    expect(screen.getByTestId('status-loading')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByTestId('status-success')).toBeDefined();
    });
    expect(screen.getByText('Connected (v0.1.0)')).toBeDefined();
  });

  it('renders error state and handles retry button click', async () => {
    const fetchSpy = vi
      .spyOn(healthClient, 'fetchHealth')
      .mockRejectedValueOnce(new Error('Connection refused'))
      .mockResolvedValueOnce({ name: 'relay', status: 'ok', version: '0.1.0' });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('status-error')).toBeDefined();
    });

    const retryBtn = screen.getByText('Retry');
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByTestId('status-success')).toBeDefined();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 9: Install concurrently for `dev:ui` and update `package.json` scripts**

Run: `pnpm add -D concurrently`

Add scripts:

```json
"dev:web": "vite",
"dev:ui": "concurrently -k -p name -c \"blue,green\" \"pnpm dev:http\" \"pnpm dev:web\""
```

- [ ] **Step 10: Run frontend tests**

Run: `pnpm vitest run tests/unit/web/health-client.test.ts web/src/App.test.tsx`
Expected: ALL PASS.

- [ ] **Step 11: Commit**

```bash
git add web/ vite.config.ts tests/unit/web/ package.json pnpm-lock.yaml
git commit -m "feat(web): add minimal Vite React 19 connectivity shell displaying HTTP health status"
```

---

### Task 10: Node & Web Production Build Integration

**Files:**

- Modify: `package.json`

**Interfaces:**

- Consumes: Source code under `src/` and `web/`
- Produces: `dist/mcp/main.js`, `dist/http/main.js`, and `dist/web/index.html` static bundle.

- [ ] **Step 1: Configure build scripts in `package.json`**

```json
"build:node": "tsup",
"build:web": "vite build",
"build": "pnpm build:node && pnpm build:web"
```

- [ ] **Step 2: Execute `pnpm build`**

Run: `pnpm build`
Expected: Outputs generated in `dist/mcp/main.js`, `dist/http/main.js`, and `dist/web/`.

- [ ] **Step 3: Verify built outputs exist**

Run: `node -e "console.log(fs.existsSync('dist/mcp/main.js') && fs.existsSync('dist/http/main.js') && fs.existsSync('dist/web/index.html'))"`
Expected: `true`.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "build: configure combined Node and Vite web production build scripts"
```

---

### Task 11: Repository Asset Validator

**Files:**

- Create: `scripts/validate-repository-assets.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: Repository files, `package.json#bin`, README local markdown links
- Produces: `validate:assets` script asserting repository structure and document integrity.

- [ ] **Step 1: Write `scripts/validate-repository-assets.ts`**

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function fail(msg: string): never {
  process.stderr.write(`[ASSET VALIDATION FAILURE] ${msg}\n`);
  process.exit(1);
}

function validateAssets(): void {
  const cwd = process.cwd();

  // 1. Required files/directories
  const requiredPaths = [
    '.nvmrc',
    '.editorconfig',
    '.gitignore',
    '.prettierrc.json',
    'eslint.config.js',
    'package.json',
    'README.md',
    'tsconfig.base.json',
    'src/application/health/get-health.ts',
    'src/database/connection.ts',
    'src/interfaces/mcp/create-mcp-server.ts',
    'src/interfaces/http/create-http-server.ts',
    'web/src/App.tsx',
  ];

  for (const p of requiredPaths) {
    if (!existsSync(join(cwd, p))) {
      fail(`Required path missing: ${p}`);
    }
  }

  // 2. package.json bin validation
  const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8')) as {
    bin?: Record<string, string>;
  };
  const binRelayMcp = pkg.bin?.['relay-mcp'];
  if (binRelayMcp !== './dist/mcp/main.js') {
    fail(`package.json#bin.relay-mcp must point to ./dist/mcp/main.js (got ${binRelayMcp})`);
  }

  // 3. No SKILL.md or agent configs in #1
  const forbidden = ['SKILL.md', 'agent/skills', 'agent/mcp'];
  for (const f of forbidden) {
    if (existsSync(join(cwd, f))) {
      fail(`Forbidden asset for Issue #1 present: ${f}`);
    }
  }

  process.stdout.write('Repository asset validation passed successfully.\n');
}

validateAssets();
```

- [ ] **Step 2: Add `validate:assets` script to `package.json`**

```json
"validate:assets": "node --import tsx/esm scripts/validate-repository-assets.ts"
```

- [ ] **Step 3: Run `validate:assets`**

Run: `pnpm validate:assets`
Expected: `Repository asset validation passed successfully.`

- [ ] **Step 4: Commit**

```bash
git add scripts/validate-repository-assets.ts package.json
git commit -m "chore(scripts): implement repository asset validator script"
```

---

### Task 12: Non-Mutating Aggregate Verification Gate, Audit & GitHub Actions CI Workflow

**Files:**

- Create: `.github/workflows/ci.yml`
- Modify: `package.json`

**Interfaces:**

- Consumes: All quality scripts (`format:check`, `lint`, `typecheck`, `test:coverage`, `build`, `validate:assets`, `audit`)
- Produces: `pnpm verify` command and automated `.github/workflows/ci.yml` PR workflow.

- [ ] **Step 1: Add `audit` and `verify` scripts to `package.json`**

```json
"audit": "pnpm audit --audit-level high",
"verify": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build && pnpm validate:assets && pnpm audit"
```

- [ ] **Step 2: Test `pnpm verify` locally**

Run: `pnpm verify`
Expected: Passes format check, lint, typecheck, coverage, build, asset validation, and audit cleanly.

- [ ] **Step 3: Verify git status is completely clean after `pnpm verify`**

Run: `git status --short`
Expected: Empty output (non-mutating).

- [ ] **Step 4: Write GitHub Actions workflow `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js 24
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: 'pnpm'

      - name: Enable Corepack
        run: corepack enable

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run verification gate
        run: pnpm verify
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml package.json pnpm-lock.yaml
git commit -m "ci: add pnpm verify aggregate gate and GitHub Actions CI workflow"
```

---

### Task 13: Scaffold Documentation & Final Clean Verification

**Files:**

- Modify: `README.md`
- Delete: Any temporary or demo files not explicitly part of the specification

**Interfaces:**

- Consumes: Verified commands from repository
- Produces: Complete, accurate, concise `README.md` covering prerequisites, setup, scripts, loopback ports, database configuration, migrations, MCP invocation, architecture, and scaffold limitations.

- [ ] **Step 1: Complete `README.md`**

````markdown
# Relay

Local task sidecar for human–AI workflows.

> **Status:** Scaffold stage (Issue #1). Task tracking, companion skills, and agent features are deferred to subsequent issues.

## Prerequisites

- Node.js 24.x LTS (`.nvmrc`)
- pnpm 10.2.0 (managed via Corepack)

## Setup

```bash
corepack enable
pnpm install --frozen-lockfile
```
````

## Available Scripts

- `pnpm verify` — Non-mutating aggregate quality gate (runs format check, lint, typecheck, test coverage, build, asset validation, and audit).
- `pnpm format` — Format codebase with Prettier (mutating).
- `pnpm format:check` — Check formatting with Prettier.
- `pnpm lint` — Run ESLint (`--max-warnings=0`).
- `pnpm typecheck` — Perform strict TypeScript type checking.
- `pnpm test` — Run Vitest tests once.
- `pnpm test:coverage` — Run Vitest tests with V8 coverage enforcement.
- `pnpm build` — Build Node backend (`dist/mcp`, `dist/http`) and Vite web UI (`dist/web`).
- `pnpm dev:mcp` — Run MCP stdio entry point from source.
- `pnpm dev:http` — Run HTTP server from source (`http://127.0.0.1:43110`).
- `pnpm dev:web` — Run Vite development server with proxy to `/api`.
- `pnpm dev:ui` — Run HTTP server and Vite development server concurrently.
- `pnpm validate:assets` — Validate repository assets and configuration.

## Configuration & Environment Variables

- `RELAY_DB_PATH`: Custom path to SQLite database file.
  - Default on Windows: `%APPDATA%\relay\relay.db`
  - Default on macOS: `~/Library/Application Support/relay/relay.db`
  - Default on Linux: `~/.local/share/relay/relay.db`
- `RELAY_HTTP_PORT`: Custom port for loopback HTTP server (default: `43110`).

## Database & Migrations

Relay uses `better-sqlite3` with plain SQL migrations located under `src/database/migrations/`.
On connection, SQLite PRAGMAs are executed:

- `PRAGMA foreign_keys = ON;`
- `PRAGMA journal_mode = WAL;`
- `PRAGMA busy_timeout = 5000;`

Applied SQL migrations are recorded with SHA-256 checksums in `_relay_migrations` and are immutable.

## Local MCP Invocation

After running `pnpm build`:

```bash
node dist/mcp/main.js
```

Or invoke the package binary entry point:

```bash
./dist/mcp/main.js
```

Exposes one scaffold tool: `relay_health`.

## Architecture Boundaries

```text
src/
  domain/         # Domain entities (deferred)
  application/    # Application services (getHealth)
  database/       # SQLite connection and migration runner
  interfaces/
    mcp/          # MCP stdio server adapter
    http/         # Loopback HTTP server adapter
  shared/         # Errors and package metadata
web/              # Vite React 19 UI shell
```

- `domain` and `application` layers do not import interface or database code.
- MCP stdio process never writes non-protocol diagnostic data to `stdout`.
- HTTP server binds strictly to `127.0.0.1` (loopback).

## Current Limitations

- No task CRUD, task table, or product task behavior.
- No companion skills, plugin manifests, or vendor-specific MCP configs (moved to Issue #2).
- No remote access, authentication, multi-user accounts, or desktop packaging.

````

- [ ] **Step 2: Run clean-checkout verification procedure**

Run:
```bash
pnpm verify
````

- [ ] **Step 3: Verify git status is completely clean**

Run: `git status --short`
Expected: Empty output.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: finalize scaffold README with setup instructions, architecture rules, and script references"
```
