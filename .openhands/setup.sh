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
# POLICY: npm ci only — respects lockfile, reproducible, no arbitrary installs.
# Never use npm install in agent context. Never add packages without approval.
echo "[ 2/5 ] Install dependencies (npm ci — lockfile-enforced)"
cd "$ROOT/api"
npm ci --silent
echo "✓ npm ci complete"
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
echo "SUPERVISED-ONLY MODE:"
echo "  ❌ Do NOT push directly to main."
echo "  ❌ Do NOT deploy to Railway or any production environment."
echo "  ❌ Do NOT merge pull requests."
echo "  ❌ Do NOT print or echo Railway secrets."
echo "  ❌ Do NOT access SESSION_SECRET, ADMIN_PASSWORD, API_KEY, DATABASE_PATH."
echo "  ⚠  Max iterations: 10 | Max runtime: 30 min | Fail closed."
