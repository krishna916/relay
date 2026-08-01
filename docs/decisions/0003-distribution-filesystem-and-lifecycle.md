# Relay Distribution, Filesystem, and Lifecycle Contract

Status: Accepted
**Date:** 2026-08-01

## Context

Relay currently runs from a source checkout through separate MCP, HTTP, and CLI
entry points. Issue #39 defines the future public distribution boundary without
implementing publication, setup, doctor, or real client-configuration mutation.
This decision is the authoritative contract for the later packaging and path
resolver work. It deliberately does not change the current source-checkout
commands.

## Decision Summary

Relay will have one publishable application identity, one user-facing
executable, one version across all shipped assets, and a deliberately narrow
initial platform matrix. User data and configuration are per-user and
independent of the current working directory. Client setup will own only
identifiable Relay entries, and ordinary removal operations will retain user
data. Publication will require an explicit maintainer action.

## Package and Executable

- The npm package is `@krishna916/relay`.
- The user-facing executable is `relay`.
- The planned later installation form is `npm install --global @krishna916/relay`.
- Operational invocation examples are `relay setup`, `relay mcp`, `relay ui`,
  `relay doctor`, and `relay config`.
- Existing task and session commands remain under the same `relay` executable.
- The current source checkout may temporarily retain `relay-mcp`, but it is
  transitional and is not part of the final public distribution contract.
- The later packaging issue will route MCP through `relay mcp`.

## Supported Runtime Matrix

| Operating system | Architecture | Status      | Evidence required before release                                                                                             |
| ---------------- | ------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Windows 10/11    | x64          | Supported   | clean global install, native dependency load, setup dry-run/fixture validation, MCP stdio smoke test, UI loopback smoke test |
| macOS 13+        | arm64        | Supported   | the same evidence on Apple Silicon                                                                                           |
| Linux            | x64, glibc   | Supported   | the same evidence on at least Ubuntu LTS; claims remain limited to glibc-compatible x64 Linux                                |
| Windows          | arm64        | Unsupported | no release claim                                                                                                             |
| macOS            | x64          | Unsupported | no release claim                                                                                                             |
| Linux            | arm64        | Unsupported | no release claim                                                                                                             |
| Alpine/musl      | any          | Unsupported | `better-sqlite3` compatibility is not claimed                                                                                |

The supported Node major is Node.js 24 only, expressed as `>=24 <25`. The
initial supported runtime tuples are Windows x64, macOS arm64, and Linux x64
with glibc. Execution on one Linux distribution does not justify a claim for
all Linux distributions.

## Operational Command Surface

- `relay setup` will idempotently initialize Relay-owned directories and
  metadata and prepare or update explicitly selected client integrations. It
  never deletes data and reports exact changes. Implementation is deferred.
- `relay mcp` will start the canonical stdio MCP server. Its stdout is
  protocol-only and diagnostics go to stderr.
- `relay ui` will start the local HTTP/UI process on loopback only. It will not
  daemonize or register startup behavior.
- `relay doctor` will be read-only by default. Repair requires a future
  explicit flag and a separate contract.
- `relay config` will display effective paths, version, supported matrix, and
  integration ownership metadata. Mutations require explicit later
  subcommands.
- Uninstall guidance is documentation, not a `relay uninstall` command in the
  MVP.

## Exit Codes and Output Channels

The operational surface reuses the existing stable CLI categories:

| Code | Category         | Operational meaning                                                                                                     |
| ---- | ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 0    | success          | command completed, including idempotent no-change outcomes                                                              |
| 1    | internal         | unexpected Relay defect or uncategorized failure                                                                        |
| 2    | usage/validation | invalid arguments, unsupported platform, invalid configuration, or incompatible requested operation                     |
| 3    | not found        | requested Relay-owned integration entry or resource is absent where absence is an error                                 |
| 4    | conflict         | unsafe overwrite, ownership mismatch, incompatible existing entry, unsupported downgrade, or migration/version conflict |
| 5    | storage          | filesystem, permission, SQLite, backup, or persistence failure                                                          |

In human mode, successful results and exact change reports go to stdout;
diagnostics and failures go to stderr. In JSON mode, stdout contains exactly
one schema-versioned JSON document plus a newline; diagnostics remain on
stderr. `relay mcp` writes all MCP protocol frames to stdout and every log or
diagnostic to stderr. Secrets, full prompts, and full configuration contents
are never echoed in change reports.

## Filesystem and Path Resolution

All paths are per-user and resolved by one future shared resolver. Directory casing is platform-specific. Windows and macOS use `Relay`; Linux uses lowercase `relay`. Windows cache uses the canonical child name `Cache`. Path comparison follows native platform semantics, but generated paths always use these spellings.

| Purpose             | Windows                                                            | macOS                                                             | Linux                                                             |
| ------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| data root           | `%LOCALAPPDATA%\\Relay`                                            | `~/Library/Application Support/Relay`                             | `${XDG_DATA_HOME:-~/.local/share}/relay`                          |
| database            | `<data-root>\\relay.db`                                            | `<data-root>/relay.db`                                            | `<data-root>/relay.db`                                            |
| Relay config root   | `%APPDATA%\\Relay`                                                 | `~/Library/Application Support/Relay/config`                      | `${XDG_CONFIG_HOME:-~/.config}/relay`                             |
| Relay metadata file | `<config-root>\\config.json`                                       | `<config-root>/config.json`                                       | `<config-root>/config.json`                                       |
| cache root          | `%LOCALAPPDATA%\\Relay\\Cache`                                     | `~/Library/Caches/Relay`                                          | `${XDG_CACHE_HOME:-~/.cache}/relay`                               |
| diagnostic logs     | disabled by default; when explicitly enabled, `<cache-root>\\logs` | disabled by default; when explicitly enabled, `<cache-root>/logs` | disabled by default; when explicitly enabled, `<cache-root>/logs` |

