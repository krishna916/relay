# Operational CLI Contract

This document derives from the [distribution decision](../decisions/0003-distribution-filesystem-and-lifecycle.md)
and the machine-readable operational-command fixture. It describes the later
public distribution surface; it does not implement these commands.

## Scope and Relationship to Task Commands

The five operational commands are exactly `setup`, `mcp`, `ui`, `doctor`, and
`config`:

- `relay setup` prepares Relay-owned paths and explicitly selected integrations
  idempotently, reporting exact redacted changes.
- `relay mcp` starts the canonical MCP server over stdio.
- `relay ui` starts the loopback-only HTTP/UI process on demand.
- `relay doctor` performs read-only diagnostics by default.
- `relay config` displays effective paths, version, supported platforms, and
  integration ownership metadata.

Existing task and session commands remain unchanged under the `relay`
executable. Uninstall guidance remains documentation, not an MVP command.

## Installation Identity

The planned package is `@krishna916/relay`, installed later with
`npm install --global @krishna916/relay`. The final executable is `relay`.
The source checkout may temporarily expose `relay-mcp`, but the final public
MCP invocation is `relay mcp`.

## Command Responsibilities

Setup, doctor, path resolution, client configuration mutation, and publication
are deferred to later issues. No command in this contract performs background
daemonization, startup registration, telemetry, or speculative distribution
behavior.

## Exit-Code Categories

The stable operational exit categories are:

| Code | Category         | Meaning                                                                                                        |
| ---- | ---------------- | -------------------------------------------------------------------------------------------------------------- |
| 0    | success          | Completed, including an idempotent no-change result                                                            |
| 1    | internal         | Unexpected Relay defect or uncategorized failure                                                               |
| 2    | usage/validation | Invalid arguments, unsupported platform, invalid configuration, or incompatible operation                      |
| 3    | not found        | A requested Relay-owned entry or resource is absent where that is an error                                     |
| 4    | conflict         | Unsafe overwrite, ownership mismatch, incompatible entry, unsupported downgrade, or migration/version conflict |
| 5    | storage          | Filesystem, permission, SQLite, backup, or persistence failure                                                 |

## Stdout and Stderr Rules

Human-mode successes and exact change reports go to stdout. Diagnostics and
failures go to stderr. JSON mode writes exactly one schema-versioned JSON
document plus a newline to stdout; diagnostics remain on stderr. Secrets, full
prompts, and full configuration content are never echoed.

## Human Output

Human output identifies the command result and, for setup or integration
operations, each affected path, backup path, owned entry, and operation. A
no-change result is successful and explicitly reports `changed: false`.

## JSON Output

The later operational commands use this envelope shape without implementing it
in issue #39:

```ts
type OperationalResult = {
  schemaVersion: 1;
  ok: boolean;
  command: 'setup' | 'ui' | 'doctor' | 'config';
  changed?: boolean;
  changes?: readonly {
    path: string;
    operation: 'created' | 'updated' | 'unchanged' | 'removed';
    ownedEntry?: string;
    backupPath?: string;
  }[];
  error?: { code: string; message: string };
};
```

`relay mcp` does not use this envelope because it speaks MCP over stdio.

## MCP Protocol Cleanliness

Every MCP protocol frame is written to stdout. Logs and diagnostics are written
to stderr. The MCP process does not print banners, progress messages, or human
diagnostics to stdout.

## Explicitly Deferred Flags and Commands

Production `setup`, `doctor`, client configuration mutation, release
publication, installers, daemons, and destructive data deletion are deferred.
Any future repair mode, configuration mutation, or destructive action requires
an explicit separately documented flag or command and an updated contract.
