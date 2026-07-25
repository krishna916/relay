# Basic Local Todo Workflow Manual Verification

Use this guide to verify issue #10 against a disposable SQLite database. Do not read, write, reset, or delete the normal Relay database.

## Disposable setup

In PowerShell, create a new temporary location and start both development processes:

```powershell
$tempRelay = Join-Path ([System.IO.Path]::GetTempPath()) ("relay-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tempRelay | Out-Null
$env:RELAY_DB_PATH = Join-Path $tempRelay "relay.db"
pnpm dev:ui
```

Expected: the HTTP service reports `http://127.0.0.1:43110`, Vite reports `http://localhost:5173`, and the UI loads. Both services remain loopback-only. The fresh database automatically contains `_relay_migrations` entries for `0001` and `0002`, plus the `tasks` table; no manual schema command is required.

## Workflow checklist

1. Create a title-only task.
   Expected: it appears in Inbox with `HUMAN` provenance and empty optional fields.
2. Create a second task with description, priority, and workspace.
   Expected: all supplied fields appear in the task details.
3. Open the second task.
   Expected: the details show ID, status, description, priority, workspace, source context, creator, and created/updated/started/completed/archived timestamps.
4. Edit title, description, priority, workspace, and source context, then refresh the page.
   Expected: every edited field persists.
5. Clear description, priority, workspace, and source context one at a time, refreshing after each save.
   Expected: each nullable field remains cleared.
6. Move an Inbox task to Active, then start it.
   Expected: it appears in Active as In Progress and has a `startedAt` value.
7. Return that task to Active and start it again.
   Expected: the original `startedAt` value is preserved.
8. Move a task to Backlog and return it through a valid Inbox or Active path.
   Expected: each view reflects the persisted status.
9. Complete an Active or In Progress task.
   Expected: it leaves Active, appears in Completed, and has a `completedAt` value.
10. Edit the completed task.
    Expected: metadata editing succeeds; no reopen action is available.
11. Archive an open task using Archive followed by Confirm archive.
    Expected: it disappears from every normal view.
12. Archive a completed task using the same two-step action.
    Expected: it disappears from Completed while its completed and archived timestamps remain stored.
13. Look for archived work.
    Expected: no archive browser or restore action exists in this MVP.
14. Attempt to create or save a blank title and a title longer than 300 characters.
    Expected: the UI preserves input and displays useful validation feedback.
15. Trigger an invalid lifecycle action through HTTP or a controlled stale UI state (for example, start an Inbox task through `POST /api/tasks/:id/start`).
    Expected: HTTP returns a structured `409` error and the UI can recover by reloading the task view.

## Restart and cleanup

1. Stop both development processes cleanly.
   Expected: the HTTP and Vite processes exit without deleting the database.
2. In a new PowerShell session, set `RELAY_DB_PATH` to the same `$tempRelay\relay.db` path and run `pnpm dev:ui` again.
   Expected: all non-archived tasks, edits, statuses, and timestamps appear in their correct views after restart.
3. Confirm archived tasks are not in normal lists.
   Expected: archived rows remain in SQLite but are hidden from Inbox, Active, Backlog, and Completed.
4. Stop Relay, then remove only the disposable directory.

```powershell
Remove-Item -LiteralPath $tempRelay -Recurse
```

Expected: the disposable database and its SQLite WAL/SHM sidecars are removed. The default user database was not touched.

## Evidence record

Record the following in the implementation or PR summary:

| Item                                                            | Result |
| --------------------------------------------------------------- | ------ |
| Commands run                                                    |        |
| Fresh database strategy (without a personal path)               |        |
| Checklist steps executed                                        |        |
| Restart-persistence result                                      |        |
| Skipped steps and reason                                        |        |
| Confirmation that the default personal database was not touched |        |
