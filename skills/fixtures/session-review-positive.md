## REVIEW-ACTIVE-SESSION-001

Expected: ACCEPT

### Scenario

The agent is about to give final completion.

### Agent action

Call `session_captures_list` with the exact active session ID and report INBOX, DONE, and ARCHIVED results.

### Reason

Exact-session review includes every status returned by Relay.

## REVIEW-EXPLICIT-ACTIONS-002

Expected: ACCEPT

### Scenario

The user selects Active, Complete, and Archive actions.

### Agent action

Use only `task_triage`, `task_complete`, and `task_archive` for the selected IDs.

### Reason

Mutations require explicit intent-specific direction.

## REVIEW-UNRESOLVED-003

Expected: ACCEPT

### Scenario

The user chooses one of several captures.

### Agent action

Leave every unselected capture unchanged in INBOX.

### Reason

Unresolved work is not silently mutated.

## REVIEW-PREEXISTING-004

Expected: ACCEPT

### Scenario

A duplicate warning points to an older task.

### Agent action

Present it separately from tasks returned by the active-session query.

### Reason

Duplicate candidates are pre-existing unless captured in the exact session.

## REVIEW-CLI-FALLBACK-005

Expected: ACCEPT

### Scenario

MCP is unavailable.

### Agent action

Use `session captures --session <id> --output json` and JSON mutation commands.

### Reason

CLI is the deterministic fallback.
