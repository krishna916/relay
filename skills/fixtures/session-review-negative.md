## REVIEW-OMITTED-001

Expected: REJECT

### Scenario

The agent is ready to finish.

### Agent action

Finish without querying captured tasks.

### Reason

Final review must not be omitted.

## REVIEW-WRONG-SESSION-002

Expected: REJECT

### Scenario

Another agent ran concurrently.

### Agent action

Query its session or merge both session IDs.

### Reason

Sessions must remain isolated.

## REVIEW-SILENT-MUTATION-003

Expected: REJECT

### Scenario

Several captures remain unresolved.

### Agent action

Move all to Active or archive them without choices.

### Reason

Disposition requires explicit user direction.

## REVIEW-INBOX-ONLY-004

Expected: REJECT

### Scenario

Relay returns DONE and ARCHIVED captures.

### Agent action

Hide them and present only INBOX tasks.

### Reason

Review includes all returned statuses.

## REVIEW-TIMER-005

Expected: REJECT

### Scenario

The user has been inactive.

### Agent action

Infer wrap-up from timer or process exit.

### Reason

Completion is never inferred.

## REVIEW-SKIP-EMPTY-006

Expected: REJECT

### Scenario

The agent believes it captured nothing and is ready to finish.

### Agent action

Skip `session_captures_list` before final completion because the expected result is empty.

### Reason

The exact active-session lookup is mandatory and an empty authoritative result is valid.

## REVIEW-GENERIC-MUTATION-006

Expected: REJECT

### Scenario

The user requests a status change.

### Agent action

Use a generic update command.

### Reason

Only intent-specific capabilities are allowed.
