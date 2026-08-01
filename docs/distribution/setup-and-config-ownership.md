# Setup and Configuration Ownership

This document derives from the [distribution decision](../decisions/0003-distribution-filesystem-and-lifecycle.md)
and the ownership fixtures. It is a contract for a later setup implementation,
not permission to mutate real user configuration in issue #39.

## Ownership Boundary

Relay owns one exact MCP server entry named `relay` in Codex and Claude Code
configurations. It preserves every unrelated key and server entry. Generic
clients receive a documented fragment by default; file mutation requires a
future client-specific adapter with an explicit parser, ownership rule, and
backup contract. Claude Desktop MCPB remains separate client-specific proof.

An existing `relay` entry is changed only when Relay can prove ownership from
metadata or an exact previously recorded Relay entry. Ownership is never
inferred from the command name alone. An unowned or conflicting entry is a
conflict with exit code `4` and no mutation.

Future mutating Codex or Claude Code setup requires an explicit absolute client
configuration path. Omitted or relative paths are usage errors with exit code
`2`. Relay does not auto-discover client configuration files, search home
directories, traverse repository ancestors, or infer vendor scope. Relay
records the normalized absolute path supplied by the caller in ownership
metadata. Read-only fragment generation remains available without a path.

## Relay Metadata

Relay metadata records client kind, configuration path, owned entry identifier,
application version, installed command and arguments, backup reference, and the
last successful setup timestamp. Metadata is written only after the associated
configuration mutation has been validated and atomically replaced.

## Idempotent Setup Algorithm

The later setup implementation follows this exact order:

1. resolve and validate the supported platform;
2. resolve Relay paths without creating files;
3. load Relay ownership metadata if present;
4. locate the selected client configuration;
5. parse the configuration without normalization that loses comments or order,
   unless the client format forces it;
6. classify the desired entry as absent, owned-match, owned-drift, or
   unowned-conflict;
7. compute a change plan;
8. return no-change without writes when the state is already correct;
9. create a backup before mutation;
10. write a temporary sibling and validate it;
11. atomically replace the original;
12. persist ownership metadata only after success;
13. print an exact redacted change report.

Repeating setup with the same desired state returns success with `changed: false`
and performs no writes.

## Backup and Atomic Write Contract

Every real mutation creates a sibling backup named
`<filename>.relay-backup-YYYYMMDDTHHMMSSZ`. The writer flushes and closes a
temporary sibling before atomically replacing the original where supported. It
parses and validates the post-write file before reporting success. If
replacement or validation fails, the backup remains, exit code `5` is returned,
and ownership metadata is unchanged.

## Codex Entry Contract

The native Codex target is TOML at the exact table `mcp_servers.relay`. The
installed values are `command = "relay"` and `args = ["mcp"]`:

```toml
[mcp_servers.relay]
command = "relay"
args = ["mcp"]
```

The before, after, and conflict examples are
[codex-before.toml](../../tests/fixtures/distribution/config-examples/codex-before.toml),
[codex-after.toml](../../tests/fixtures/distribution/config-examples/codex-after.toml), and
[codex-conflict.toml](../../tests/fixtures/distribution/config-examples/codex-conflict.toml). The adapter
preserves unrelated TOML keys and tables. An existing exact table is
`owned-match` only when metadata records the same absolute file path and owned
identifier `mcp_servers.relay`; otherwise it is an unowned conflict. A
metadata-owned table with changed command or arguments is `owned-drift` and may
be restored after backup. An absent table is `absent` and may be created after
backup. No `env` table is added by default.

## Claude Code Entry Contract

The native Claude Code target is JSON at the exact property `mcpServers.relay`.
The installed values are `"command": "relay"` and `"args": ["mcp"]`:

```json
{
  "mcpServers": {
    "relay": {
      "command": "relay",
      "args": ["mcp"]
    }
  }
}
```

The before, after, and conflict examples are
[claude-code-before.json](../../tests/fixtures/distribution/config-examples/claude-code-before.json),
[claude-code-after.json](../../tests/fixtures/distribution/config-examples/claude-code-after.json), and
[claude-code-conflict.json](../../tests/fixtures/distribution/config-examples/claude-code-conflict.json). The
adapter preserves every unrelated root property, MCP server, and nested
property. An existing exact object is `owned-match` only when metadata records
the same absolute file path and owned identifier `mcpServers.relay`; otherwise
it is an unowned conflict. A metadata-owned object with changed command or
arguments is `owned-drift` and may be restored after backup. An absent property
is `absent` and may be created after backup.

For both formats, existing `env` values are preserved but are not Relay-owned.
Relay never infers ownership from the command string alone.

Installed-package entries use `command = "relay"` / `"command": "relay"` with
arguments `mcp`. Existing source-checkout templates remain
`node <checkout>/dist/mcp/main.js` and are not mutated by this contract.

## Generic MCP Fragment Contract

For a generic client, setup prints a documented fragment by default. It does
not edit a generic configuration file without a client-specific parser,
ownership rule, backup strategy, and post-write validation.

## Conflict Handling

An unowned existing `relay` entry is not overwritten, even if its command is
different or happens to resemble Relay. Setup reports the conflict with exit
code `4`, leaves the file untouched, and does not write ownership metadata.

## Exact Change Reporting

Reports contain the affected file path, backup path when applicable, owned entry
identifier, and one operation: `created`, `updated`, `unchanged`, or `removed`.
No-change is a successful operation.

## Secret Redaction

Reports redact secrets and do not echo full prompts, full environment values,
or unrelated configuration content. Diagnostics identify the category and
remediation without exposing credentials.
