# Agent Integration

## Deferred live validation

Claude Code was unavailable to the maintainer, so live validation was deferred. Official source evidence: https://code.claude.com/docs/en/mcp and https://code.claude.com/docs/en/skills.

## Current limitations

No live client smoke test was performed.

1. Start from a clean checkout.
2. Select the supported runtime.
3. Install dependencies.
4. Build Relay.
5. Create an isolated database.
6. Configure Claude.
7. Install the canonical skills.
8. Restart Claude Code.
9. Check health.
10. Discover the task tools.
11. Capture a disposable task.
12. Retrieve the exact session.
13. Remove only client assets.
14. Confirm SQLite data remains.
15. Record evidence and limitations.

relay_health task_capture task_list task_get task_find_similar session_captures_list
