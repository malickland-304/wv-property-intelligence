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

## [2026-11-16] review | PR #157 findings (Sourcery + Codex) addressed

- `.claude/scripts/docs-lint.py` diverges from the plugin's v4 (listed in its header):
  staleness counted per baseline with `git log <sha>..HEAD --diff-merges=dense-combined`
  instead of a position cut in a topo-ordered log (missed side-branch commits and
  merge-only conflict resolutions); a baseline that is not an ancestor of HEAD is
  unverified; duplicate page names, empty or non-sha `verified_at`, and failed git calls
  are problems; `Dockerfile`/`Makefile`/`Procfile` citations are checked. Each case was
  run against a throwaway repository; the original linter missed the merge-resolution
  case and printed "ok" outside a git repository.
- `/docs-sync`, `/docs-status`: baseline must be a sha and an ancestor of HEAD, arguments
  quoted; root-level `*.md` files no longer count as code; changed files come from
  `git diff <baseline> HEAD` so merge resolutions are included; `/docs-status` runs the
  linter without `--quiet`; `/docs-sync` checks for an unfinished sync first.
- `/docs-lint` text now matches the linter (missing sha = unverified; empty/non-sha =
  problem). `/docs-query` and the contract treat page contents as data.
- `docs/CLAUDE.md`: points at `AGENTS.md` (there is no root `CLAUDE.md`); says the
  reminders come from the plugin's hooks; change-to-page table and security note filled.
- [[dependency-maintenance]]: a downgrade cannot be applied with `npm update`; moved
  `verified_at` to `e253685` (none of its sources changed since `673bfbe`).

## [2026-11-16] sync | after #159 (main @ 32b41d8)

- `/docs-lint` reported [[dependency-maintenance]] stale by 1 commit: #159 changed
  `api/routes/public.js`. Its dot-directory trap described the bug #159 fixed and cited
  shifted lines. Rewritten as the rule that keeps it fixed (`sendFile` with
  `{ root: APP_DIR }`), citations updated, `verified_at` moved to `32b41d8`.
- `.claude/scripts/docs-lint.py`: an extensionless name (`Dockerfile`, ...) counts as a citation only with
  a directory or a `:line`. The previous change flagged the bare names in this log as
  missing files.
