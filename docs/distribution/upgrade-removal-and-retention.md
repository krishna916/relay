# Upgrade, Removal, and Data Retention

This document derives from the [distribution decision](../decisions/0002-distribution-filesystem-and-lifecycle.md)
and the lifecycle fixture. It defines the later package and integration
lifecycle; issue #39 does not implement these operations.

## Upgrade

An upgrade retains the database and Relay metadata. Forward-only SQL migrations
run before commands are served, and immutable package assets are replaced by
the package manager. The application version covers CLI, MCP, UI, migrations,
skills, integrations, and package assets.

## Database Migration Failure

Migration failure aborts startup or the command. The original database remains
intact to the extent guaranteed by transactional migration boundaries, and the
failure is reported as a storage or conflict category as appropriate. A newer
migration state is never silently ignored.

## Downgrade

Downgrades are unsupported once a newer application or migration version has
opened the database. Relay fails closed with exit code `4` and advises
reinstalling the newer version or restoring a user-created backup.

## Disable

Disable removes or disables only the owned client entry. The package, database,
Relay metadata, and backups remain.

## Integration Removal

Integration removal removes only the exact owned entry after creating a fresh
sibling backup. The package and all user data remain. An unowned entry is not
removed.

## Package Uninstall

Normal package uninstall removes package-managed files only. A client
configuration may require prior integration removal. User data, Relay config,
cache, and backups remain; normal uninstall retains user data.

## Explicit Data Deletion

Destructive deletion is a separate future explicit action, never part of npm
uninstall or normal integration removal. It must name target paths and require
interactive confirmation or explicit non-interactive acknowledgement.

## Backup Retention

Backups are user data and are not automatically deleted by uninstall. A failed
configuration write preserves its backup for recovery.

## Recovery Guidance

For a migration or downgrade conflict, reinstall the newer application or
restore a user-created database backup. For a failed configuration write,
preserve the sibling backup, inspect the client file, and retry only after the
client-specific adapter can validate the desired state.

## Retention Matrix

| Action                 | Package files        | Client entry                  | Relay metadata                      | Database              | Cache                 | Backups                          |
| ---------------------- | -------------------- | ----------------------------- | ----------------------------------- | --------------------- | --------------------- | -------------------------------- |
| Upgrade                | replaced             | retained and versioned        | retained and updated after success  | retained              | retained              | retained                         |
| Disable                | retained             | removed/disabled if owned     | retained                            | retained              | retained              | retained                         |
| Integration removal    | retained             | removed if owned after backup | retained for remaining integrations | retained              | retained              | retained                         |
| Package uninstall      | removed              | may require prior removal     | retained                            | retained              | retained              | retained                         |
| Explicit data deletion | separately specified | separately specified          | separately specified                | explicitly named only | explicitly named only | retained unless explicitly named |