Database precedence, highest first:

1. an explicit in-process path supplied by test or internal dependency
   injection;
2. a non-empty `RELAY_DB_PATH`;
3. the platform default database path.

Empty or whitespace-only `RELAY_DB_PATH` is a validation error. Relative
`RELAY_DB_PATH` values are rejected for installed/public operation; tests may
use explicit absolute temporary paths. The current working directory,
repository root, executable directory, and package installation directory
never influence mutable data, configuration, cache, or log paths. Immutable
package assets resolve from the installed module using `import.meta.url` and
`fileURLToPath`, never from `cwd`. There is no general `RELAY_HOME` override in
the MVP.

## Client Configuration Ownership

Relay owns only identifiable exact entries or fragments and never rewrites an
entire client configuration.

- Codex and Claude Code each have one exact MCP server entry named `relay`.
  Unrelated keys and server entries are preserved.
- Generic clients receive a documented fragment by default. A file is mutated
  only by a later client-specific adapter with an explicit parser, ownership
  rule, and backup contract.
- Claude Desktop MCPB is a separate client-specific distribution proof and is
  not merged into npm setup ownership.
- Relay metadata records client kind, configuration path, owned entry
  identifier, package/application version, installed command and arguments,
  backup reference, and last successful setup timestamp.
- An existing `relay` entry is updated only when it is provably Relay-owned or
  exactly matches a previously recorded Relay entry. Ownership is never
  inferred from the command name alone.
- An unowned or conflicting `relay` entry causes exit code `4`, reports the
  conflict, and receives no mutation.

## Setup Idempotency and Backups

Repeated setup with the same desired state returns success with `changed:
false` and writes nothing. Before every real client-configuration mutation,
setup creates a sibling timestamped backup named
`<filename>.relay-backup-YYYYMMDDTHHMMSSZ`. It writes through a temporary
sibling file, flushes and closes it, and atomically replaces the original where
supported. The post-write file is parsed and validated before success is
reported.

If validation or replacement fails, the backup is preserved, exit code `5` is
reported, and Relay ownership metadata is not updated. Exact change reports
include the file path, backup path, owned entry identifier, and operation
(`created`, `updated`, `unchanged`, or `removed`) while redacting secrets and
unrelated configuration content. Setup never initializes, truncates, replaces,
or deletes an existing database.

## Upgrade, Downgrade, Disable, Removal, and Retention

- Upgrade retains the database and Relay metadata. Forward-only SQL migrations
  run before commands are served, while immutable package assets are replaced
  by the package manager.
- A migration failure aborts startup or the command and leaves the original
  database intact to the extent guaranteed by transactional migration
  boundaries. It reports a storage or conflict category as appropriate.
- Downgrades are unsupported after a newer application or migration version
  has opened the database. They fail closed with exit code `4` and remediation
  guidance to reinstall the newer version or restore a user-created backup.
- Disable removes or disables only the owned client entry and keeps the
  package, database, metadata, and backups.
- Integration removal removes only the exact owned entry after a fresh backup
  and keeps the package and all user data.
- Normal uninstall retains user data: package uninstall removes package-managed
  files only; client configuration may require prior integration removal; user
  data, configuration, cache, and backups remain.
- Destructive data deletion is a separate future explicit action, never part of
  npm uninstall or normal integration removal. It must name target paths and
  require interactive confirmation or explicit non-interactive acknowledgement.
- Backups are user data and are not automatically deleted by uninstall.

## Package Asset Resolution

The package, CLI, MCP contracts, database migrations, UI assets, skills,
integration templates, and other immutable package assets are released as one
application version. Mutable user paths are resolved through the shared future
resolver; immutable assets are resolved relative to the installed module using
`import.meta.url`/`fileURLToPath`.

## Version Compatibility

The npm package version is the application version for the CLI, MCP, UI,
migrations, skills, integration templates, and package assets. MCP and CLI
payload schema versions remain explicit independent contract fields; changing
the application version does not automatically change them. Migration state is
stored in the migration table and compared with the supported migration range.
Package assets must contain or derive from the same package version, and
validation rejects divergent hard-coded versions. Setup records the application
version that last wrote each owned integration entry. Patch and minor upgrades
preserve documented command and schema compatibility unless a separate
migration or contract decision says otherwise. Major-version policy is deferred
until a breaking release is proposed.

## Publication Approval

Publication occurs only through an explicit maintainer-triggered release
workflow. There is no publish-on-push and no publish-on-merge. A maintainer
explicitly supplies a version or tag after reviewing CI and platform evidence.
The future workflow verifies tag/version consistency, frozen installation,
`pnpm verify`, package contents, and evidence for every claimed supported
platform before npm publication. npm provenance and trusted publishing should
be used when implemented. Failed or partial platform evidence blocks a release
claim for that platform; claims are not silently broadened or retained when
stale.

## Consequences

Later packaging, setup, doctor, path-resolver, client-adapter, and release work
can implement against one stable contract and deterministic fixtures. The
initial distribution claim stays intentionally narrow, and removal operations
have clear data-retention boundaries. The current
`src/database/database-config.ts` differs from this future contract on Windows
data-root selection and empty `RELAY_DB_PATH` handling. Reconciling those
behaviors is implementation work for a later packaging/path-resolver issue,
not this contract-only issue.

## Explicitly Deferred

This issue does not implement production command dispatch, package publication,
filesystem mutation, setup, doctor, real client-configuration editing,
installers, daemons, telemetry, or speculative distribution mechanisms. It also
does not change source-checkout task command behavior or remove the transitional
`relay-mcp` entry from the current source checkout.
