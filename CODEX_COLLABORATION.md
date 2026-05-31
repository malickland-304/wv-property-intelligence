# Codex Collaboration Guide

This file gives Codex (or any external assistant that cannot attach to the Cursor account) everything it needs to review and continue work that Cursor does in this repo.

## Repo

- **Local path:** `/Users/yhyh7/Projects/wv-property-intelligence`
- **Work happens here.** Cursor performs edits in this repo so Codex can inspect committed or uncommitted changes locally.

## How Codex gets context (no Cursor login required)

Codex cannot log into or attach to the Cursor account. Instead, hand it context through the repo:

1. **Paste Cursor output** directly into the Codex chat when needed.
2. **Share files** Cursor creates in the repo (or as attachments).
3. **Use the same GitHub repo/branch** so Codex can inspect Cursor's committed or uncommitted changes locally.
4. **Tracked plans/rules:** Cursor writes plans, rules, and decisions to tracked files (`.cursor/rules/`, `docs/`, or the root `*.md` docs) so Codex can read and use them.

## Handoff protocol (every time Cursor finishes a chunk of work)

Tell Codex:

- **Branch** Cursor worked on (e.g. output of `git branch --show-current`).
- **Files touched** (e.g. output of `git status` / `git diff --name-only`).
- **What changed and why** (point Codex at the relevant `*.md` doc or commit message).

### Quick commands to copy/paste to Codex

```bash
git branch --show-current        # current branch
git status                       # uncommitted changes
git diff --name-only             # changed file paths
git log --oneline -10            # recent commits
```

## Where to look for plans and state

- `PROJECT_STATE.md`, `TASKS.md`, `WORK_LOG.md` — current state, task list, history
- `ARCHITECTURE.md`, `DECISIONS.md` — design and decisions
- `.cursor/rules/` — Cursor rules (if present)
- `docs/` — additional documentation
