# Filesystem Contract

This document derives from the [distribution decision](../decisions/0003-distribution-filesystem-and-lifecycle.md)
and the path-resolution fixture. It defines the future resolver’s contract;
issue #39 does not change the current production resolver.

## Mutable User Paths

All mutable paths are per-user and independent of the current working
directory, repository root, executable directory, and package installation
directory. The default path variables are intentionally shown without a real
username:

| Purpose     | Windows                         | macOS                                                    | Linux                                             |
| ----------- | ------------------------------- | -------------------------------------------------------- | ------------------------------------------------- |
| data root   | `%LOCALAPPDATA%\Relay`          | `~/Library/Application Support/Relay`                    | `${XDG_DATA_HOME:-~/.local/share}/relay`          |
| database    | `%LOCALAPPDATA%\Relay\relay.db` | `~/Library/Application Support/Relay/relay.db`           | `${XDG_DATA_HOME:-~/.local/share}/relay/relay.db` |
| config root | `%APPDATA%\Relay`               | `~/Library/Application Support/Relay/config`             | `${XDG_CONFIG_HOME:-~/.config}/relay`             |
| metadata    | `%APPDATA%\Relay\config.json`   | `~/Library/Application Support/Relay/config/config.json` | `${XDG_CONFIG_HOME:-~/.config}/relay/config.json` |
| cache root  | `%LOCALAPPDATA%\Relay\Cache`    | `~/Library/Caches/Relay`                                 | `${XDG_CACHE_HOME:-~/.cache}/relay`               |

Diagnostic logs are disabled by default. If explicitly enabled, they live at
`<cache-root>\logs` on Windows and `<cache-root>/logs` on macOS and Linux.

## Database Precedence

The resolver applies these sources from highest to lowest precedence:

1. an explicit in-process path supplied through test or internal dependency
   injection;
2. a non-empty `RELAY_DB_PATH`;
3. the platform default database path.

`RELAY_DB_PATH` is the only database environment override in the MVP. An empty
or whitespace-only value is a validation error. A relative override is rejected
for installed/public operation; tests may supply explicit absolute temporary
paths. There is no general `RELAY_HOME` override.

## Environment Fallbacks

Windows uses `%LOCALAPPDATA%` for data and cache and `%APPDATA%` for Relay
configuration. macOS uses the application-support and cache conventions shown
above. Linux uses `XDG_DATA_HOME`, `XDG_CONFIG_HOME`, and `XDG_CACHE_HOME` when
set, falling back to `.local/share`, `.config`, and `.cache` beneath the user
home. These variables describe roots, not arbitrary database relocation.

## Worked Resolution Examples

For a username-neutral Windows account, the database is
`%LOCALAPPDATA%\Relay\relay.db`. For macOS it is
`~/Library/Application Support/Relay/relay.db`. For Linux it is
`${XDG_DATA_HOME:-~/.local/share}/relay/relay.db`. Supplying an absolute
`RELAY_DB_PATH` replaces only the database location and does not relocate the
config, cache, or logs.

## Mutable Data Versus Immutable Assets

The database, metadata, client configuration, backups, cache, and optional logs
are mutable user paths. Immutable package assets are resolved relative to the
installed module with `import.meta.url` and `fileURLToPath`; they never resolve
from `cwd`. The future shared resolver must not create directories while merely
computing paths.
