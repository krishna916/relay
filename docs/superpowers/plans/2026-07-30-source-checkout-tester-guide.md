# Source Checkout Tester Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one shareable guide that lets a first-time tester clone Relay, run it safely, connect an AI client, verify the MCP/session workflow, and remove the integration without deleting task data.

**Architecture:** Keep authoritative contracts in the existing MCP, CLI, session, skill, and vendor integration documents. Add a task-oriented happy-path guide that links to those references, then expose it prominently from the root README.

**Tech Stack:** Markdown, Node.js 24.x, pnpm 10.2.0, Relay MCP over stdio, SQLite, Codex, Claude Code

## Global Constraints

- Source checkout only; do not imply that a packaged `relay` command, installer, daemon, or marketplace distribution exists.
- Use the built MCP entry point `node ABSOLUTE_CHECKOUT/dist/mcp/main.js`.
- Recommend an isolated absolute `RELAY_DB_PATH` for testing.
- Preserve the existing database when disabling or removing client configuration.
- Do not duplicate full MCP, CLI, session, or skill contracts.
- State that Codex and Claude Code live smoke validation remains tester feedback rather than previously proven compatibility.

---

### Task 1: Add the tester-focused source-checkout guide

**Files:**
- Create: `docs/source-checkout-guide.md`

**Interfaces:**
- Consumes: `.nvmrc`, `package.json` scripts, `docs/agent-integration.md`, `docs/cli-reference.md`, `integrations/codex/*`, `integrations/claude-code/*`, and canonical skill directories.
- Produces: One end-to-end tester workflow and a feedback template.

- [ ] **Step 1: Write the guide**

Include prerequisites, clone/install/build, isolated database setup, UI startup, Codex and Claude Code configuration, skill installation, a five-step smoke test, CLI fallback, update/remove instructions, troubleshooting links, current limitations, and a feedback template.

- [ ] **Step 2: Validate commands and links against authoritative files**

Confirm Node 24.x, pnpm 10.2.0, `pnpm install --frozen-lockfile`, `pnpm build:node`, `pnpm dev:ui`, built MCP/CLI paths, the five MCP task tools, exact-session lookup, and vendor skill locations.

- [ ] **Step 3: Commit**

```bash
git add docs/source-checkout-guide.md
git commit -m "docs: add source-checkout tester guide"
```

### Task 2: Make the guide discoverable and verify documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: `docs/source-checkout-guide.md`.
- Produces: A prominent README entry point for external testers.

- [ ] **Step 1: Add the README link**

Add a short "Test Relay from source" callout near the top without duplicating the guide.

- [ ] **Step 2: Run repository verification**

Run:

```bash
pnpm verify
```

Expected: formatting, lint, type checking, tests, builds, repository-asset validation, and dependency audit pass without modifying tracked files.

- [ ] **Step 3: Review the final diff**

Check for broken relative links, placeholder checkout paths that are clearly identified, accidental packaged-command claims, unsafe database deletion advice, and duplicated contract text.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: link source-checkout tester guide"
```
