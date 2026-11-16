# Work log

Append-only. Newest entries at the bottom.

---

## [2026-11-16] setup | docs/ wiki scaffolded

- Categories: concepts - architecture - subsystems - decisions - reference - operations - history
- Baseline commit: `673bfbe` (origin/main)
- Created: `docs/{CLAUDE,index,log}.md`, `raw/`, 4 `.claude/commands/docs-*`,
  and `.claude/scripts/docs-lint.py`

- Started in grow mode (`docs-mode: grow`). One page written from the code:
  `operations/dependency-maintenance.md`, covering `api/package.json`,
  `api/package-lock.json`, `api/Dockerfile`, `scripts/preflight.sh` and the parts of
  `api/routes/public.js` and `tests/http-smoke.test.js` hit during PR #156. No existing
  document was moved or split; the governance files at the top of `docs/` stay as they are.
- `.claude/commands/` could not be created from the shell in the agent sandbox; the four
  command files were generated in a scratch copy and placed with the file tool
  (byte-identical to the scaffold output).
- `release-commands: docker compose (build|up)`, the manual VPS deploy in `AGENTS.md`.
