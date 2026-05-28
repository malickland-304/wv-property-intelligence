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
# POLICY: fail closed on high/critical severity. Moderate/low = block + require human review.
echo "[ 3/5 ] Security audit"
AUDIT_EXIT=0
npm audit --audit-level=high 2>&1 || AUDIT_EXIT=$?
if [[ $AUDIT_EXIT -ne 0 ]]; then
  echo ""
  echo "❌ FATAL: npm audit found HIGH or CRITICAL vulnerabilities."
  echo "   Do NOT proceed. Report to human orchestrator before any PR."
  exit 1
fi
# Run full audit for informational output (moderate/low won't exit-fail here)
npm audit 2>&1 || echo "⚠  Moderate/low audit warnings present — human review required before merge."
echo "✓ Audit passed (no high/critical)"
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

# ── 5. Governance authority ───────────────────────────────────────────
echo "[ 5/5 ] Governance authority document"
cd "$ROOT"
cat AGENTS.md
echo ""
echo "  NOTE: docs/agent-handoff.md is a deployment-state reference only."
echo "        It does not override AGENTS.md. If they conflict, follow AGENTS.md."
echo ""

echo "=== Setup complete. AGENTS.md is the authority — read it before acting. ==="
echo ""
echo "Validation commands (run in order before any PR):"
echo "  cd api && npm ci                          # install dependencies (lockfile-enforced)"
echo "  node --check server.js                    # syntax check"
echo "  node --check middleware/auth.js           # syntax check"
echo "  node --check routes/admin.js              # syntax check"
echo "  node --check routes/api.js                # syntax check"
echo "  node --check routes/public.js             # syntax check"
echo "  cd ..                                     # back to project root"
echo "  node tests/verify-security-fixes.test.js  # security test suite"
echo "  bash scripts/preflight.sh                 # full preflight gate"
echo ""
echo "SUPERVISED-ONLY MODE:"
echo "  ❌ Do NOT push directly to main."
echo "  ❌ Do NOT deploy to Railway or any production environment."
echo "  ❌ Do NOT merge pull requests."
echo "  ❌ Do NOT print or echo Railway secrets."
echo "  ❌ Do NOT access SESSION_SECRET, ADMIN_PASSWORD, API_KEY, DATABASE_PATH."
echo "  ⚠  Max iterations: 10 | Max runtime: 30 min | Fail closed."
