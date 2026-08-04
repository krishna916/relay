# Safe setup and agent configuration

After installation, run [`relay doctor`](doctor.md) from an arbitrary working
directory to inspect runtime, assets, paths, database state, owned client
entries, and isolated MCP/UI startup. Doctor never mutates the configured
database or client files; see the human verification matrix in that guide.

`relay setup` initializes Relay's data and configuration roots and opens the canonical database runtime so forward migrations run. It never replaces, resets, or deletes an existing database. Re-running it is safe.

Mutable client setup is preview-first: it mutates only when `--apply` is supplied.

```text
relay setup --client codex --config-file <absolute-path>
relay setup --client codex --config-file <absolute-path> --apply
relay setup --client claude-code --config-file <absolute-path> [--apply]
relay setup --client generic-mcp
```

Codex and Claude Code require an explicit absolute configuration path. Relay never scans home directories or infers a client file. Generic MCP produces a reviewed snippet only.

Before applying, inspect the target, operation, entry identifier, and snippet. Relay proves ownership using the exact `relay` entry, the `relay` command, `['mcp']` arguments, client, and normalized path. Unknown or conflicting entries fail closed. A changed client file receives a collision-safe sibling backup and a validated atomic replacement; Relay ownership metadata is updated only after the replacement is reparsed successfully.

Use `relay config paths` to inspect effective paths. Before destructive configuration actions, run `relay config integrations` to inspect Relay-owned records. `relay config disable` removes an exact owned entry while retaining disabled ownership; setup can safely re-enable it. `relay config remove` removes only the exact owned entry and ownership record. Both commands require `--apply`. These operations retain the database, tasks, backups, and unrelated configuration.

The complete inspection and mutation surface is:

```text
relay config paths
relay config paths --output json
relay config integrations
relay config integrations --output json
relay config snippet --client codex
relay config snippet --client claude-code
relay config snippet --client generic-mcp
relay config disable --client codex --config-file <absolute-path> --apply
relay config remove --client codex --config-file <absolute-path> --apply
```

The client configuration path is always explicit and absolute. Setup is preview-first and mutates only when `--apply` is supplied. `relay config disable` and `relay config remove` always require `--apply`; omitting it is a usage error with exit code 2, not a preview. Generic MCP is snippet-only and has no mutation mode.

For the human safety gate, use this checklist with a disposable absolute path and an isolated `RELAY_DB_PATH`:

1. Copy a real Codex or Claude Code configuration to a disposable file; never start with the only live configuration copy.
2. Run the setup preview and record the reported operation and exact snippet.
3. Apply the setup and verify the configured entry is exact.
4. Compare unrelated configuration bytes before and after.
5. Compare the backup with the original bytes.
6. Rerun setup and verify it reports unchanged and creates no new backup.
7. Disable the owned entry and verify unrelated content remains.
8. Re-enable it with setup and verify the entry returns.
9. Remove it and verify the ownership record is gone while the database remains.
10. Query a task created before setup and confirm it still exists.
