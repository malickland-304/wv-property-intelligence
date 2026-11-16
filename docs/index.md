# MalickLand (wv-property-intelligence) -- documentation

Production website and admin API for MalickLand (WV land and real estate): Express 5 +
SQLite in `api/`, vanilla HTML/JS in `app/`, deployed by hand to a Hostinger VPS.

This wiki grows as work happens (see `docs-mode` in [`CLAUDE.md`](CLAUDE.md)). The
governance documents (`AGENTS.md`, `PROJECT_STATE.md`, `DECISIONS.md`, and
`docs/CANONICAL_MAP.md`, `docs/agent-handoff.md` and the other files at the top of
`docs/`) are not wiki pages and are not covered by `/docs-sync`. They outrank this wiki.

This directory is a wiki maintained by an LLM: linked markdown pages, nothing outside the
repository. The rules are in [`CLAUDE.md`](CLAUDE.md).

## Start here

- New here: read `AGENTS.md`, then `PROJECT_STATE.md`, then come back to this page.
- To clear `npm audit` advisories in `api/`: [[dependency-maintenance]].

---

## concepts

(none yet)

## architecture

(none yet)

## subsystems

(none yet)

## decisions

(none yet)

## reference

(none yet)

## operations

- [[dependency-maintenance]] -- clearing `npm audit` advisories in `api/` within the existing ranges, and running the checks on a Mac / in the agent sandbox

## history

(none yet)

---

## Using this wiki

```
/docs-sync     right after a deploy or release -- reads only what changed since verified_at
/docs-lint     integrity check (orphans, broken links, broken sources, stale, unverified)
/docs-query    ask the docs. If it is not there, the answer says so
/docs-status   commits not yet reflected, stale pages, recent work
```

Every page carries `verified_at`, the commit it was checked against. Change code, run
`/docs-sync`.
