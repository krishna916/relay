# Version Compatibility

This document derives from the [distribution decision](../decisions/0003-distribution-filesystem-and-lifecycle.md)
and the version-compatibility fixture.

## Application Version Source

The npm package version in `package.json` is the authoritative application
version. It applies to the CLI, MCP contracts, UI, database migrations, skills,
integration templates, and other package assets. Setup ownership metadata records
the application version that last wrote each owned integration entry.

## Independent Payload Schemas

MCP and CLI payload schema versions remain explicit and independently versioned
contract fields. Changing the application version does not automatically change
a payload schema version.

## Migration Compatibility

Database migrations are forward-only and are checked before the command service
serves requests. Migration state is stored in the migration table and compared
with the application-supported migration range. An unsupported newer migration
state fails closed rather than being ignored.

## Asset Consistency

Packaged CLI, MCP, UI, migration, skill, and integration assets are released as
one application version. Validation rejects divergent hard-coded versions.
Patch and minor upgrades preserve documented command and schema compatibility
unless a separate migration or contract decision says otherwise.

## Downgrade and Major-Version Boundary

Downgrade support is false once a newer application or migration version has
opened the database. The application fails closed with exit code `4` and gives
recovery guidance. No compatibility promise is made beyond the documented
current major; major-version policy is deferred until a breaking release is
proposed.
