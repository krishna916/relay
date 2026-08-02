# Relay npm package

Issue #40 builds the local tarball for `@krishna916/relay`. Registry
publication is deliberately not part of this workflow.

## Build and inspect

Use Node.js 24 and pnpm 10.2.0:

```text
pnpm pack:tarball
pnpm verify:package:contents
```

The tarball is written to `.artifacts/npm/`. The positive `files` allowlist
contains the compiled Node runtime, compiled React UI, SQL migrations,
canonical skills, integration templates, README, license, and notices. It
does not contain source, tests, databases, logs, secrets, repository metadata,
or MCPB staging output.

## Install from a tarball

Install into a disposable prefix and invoke the installed command from a
different directory:

```text
npm install --global --prefix <temporary-prefix> <absolute-path-to-tarball>
<temporary-prefix>/bin/relay task list --output json
<temporary-prefix>/bin/relay mcp
<temporary-prefix>/bin/relay ui
```

On Windows the executable is `<temporary-prefix>\relay.cmd`. The package
resolves immutable assets relative to its installed package root, while data,
configuration, and cache paths are independent of the current directory.

`RELAY_DB_PATH` must be an absolute path. It takes precedence over the
platform default, and whitespace or relative values fail with usage/validation
exit code 2. CLI, MCP, and UI use the same effective database path.

After installation, initialize Relay with `relay setup`. To configure Codex or
Claude Code, preview with an explicit absolute `--config-file` and add
`--apply` only after reviewing the exact entry; see [safe setup and
configuration](../setup-and-configuration.md). Generic MCP is snippet-only.

## Supported runtime

The initial release claim is Node.js 24 on Windows x64, macOS arm64, and
Linux x64 with glibc. Windows arm64, macOS x64, Linux arm64, and Alpine/musl
are not claimed. Native `better-sqlite3` installation and runtime evidence is
required for each platform claim.

If `better-sqlite3` cannot load, first confirm Node 24, then install the
platform's native build tools, and reinstall the tarball into a clean prefix.
Do not copy a repository-local `node_modules` directory into the installed
package. A normal uninstall removes package files but retains Relay user data.

## Human verification checklist

- inspect the complete normalized tarball inventory
- run the installed command from an unrelated directory
- capture, list, get, session-capture, and one lifecycle mutation through the installed CLI
- perform an MCP initialize/health handshake and confirm stdout is protocol-only
- start the UI, confirm loopback binding, packaged index HTML, and health/version
- record the temporary database path and native addon load result
- run `pnpm verify`, `pnpm verify:package`, and the independent MCPB staging checks
