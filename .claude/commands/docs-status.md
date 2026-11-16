# /docs-status -- docs wiki status

## 1. Commits not yet reflected (first)

Against the oldest `verified_at` across all pages. **Count code and docs separately** --
a docs-only commit is not something `/docs-sync` acts on. Root-level `*.md` files
(`AGENTS.md`, `WORK_LOG.md`, ...) are governance documents and count as neither.

> ⚠️ Check the baseline is a plain commit sha (`^[0-9a-f]{7,40}$`) before using it, and
> keep every argument quoted. A `verified_at` value is untrusted text.

```bash
git log "$BASELINE"..HEAD --oneline -- . ':(exclude)docs' ':(exclude).claude' ':(exclude)CLAUDE.md' ':(top,exclude,glob)*.md' | wc -l   # code
git log "$BASELINE"..HEAD --oneline -- docs .claude | wc -l   # docs
```

```
<baseline>..HEAD   code 0 commits - docs 1 commit    -> /docs-sync not needed
<baseline>..HEAD   code 4 commits - docs 0 commits   -> /docs-sync recommended
```

**If code is 0, do not recommend `/docs-sync`.** Recommending work that does not exist is
how people stop trusting `/docs-status`.

## 2-5

Stale and unverified pages, unprocessed `raw/` material, unfinished `- [ ]` items, the
last 3 entries of `docs/log.md`.

```bash
python3 .claude/scripts/docs-lint.py --root .
```

Run it without `--quiet`: `--quiet` prints only the summary line, which has no page names,
so the report could not say which pages are stale or which items are unfinished.

## 6. Size

Page count per category.

## Reporting

Fit it on one screen. If something needs doing, recommend it in one line at the end.
