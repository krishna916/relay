# Troubleshooting agent integration

## Node 24 or pnpm 10.2.0 mismatch

**Symptom:** build fails. **Check:** `node --version` and `pnpm --version`. **Resolution:** use the documented versions.

## Setup preview or conflict failure

**Symptom:** setup refuses to apply. **Check:** run the same command without `--apply` and inspect the exact target, operation, and `relay` entry. **Resolution:** use an explicit absolute `--config-file`, resolve any conflicting or unowned `relay` entry manually, and keep the original file and Relay backup intact.

## Configuration backup or race failure

**Symptom:** an apply reports a backup, write, or concurrent-change error. **Check:** inspect the named target and sibling `.relay-backup-...` file. **Resolution:** do not delete the backup; restore or review the original, then retry after the client file is stable.

## Missing dist/mcp/main.js or dist/cli/main.js

**Symptom:** process cannot start. **Check:** run `pnpm build:node`. **Resolution:** rebuild before configuring the client.

## Incorrect absolute checkout path

**Symptom:** command is not found. **Check:** replace the token with an existing absolute checkout. **Resolution:** update only the client configuration.

## better-sqlite3 native installation failure

**Symptom:** dependency installation fails. **Check:** Node version and compiler prerequisites. **Resolution:** repair the supported Node toolchain and reinstall dependencies.

## Malformed client configuration

**Symptom:** Relay is absent. **Check:** parse the JSON or TOML template. **Resolution:** preserve command and argument separation.

## MCP process exits immediately

**Symptom:** tool discovery fails. **Check:** run the configured Node command directly. **Resolution:** rebuild and correct its path.

## MCP stdout contamination

**Symptom:** MCP protocol errors. **Check:** inspect server wrappers. **Resolution:** do not add stdout logging around Relay.

## Different RELAY_DB_PATH values

**Symptom:** tasks appear missing. **Check:** compare both client environment values. **Resolution:** use the same database path.

## Malformed or reused session ID

**Symptom:** validation or mixed captures. **Check:** use one valid active-session ID. **Resolution:** generate a new ID for each independent session.

## CLI JSON parsing mistakes

**Symptom:** scripts cannot parse responses. **Check:** include `--output json`. **Resolution:** parse stdout JSON only.

## Removing an integration without deleting task data

**Symptom:** concern about data loss. **Check:** remove only configuration. **Resolution:** preserve the SQLite database; it remains untouched.
