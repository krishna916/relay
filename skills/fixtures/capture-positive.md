## CAPTURE-ACTIONABLE-001

Expected: ACCEPT

### Scenario

A missing regression test is discovered while implementing session expiry.

### Agent action

Use `task_find_similar`, capture a concise INBOX task with the active session ID, then continue the original work.

### Reason

The regression gap is concrete, actionable, and safely deferred.

## CAPTURE-DUPLICATE-002

Expected: ACCEPT

### Scenario

Relay returns a possible duplicate warning.

### Agent action

Keep the successful capture and record the warning as advisory without mutating the existing task.

### Reason

Duplicate candidates never silently suppress capture.

## CAPTURE-CLI-FALLBACK-003

Expected: ACCEPT

### Scenario

MCP is unavailable for a script.

### Agent action

Use `task find-similar --output json` and `task capture --output json` through the same CLI adapter.

### Reason

CLI JSON is the deterministic fallback.

## CAPTURE-CONTEXT-004

Expected: ACCEPT

### Scenario

A capture needs source context.

### Agent action

Store `session expiry integration tests` as the source context.

### Reason

The reference is concise and does not include code or transcripts.
