#!/bin/bash
# ============================================================
# IMC-BLD-007 | ImageCare ERP Build & Deployment v1.0
# File: scripts/pre-deploy-check.sh
# Purpose: Pre-deployment validation checklist.
#          Run this before every production deployment.
#          All checks must pass before proceeding.
# ============================================================

set -e

PASS=0
FAIL=0
WARN=0

green() { echo -e "\033[32m[PASS]\033[0m $1"; ((PASS++)); }
red()   { echo -e "\033[31m[FAIL]\033[0m $1"; ((FAIL++)); }
warn()  { echo -e "\033[33m[WARN]\033[0m $1"; ((WARN++)); }
info()  { echo -e "\033[36m[INFO]\033[0m $1"; }

echo ""
echo "=============================================="
echo "  ImageCare ERP Pre-Deployment Checklist"
echo "  $(date)"
echo "=============================================="
echo ""

# ---- Check 1: Environment file exists ----------------------
info "Checking environment configuration..."
if [ -f ".env.local" ] || [ -f ".env.production" ]; then
  green "Environment file present"
else
  red "No .env.local or .env.production file found"
fi

# ---- Check 2: Required env vars ----------------------------
info "Checking required environment variables..."
if [ -n "$VITE_SUPABASE_URL" ] && [ -n "$VITE_SUPABASE_ANON_KEY" ]; then
  green "Supabase environment variables set"
else
  warn "Supabase env vars not in shell environment - verify .env file has them"
fi

# ---- Check 3: Service role key not in frontend env ---------
info "Checking for accidentally exposed service_role key..."
if grep -r "service_role" .env* 2>/dev/null | grep -v "^#" | grep -q "VITE_"; then
  red "service_role key found in VITE_ env vars - this bypasses RLS and must be removed"
else
  green "No service_role key in frontend environment"
fi

# ---- Check 4: npm install is up to date --------------------
info "Checking node_modules..."
if [ -d "node_modules" ]; then
  green "node_modules present"
else
  red "node_modules missing - run npm install"
fi

# ---- Check 5: Tests pass -----------------------------------
info "Running test suite..."
if npx vitest run --reporter=verbose 2>&1 | tail -5 | grep -q "passed"; then
  green "All tests passing"
else
  red "Tests failing - do not deploy"
fi

# ---- Check 6: TypeScript compiles --------------------------
info "Running TypeScript check..."
if npx tsc --noEmit 2>&1; then
  green "TypeScript check passed"
else
  warn "TypeScript errors present - review before deploying"
fi

# ---- Check 7: Build succeeds -------------------------------
info "Building application..."
if npm run build 2>&1 | tail -3 | grep -qE "built|dist|kB"; then
  green "Build succeeded"
else
  red "Build failed - do not deploy"
fi

# ---- Check 8: .env.local not in git ------------------------
info "Checking .gitignore covers environment files..."
if git check-ignore -q .env.local 2>/dev/null; then
  green ".env.local is git-ignored"
else
  warn ".env.local may not be git-ignored - check .gitignore"
fi

# ---- Check 9: No console.log in production services --------
info "Checking for debug console.log in service files..."
CONSOLE_LOGS=$(grep -r "console\.log" src/services/ 2>/dev/null | grep -v ".test." | wc -l)
if [ "$CONSOLE_LOGS" -eq 0 ]; then
  green "No debug console.log in service files"
else
  warn "$CONSOLE_LOGS console.log statements in service files - consider removing"
fi

# ---- Check 10: Migration log is current --------------------
info "Checking migration log..."
if [ -f "database/migrations/MIGRATIONS.md" ]; then
  green "Migration log present"
else
  warn "Migration log not found at database/migrations/MIGRATIONS.md"
fi

# ---- Summary -----------------------------------------------
echo ""
echo "=============================================="
echo "  Summary: $PASS passed | $FAIL failed | $WARN warnings"
echo "=============================================="
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "DEPLOYMENT BLOCKED: $FAIL critical check(s) failed."
  echo "Resolve all failures before deploying to production."
  exit 1
elif [ "$WARN" -gt 0 ]; then
  echo "DEPLOYMENT ALLOWED WITH WARNINGS: Review $WARN warning(s) before proceeding."
  exit 0
else
  echo "ALL CHECKS PASSED. Safe to deploy."
  exit 0
fi
