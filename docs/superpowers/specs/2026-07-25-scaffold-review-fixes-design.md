# Scaffold Review Fixes Design

**Context**

Issue `#1` scaffold work is implemented, but the review identified four gaps against the spec:

1. runtime path resolution depends on `process.cwd()`
2. the HTTP server does not serve the built web shell
3. MCP stdio shutdown exits abruptly instead of closing resources
4. repository asset validation is too narrow for the required quality gate

**Goal**

Close those gaps without widening scope beyond issue `#1`. The result should keep the scaffold minimal while making the built entry points relocatable, the loopback HTTP process production-usable, the MCP process cleanly stoppable, and `pnpm verify` more representative of the implementation spec.

## Design

### Runtime path resolution

Add a shared runtime-path helper that derives the package root from the executing module location rather than `process.cwd()`. This keeps both source execution (`tsx`) and built execution (`dist/...`) working when launched from outside the repo root.

Use that helper in:

- package metadata loading
- default migrations directory resolution
- production web build directory resolution

### HTTP production integration

Keep `/api/health` as the application contract, then add minimal static serving for `dist/web` when present:

- `GET /` serves `dist/web/index.html`
- safe in-tree file paths under the web build directory are served directly
- unknown routes still return the stable JSON `404` shape
- missing web build does not block API startup

The implementation stays path-safe and loopback-only.

### Clean shutdown

Update the MCP stdio entry point to close the transport on `SIGINT`/`SIGTERM` before exiting. Shutdown should be idempotent and stderr-only. This matches current MCP SDK guidance for stdio serving and prevents future resource leaks once the process owns more state.

### Asset validation

Expand the validator so `pnpm verify` checks the scaffold more directly:

- required scaffold files and directories
- `package.json#bin.relay-mcp`
- built MCP entry existence after build
- JSON example/config parseability
- README local Markdown links
- unresolved placeholder markers
- forbidden issue-`#1` scope creep assets such as `SKILL.md` and agent/vendor integration files

## Testing

Add regression tests for:

- package metadata loading from a non-repo working directory
- built `relay-mcp` invocation from a non-repo working directory
- HTTP serving of built `index.html`
- validator failures for broken README links and placeholder content

Existing HTTP, MCP, and verify coverage remains in place.
