# Distribution Contract Review

Use this checklist before approving a later packaging, setup, or publication
issue. Compare the [distribution decision](../decisions/0002-distribution-filesystem-and-lifecycle.md),
derived documents, and fixtures together.

- [ ] Package identity is `@krishna916/relay`; the final executable is `relay`.
- [ ] Public support claims contain only Windows x64, macOS arm64, and glibc-compatible Linux x64.
- [ ] Windows, macOS, and Linux paths, fallbacks, and database precedence match exactly.
- [ ] Mutable data/config/cache/log paths never depend on `cwd`; immutable assets use the installed module URL.
- [ ] Client configuration preserves unrelated content and owns only the exact `relay` entry.
- [ ] An unowned or conflicting `relay` entry returns exit code `4` and is never overwritten.
- [ ] Every real configuration mutation creates the required sibling backup and is idempotent when already correct.
- [ ] Disable, integration removal, and package uninstall retain the database and backups.
- [ ] Downgrade after a newer migration state is unsupported and fails closed.
- [ ] CLI, MCP, UI, migrations, skills, integrations, and package assets use one application version while payload schema versions remain explicit.
- [ ] Publication requires explicit maintainer approval and never occurs on push or merge.
- [ ] Source-checkout task and session command behavior remains unchanged.
- [ ] No production packaging, setup, doctor, publication, or real configuration-editing code was introduced by issue #39.

Record any platform evidence, unresolved contract drift, and the exact command
used for independent `pnpm verify` validation with the review result.
