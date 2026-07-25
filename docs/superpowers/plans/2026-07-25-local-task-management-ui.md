# Local Task Management UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Relay's health-check shell with an accessible, desktop-oriented React task UI for capture, review, editing, lifecycle actions, and recent completions.

**Architecture:** Keep task HTTP/Zod parsing in a browser-only API layer, loading state in `useTaskView`, and UI concerns in focused components. `App` owns selected view, selected task, and the cross-component reconciliation rules; every mutation uses the server-returned DTO rather than optimistic status construction.

**Tech Stack:** React 19, TypeScript, Vite, Zod, browser `fetch`, Vitest, Testing Library, ordinary CSS.

## Global Constraints

- Access tasks only through the loopback HTTP API; never import backend/domain modules or SQLite code.
- Do not add Router, Redux, Zustand, TanStack Query, component/UI frameworks, Tailwind, drag-and-drop, icon packages, or generated clients.
- API views are `inbox`, `active`, `backlog`, and `completed`; completed requests use `limit=50`.
- Preserve server authority: render plausible actions only and surface/reconcile 409 conflicts.
- Keep the existing 80% coverage thresholds while covering authored `web/src` modules without snapshots for workflows.

---

## File Structure

- `web/src/api/task-contracts.ts`: Zod task, success, and error contracts plus inferred browser DTO/input types.
- `web/src/api/task-client.ts`: fetch wrapper, response validation, typed API error, and all task endpoints.
- `tests/unit/web/task-client.test.ts`: API boundary behaviour and request construction.
- `web/src/hooks/useTaskView.ts`: abortable, stale-safe list loading and local list reconciliation helpers.
- `web/src/components/*.tsx`: focused navigation, composer, list/row/badge, errors, and details/lifecycle editing controls.
- `web/src/App.tsx`: orchestration only; view/selection state and mutation reconciliation.
- `web/src/styles.css`: the single semantic desktop list-first layout stylesheet.
- `web/src/App.test.tsx`: behavioural UI tests using a mocked API module.
- `vitest.config.ts`: coverage include extended to authored UI modules.

### Task 1: Add browser task contracts and HTTP client

**Files:**

- Create: `web/src/api/task-contracts.ts`
- Create: `web/src/api/task-client.ts`
- Create: `tests/unit/web/task-client.test.ts`

**Interfaces:**

- Produces `TaskDto`, `TaskView`, `CreateTaskInput`, `EditTaskInput`, and `RelayApiError`.
- Produces `createTask`, `getTask`, `listTasks`, `editTask`, and one `POST` helper per lifecycle endpoint.

- [ ] **Step 1: Write the failing API-client tests**

Test a hand-authored `TaskDto` fixture for successful `{ task }` and `{ tasks }` parsing; malformed success/error payloads; 400/404/409/500 error messages and details; encoded IDs; each endpoint's method/path/body; and an `AbortError` rejected by `fetch`.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm.cmd test -- tests/unit/web/task-client.test.ts`

Expected: FAIL because the browser task contracts/client do not exist.

- [ ] **Step 3: Implement the minimal API boundary**

Use Zod schemas inferred into types. Body requests pass `{ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal }`; action/list/get requests omit the content type. Parse non-2xx `{ error }` into `RelayApiError`, use `INVALID_SERVER_RESPONSE` for malformed payloads, and rethrow aborts unchanged.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm.cmd test -- tests/unit/web/task-client.test.ts`

- [ ] **Step 5: Commit**

```bash
git add web/src/api/task-contracts.ts web/src/api/task-client.ts tests/unit/web/task-client.test.ts
git commit -m "Add browser task API client"
```

### Task 2: Establish the semantic UI shell and task-view loading hook

**Files:**

- Create: `web/src/components/ViewNavigation.tsx`
- Create: `web/src/components/ErrorBanner.tsx`
- Create: `web/src/hooks/useTaskView.ts`
- Create: `web/src/styles.css`
- Modify: `web/src/App.tsx`
- Modify: `web/src/main.tsx`
- Modify: `web/src/App.test.tsx`

**Interfaces:**

- `useTaskView(view)` returns `{ tasks, loading, error, reload, replaceTask, removeTask }`.
- `ViewNavigation` accepts the selected `TaskView` and view-change callback.

- [ ] **Step 1: Write failing tests for initial active loading, empty state, navigation, and retry**

Mock `task-client`. Assert initial Active navigation has `aria-current`, shows a loading message before a response, renders “No active work.” for an empty list, calls `listTasks('backlog')` on navigation, and offers retry after a list failure.

- [ ] **Step 2: Run the focused App test and verify it fails**

Run: `pnpm.cmd test -- web/src/App.test.tsx`

- [ ] **Step 3: Implement the shell and hook**

Render semantic `header`, `nav`, and `main`, retaining a compact health indicator/retry. In `useTaskView`, cancel the prior `AbortController`, retain displayed tasks while reloading, discard stale results, and ignore aborts. Import the one CSS file from `main.tsx`.

- [ ] **Step 4: Run the focused App test and verify it passes**

Run: `pnpm.cmd test -- web/src/App.test.tsx`

### Task 3: Implement task list, status display, and read-only detail selection

**Files:**

- Create: `web/src/components/TaskStatusBadge.tsx`
- Create: `web/src/components/TaskRow.tsx`
- Create: `web/src/components/TaskList.tsx`
- Create: `web/src/components/TaskDetailsPanel.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.test.tsx`

**Interfaces:**

- `TaskList` receives a view, `readonly TaskDto[]`, selected task ID, and `onSelect`.
- `TaskDetailsPanel` receives one selected `TaskDto | null`, task callbacks, and pending/error state.

- [ ] **Step 1: Write failing tests for representative rows and keyboard selection**

Verify title, explicit `ACTIVE`/`IN_PROGRESS` status text, optional priority/workspace, and updated time render. Select a row with its named button and keyboard Enter; assert all read-only provenance/lifecycle fields appear in the panel.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm.cmd test -- web/src/App.test.tsx`

