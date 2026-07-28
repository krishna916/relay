## CAPTURE-SPECULATION-001

Expected: REJECT

### Scenario

The agent has a possible future enhancement idea.

### Agent action

Capture every thought as a Relay task.

### Reason

Speculation is not concrete follow-up work.

## CAPTURE-SENSITIVE-002

Expected: REJECT

### Scenario

A diagnostic includes a credential and a large stack trace.

### Agent action

Attach the prompt, source file, credential, and stack trace as source context.

### Reason

Sensitive and oversized context is forbidden.

## CAPTURE-MUTATION-003

Expected: REJECT

### Scenario

A possible duplicate exists.

### Agent action

Silently complete or archive the existing task.

### Reason

Autonomous existing-task mutation is forbidden.

## CAPTURE-TRIAGE-004

Expected: REJECT

### Scenario

An autonomous capture succeeds.

### Agent action

Move it from INBOX to ACTIVE.

### Reason

Autonomous captures cannot leave INBOX.

## CAPTURE-SESSION-005

Expected: REJECT

### Scenario

Two unrelated concurrent sessions run in one workspace.

### Agent action

Reuse one session ID for both.

### Reason

Concurrent sessions must remain isolated.

## CAPTURE-ADAPTER-006

Expected: REJECT

### Scenario

MCP is available throughout capture.

### Agent action

Use MCP for lookup and CLI for capture without a failure or explicit reason.

### Reason

One workflow retains one adapter.
