# Agent Triage Protocol

This protocol exists to keep agents from using Phil as a copy/paste bridge between Claude, Codex, GitHub, and production systems.

## Rule

Agents must use durable shared state before asking Phil for status.

Durable state sources, in order:

1. `PROJECT_STATE.md` — resolved facts, closed gates, open gates.
2. GitHub PR state — checks, mergeability, review comments, head SHA, merged/closed state.
3. Live production checks — `https://malickland.net/api/health`, `/api/config`, and VPS checks when production state matters.
4. `WORK_LOG.md` — what an agent actually changed and verified.
5. Chat transcript or screenshot — only a claim until verified.

## Standard First Command

Run this before asking Phil to relay anything:

```bash
bash scripts/agent-triage.sh
```

The command is read-only. It prints:

- resolved facts,
- open gates,
- local git state,
- open GitHub PRs,
- live production health,
- the user-question rule.

## Closed-Gate Behavior

If a fact appears under `PROJECT_STATE.md` resolved facts or closed gates:

- do not ask Phil to reconfirm it,
- do not restate it as uncertain,
- do not block work on it,
- verify it directly only when live evidence may have changed.

Examples of closed gates at the time this protocol was added:

- 37 Advent sold for `$170,000`,
- close date `2026-05-29`,
- $299 broker admin fee approved and live,
- broker disclosure live,
- WV license `WV0029577` verified,
- Railway twin auto-deploy disabled and deployments removed.

## Open-Gate Behavior

Only ask Phil when the needed item appears as an open gate in `PROJECT_STATE.md`, or when a source requires human-owned authentication.

The question must name:

- the exact open gate,
- the owner,
- the missing field or approval,
- what evidence will close it.

Bad:

```text
Is the price right?
Are we ready?
What should I do next?
```

Good:

```text
Open gate: Funnel packet publish. Owner: Phil. Please log into Squarespace in Browser 1; after that I can inspect the existing site and pause before publishing anything public.
```

## Cross-Agent Handoff

Agents must not rely on human copy/paste when they can query the source directly.

Use this pattern:

```text
CLAIMED: <what another agent said>
VERIFIED: <GitHub/repo/live source checked in this run>
ACTION: <next step based on verified state>
BLOCKER: <only if a human-owned open gate remains>
```

## Squarespace Boundary

Squarespace login is a human-owned authentication gate. Agents may open the login page and wait, but they must not enter credentials or use SSO for Phil.

After Phil says `logged in`, agents may inspect the dashboard and must pause before:

- publishing a public `/start` page,
- uploading or exposing the PDF lead magnet,
- activating forms,
- enabling or sending welcome emails.

## Merge / Deploy Boundary

Merge and deploy are separate.

- A clean PR does not imply deploy.
- A merge does not imply deploy.
- Production deploy is manual to the Hostinger VPS unless a recorded decision changes that.
- Railway is not the production target.

Before saying a PR is ready, use the Codex Gatekeeper Protocol in `AGENTS.md`.
