# Supported Platforms

This document derives from the [distribution decision](../decisions/0003-distribution-filesystem-and-lifecycle.md)
and the supported-platform fixture.

## Supported Claims

The initial public runtime matrix is limited to exactly three tuples:

| Platform                | Architecture | Runtime claim                                                    |
| ----------------------- | ------------ | ---------------------------------------------------------------- |
| Windows 10/11           | x64          | Supported                                                        |
| macOS 13+               | arm64        | Supported                                                        |
| Linux, glibc-compatible | x64          | Supported; evidence must include at least one Ubuntu LTS release |

Node.js 24 is required (`>=24 <25`). A successful run on one Linux
distribution does not justify compatibility with every Linux distribution.

## Unsupported Claims

Relay makes no release claim for Windows arm64, macOS x64, Linux arm64, or
Alpine/musl on any architecture. In particular, `better-sqlite3` compatibility
with musl is not claimed. These boundaries must not be broadened by a passing
developer-machine test.

## Evidence Required Before Release

For each supported tuple, a maintainer must retain evidence of:

- clean global install;
- native dependency load;
- setup dry-run or fixture validation;
- MCP stdio smoke test with protocol-clean stdout;
- UI smoke test bound to loopback.

The Linux evidence must identify the tested distribution and libc. Partial or
failed evidence blocks a release claim for that platform; it is not silently
carried forward from an older release.
