# Relay doctor

`relay doctor` inspects an installed Relay package without repairing it. The
default output is human-readable; `relay doctor --output json` writes one
schema-versioned JSON document for automation and support.

Ctrl+C and SIGTERM stop the diagnostic run, clean up active probes and
temporary roots, and do not emit a completed report. Interrupted runs return
130 for SIGINT and 143 for SIGTERM.

Exit codes are stable:

- `0`: no check failed. Warnings and skipped checks are allowed.
- `1`: at least one diagnostic check failed.
- `2`: the command or output option is invalid.

The report schema is version `1` and always contains these checks, in order:

1. `runtime.version`
2. `runtime.platform`
3. `package.assets`
4. `paths.resolution`
5. `paths.access`
6. `database.state`
7. `database.integrity`
8. `database.native-addon`
9. `integrations.codex`
10. `integrations.claude-code`
11. `integrations.generic-mcp`
12. `compatibility.assets`
13. `mcp.handshake`
14. `ui.loopback`

Each check is `healthy`, `warning`, `failure`, or `skipped` and includes a
stable code. Human output uses `[OK]`, `[WARN]`, `[FAIL]`, and `[SKIP]`.

## Safety boundaries

Doctor does not migrate, repair, replace, truncate, or delete the configured
database. It opens an existing database read-only, checks its migration
ledger, and runs SQLite `quick_check` without exposing SQL or engine details.
It does not edit client configuration or Relay ownership metadata and does
not scan for unowned Codex, Claude Code, or generic MCP files. Only paths
approved by the distribution contract may appear in output.

MCP and UI probes run the installed command with a disposable temporary root,
an absolute temporary database, bounded output, deterministic timeouts, and
cleanup on success, failure, timeout, or interruption. No telemetry or remote
support bundle is produced.

## Troubleshooting stable codes

- `runtime.version.*`, `runtime.platform.*`: use Node 24.x on a claimed
  Windows x64, macOS arm64, or Linux x64/glibc runtime.
- `package.assets.*`, `compatibility.assets.*`: reinstall the package from a
  complete tarball; do not copy source-checkout files into an installation.
- `paths.resolution.*`, `paths.access.*`: run `relay setup` with the intended
  isolated paths and check directory permissions.
- `database.missing`: initialize the installation with `relay setup`.
- `database.pending-migrations`, `database.unknown-migrations`, or
  `database.integrity-*`: preserve a backup and investigate the installation
  or migration history; doctor does not perform recovery.
- `database.native-addon-load-failed`: reinstall dependencies/package for the
  supported Node ABI and platform.
- `integrations.*`: inspect only the explicitly recorded ownership path and
  use `relay setup --client ... --config-file <absolute-path>` when an entry
  needs to be re-established.
- `integrations.<client>.config-unparsable`: repair the explicitly owned client
  configuration so its format can be parsed safely.
- `integrations.generic-mcp.template-unreadable`: reinstall the package because
  the packaged generic MCP template is missing or unreadable.
- `mcp.*` and `ui.*`: retry from the installed package, confirm the package
  assets are complete, and check that loopback startup is permitted.

## Human verification matrix

Run each case against an isolated installed tarball, recording status/code,
exit code, database/config bytes and mtimes, temporary roots, child processes,
and whether any secret fixture value appeared:

1. healthy setup;
2. warning-only setup with no owned client integration;
3. unsupported Node/platform simulation;
4. missing immutable asset;
5. unwritable mutable path;
6. pending and corrupt database copies;
7. invalid Codex and Claude owned entries;
8. MCP timeout;
9. UI startup failure;
10. Ctrl+C during MCP and UI probes.

The configured database, ownership metadata, and client files must remain
byte-for-byte unchanged in every case. Temporary roots and child processes
must be gone before doctor exits.
