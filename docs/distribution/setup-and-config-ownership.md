# Setup and Configuration Ownership

This document derives from the [distribution decision](../decisions/0002-distribution-filesystem-and-lifecycle.md)
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

The abstract Codex fixture adds the exact entry:

```json
{
  "relay": {
    "command": "relay",
    "args": ["mcp"]
  }
}
```

The later adapter maps this abstract subtree to the then-current official
Codex configuration format and preserves unrelated content.

## Claude Code Entry Contract

Claude Code receives the same owned entry name, command, and arguments. The
later adapter maps the abstract fixture to the then-current official Claude
Code configuration format and preserves unrelated content.

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