- [ ] **Step 3: Implement list-first read mode**

Use buttons for row selection, concise local time formatting, exact per-view empty copy, a visible status badge, and a readable details section. Keep IDs/status/timestamps/provenance non-editable.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm.cmd test -- web/src/App.test.tsx`

### Task 4: Add quick task capture and authoritative create reconciliation

**Files:**

- Create: `web/src/components/TaskComposer.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.test.tsx`

**Interfaces:**

- `TaskComposer` submits `CreateTaskInput` and receives `pending`, error/details, and success notification callbacks.

- [ ] **Step 1: Write failing tests for create success, validation failure, and duplicate submission**

Assert title is labelled, required, and `maxLength=300`; successful creation clears fields, moves to Inbox, reloads, and selects the returned task. A `RelayApiError` with title details keeps values and displays field feedback. Verify the submit button disables while the promise remains pending.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm.cmd test -- web/src/App.test.tsx`

- [ ] **Step 3: Implement focused capture UI**

Always render title plus expandable description/priority/workspace fields; do not send creator/status/source context. Guard concurrent submit, use `aria-live="polite"` feedback, and focus the title after successful creation.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm.cmd test -- web/src/App.test.tsx`

### Task 5: Add metadata editing and app-owned dirty-discard confirmation

**Files:**

- Modify: `web/src/components/TaskDetailsPanel.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.test.tsx`

**Interfaces:**

- `onEdit(id, EditTaskInput): Promise<void>` supplies the complete server-returned task to view reconciliation.
- Details panel exposes `Edit task`, `Save changes`, `Cancel`, and discard-confirmation controls.

- [ ] **Step 1: Write failing tests for edit, nullable clearing, and dirty discard**

Open a task, explicitly enter edit mode, alter every editable field, clear nullable fields to `null`, save, and assert the returned DTO is shown. Change a field then close/select another task; assert an app-owned confirmation is shown and only discard proceeds when confirmed.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm.cmd test -- web/src/App.test.tsx`

- [ ] **Step 3: Implement normalized edit state**

Keep form state separate from the DTO, compare normalized empty inputs to nullable task values for dirty state, preserve input on error, disable save while pending, and restore exactly the last server representation on cancel. Allow editing `DONE` tasks.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm.cmd test -- web/src/App.test.tsx`

### Task 6: Add lifecycle actions, archive confirmation, and conflict reconciliation

**Files:**

- Modify: `web/src/components/TaskDetailsPanel.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.test.tsx`

**Interfaces:**

- `onAction(task, action)` calls the matching client function and reconciles only with its returned `TaskDto`.

- [ ] **Step 1: Write failing lifecycle tests**

For each status, assert exactly the allowed labels: INBOX activate/backlog/archive; ACTIVE inbox/start/backlog/complete/archive; IN_PROGRESS return-to-active/backlog/complete/archive; BACKLOG inbox/activate/archive; DONE archive only. Test removal/close when a result leaves the view, replacement when it remains, two-step archive cancel/confirm, and a 409 message followed by reload.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm.cmd test -- web/src/App.test.tsx`

- [ ] **Step 3: Implement lifecycle controls**

Map labels to client calls without recreating transition legality. Disable all mutation controls for the selected task while pending. Archive first switches to `Confirm archive`/`Cancel`, clears confirmation on view/selection change, and makes no request until confirmation. On 409, retain the server message and reload.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm.cmd test -- web/src/App.test.tsx`

### Task 7: Complete coverage configuration and quality verification

**Files:**

- Modify: `vitest.config.ts`
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Add focused accessibility and pending-state tests**

Cover service-unavailable retry, `aria-live` feedback, labelled inputs, current navigation, core keyboard interaction, stale request abortion, and disabled mutation controls.

- [ ] **Step 2: Extend coverage to authored UI modules**

Change coverage inclusion to `web/src/**/*.{ts,tsx}` and exclude `main.tsx`, `*.d.ts`, and type-only files while retaining the 80% thresholds.

- [ ] **Step 3: Run the required quality gate**

Run:

```bash
pnpm.cmd test -- tests/unit/web/task-client.test.ts web/src/App.test.tsx
pnpm.cmd typecheck
pnpm.cmd lint
pnpm.cmd build:web
pnpm.cmd verify
```

- [ ] **Step 4: Perform the manual keyboard smoke test**

Run `pnpm.cmd dev:ui`; create, select, edit, transition, and archive a task entirely with the keyboard against a temporary local database. Confirm no unsupported UI framework or lifecycle-rule duplication was introduced.

- [ ] **Step 5: Commit**

```bash
git add web/src tests/unit/web/task-client.test.ts vitest.config.ts
git commit -m "Build minimal local task management UI"
```
