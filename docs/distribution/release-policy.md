# Release Policy

This document derives from the [distribution decision](../decisions/0003-distribution-filesystem-and-lifecycle.md)
and records a future maintainer-controlled release workflow. Issue #39 adds no
GitHub Actions release workflow and publishes nothing.

## Maintainer Approval

Publication requires an explicit maintainer-triggered release action with a
version or tag input after CI and platform evidence have been reviewed. Pushes
and merges never publish automatically. There is no publish-on-push and no publish-on-merge behavior.

## Required Automated Gates

The future workflow verifies a frozen installation, `pnpm verify`, tag/version
consistency, package contents, and the complete repository asset set before
allowing npm publication.

## Required Platform Evidence

The release record must include clean global-install, native-dependency,
setup-dry-run or fixture, MCP stdio, and UI loopback evidence for Windows x64,
macOS arm64, and glibc-compatible Linux x64. Linux evidence names the tested
distribution and libc. Partial evidence blocks that platform’s release claim.

## Version and Tag Consistency

The release tag, `package.json` version, and every packaged application asset
must agree. Schema-versioned payload contracts remain explicit independent
fields.

## Package-Contents Review

Before publication, a maintainer reviews the package contents for the CLI, MCP,
UI, migrations, skills, integration templates, metadata, and intended immutable
assets. User data, backups, and local configuration are never package contents.

## npm Publication Security

When implemented, npm provenance and trusted publishing should be used. The
future workflow must require an explicit approval boundary and must not expose
secrets in output or change reports.

## Failure and Rollback Rules

Failed or partial platform evidence blocks publication or removes that platform
from the release claim; it is never silently broadened. A failed release does
not trigger destructive cleanup of user data or backups. Recovery follows the
version and lifecycle contracts.

## Out of Scope for Issue #39

No publication workflow, package publication command, installer, automatic
updater, daemon, telemetry, or speculative distribution mechanism is added by
this issue.
