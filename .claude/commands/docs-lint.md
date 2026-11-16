# /docs-lint -- integrity check for the docs wiki

Run the script for anything a script can decide.

```bash
python3 .claude/scripts/docs-lint.py --root .
```

Catches: broken `[[links]]`, orphan pages, broken sources (`code:` paths),
missing frontmatter, citations past end of file, unfinished checklists,
**stale**, **unverified**.

### stale and unverified are different

| | Meaning | What to do |
|---|---|---|
| **stale** | the code this page points at **changed** | `/docs-sync` |
| **unverified** | freshness **cannot be decided** | a human has to read it |

Four ways a page becomes unverified:

1. **No `code:` sources** -- nothing to compare against, so staleness is not computable.
   Legitimate for concept and history pages, which is why this never fails the run
2. **All `code:` sources have disappeared**
3. **The sha moved past N code commits with no body change** -- allowed by the schema,
   but `verified_at` is a declaration rather than proof, and this is the one place where
   "did you actually read it?" shows up. The larger N is, the more suspect

4. **The `verified_at` sha is not in the repository, or not an ancestor of HEAD** --
   usually a page verified on a branch that was squash- or rebase-merged, or a shallow
   clone. Re-check the page and move `verified_at` to a commit on this branch

An **empty** or **non-sha** `verified_at` (`invalid verified_at`) is a **problem** and
fails the run. So is a failed git call: an empty answer from git must never read as
"nothing changed".

## What the script cannot catch -- read and judge these yourself

1. **Contradictions between pages** -- the same fact stated differently
2. **Missing cross-references** -- two pages covering one concept without linking
3. **Duplicated prose** -- a lookup page and an exploratory page each carrying the same
   table. That breaks the single-source rule
4. **Prose that went stale without the code moving** -- `verified_at` is current but the
   text no longer matches reality. A script cannot see this

## Reporting

Summarise the findings and **ask the user before fixing.** Do not auto-fix.
If it is clean, say so and stop.
