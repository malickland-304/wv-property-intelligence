#!/usr/bin/env bash
# .openhands/setup.sh — Agent bootstrap for wv-property-intelligence
# Run this before starting work in a new session.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== wv-property-intelligence agent setup ==="
echo ""

# ── 1. Orient ─────────────────────────────────────────────────────────
echo "[ 1/5 ] Repo state"
cd "$ROOT"
git status --short --branch --untracked-files
echo ""

# ── 2. Install API dependencies ────────────────────────────────────────
echo "[ 2/5 ] Install dependencies"
cd "$ROOT/api"
npm install --silent
echo "✓ npm install complete"
echo ""

# ── 3. Dependency audit ────────────────────────────────────────────────
echo "[ 3/5 ] Security audit"
npm audit || echo "⚠ Audit found issues — review before proceeding"
echo ""

# ── 4. Syntax check ───────────────────────────────────────────────────
echo "[ 4/5 ] Syntax check"
node --check server.js
node --check db.js
node --check middleware/auth.js
node --check middleware/csrf.js
node --check routes/api.js
node --check routes/public.js
node --check routes/admin.js
echo "✓ Syntax OK"
echo ""

# ── 5. Handoff doc ────────────────────────────────────────────────────
echo "[ 5/5 ] Current production state"
cd "$ROOT"
cat docs/agent-handoff.md
echo ""

echo "=== Setup complete. Read docs/agent-handoff.md before acting. ==="
echo ""
echo "Validation commands:"
echo "  bash scripts/preflight.sh          # full preflight gate"
echo "  cd api && npm audit                 # dependency audit"
echo "  node --check api/server.js         # syntax check"
echo ""
echo "Do NOT push directly to main."
echo "Do NOT deploy without explicit approval."
echo "Do NOT print Railway secrets."
