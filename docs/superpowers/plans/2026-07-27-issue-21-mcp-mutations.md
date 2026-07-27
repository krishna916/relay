# Issue #21 MCP Mutation Tools — Implementation Plan

**Goal:** Add the five user-directed, intent-specific MCP mutation tools while reusing the shared runtime, MCP envelopes, error mapping, DTO mapping, and task application service established by issue #26.

**Architecture:** The MCP interface receives strict Zod-validated input, invokes exactly one focused `TaskApplication` operation, and returns the existing versioned MCP success envelope with a full task DTO and deterministic change metadata. The adapter never reads SQLite or accepts generic status/provenance/session/timestamp mutation.

## Files and responsibilities

- `src/interfaces/contracts/task-contract.ts`: define mutation-specific input and output contract shapes, including clear directives and detailed change metadata.
- `src/interfaces/mcp/schemas/mutation-tool-schemas.ts`: re-export mutation schemas and wrap result schemas in the standard MCP output envelope.
- `src/interfaces/mcp/mapping/change-metadata.ts`: compare pre/post tasks in a stable field order and produce edit/triage/lifecycle `NO_CHANGE` metadata.
- `src/interfaces/mcp/tools/task-{edit,triage,start,complete,archive}.ts`: one focused handler per intent.
- `src/interfaces/mcp/tools/register-mutation-tools.ts`: compose those five registrations.
- `src/interfaces/mcp/create-mcp-server.ts`: add mutation registration next to the #26 read/capture registrations.
- `src/interfaces/mcp/mapping/mcp-errors.ts`: distinguish domain transition and archived-task errors with the stable #19 MCP codes.
- `tests/unit/interfaces/mcp/create-mcp-server.test.ts`: prove discovery, strict schemas, outputs, no-ops, lifecycle/error behavior, and absence of generic mutation capabilities.
- `tests/integration/mcp-stdio.test.ts`: prove mutation works in the built stdio process while stdout remains protocol-clean.
- `docs/mcp-tools.md`: document explicit-user-direction precondition and every mutation contract.

## Execution sequence

1. Add strict-schema and pure metadata tests; run them red.
2. Add shared mutation schemas, deterministic metadata, and stable conflict/archive error mapping.
3. Implement edit and restricted triage with success, clear, no-op, and error tests.
4. Implement start, complete, and archive as separate focused handlers; prove generic mutation tools are absent.
5. Extend built stdio coverage, update documentation, then run all required checks including `pnpm verify`.

## Review checklist

- Every mutation calls one focused `TaskApplication` method; none touches SQLite.
- No input accepts `confirmed`, authorization prose, provenance, session, status outside triage's three targets, or timestamps.
- All no-ops return `NO_CHANGE` successfully with deterministic metadata.
- Existing read/capture tools remain registered and unchanged.
