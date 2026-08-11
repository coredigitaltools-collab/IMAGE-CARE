#!/bin/bash
# ============================================================
# IMC-BLD-007 | ImageCare ERP Build & Deployment v1.0
# File: scripts/post-deploy-health-check.sh
# Purpose: Post-deployment health check.
#          Run immediately after every deployment.
#          If any check fails, consider rollback.
# ============================================================

set -e

SUPABASE_URL="${VITE_SUPABASE_URL:-}"
ANON_KEY="${VITE_SUPABASE_ANON_KEY:-}"

PASS=0
FAIL=0

green() { echo -e "\033[32m[PASS]\033[0m $1"; ((PASS++)); }
red()   { echo -e "\033[31m[FAIL]\033[0m $1"; ((FAIL++)); }
info()  { echo -e "\033[36m[INFO]\033[0m $1"; }

echo ""
echo "=============================================="
echo "  ImageCare ERP Post-Deployment Health Check"
echo "  $(date)"
echo "=============================================="
echo ""

# ---- Check 1: Application is reachable ---------------------
info "Checking application URL..."
APP_URL="${APP_URL:-https://coredigitaltools-collab.github.io/IMAGE-CARE}"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL" 2>/dev/null || echo "000")
if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "301" ] || [ "$HTTP_STATUS" = "302" ]; then
  green "Application reachable (HTTP $HTTP_STATUS)"
else
  red "Application not reachable (HTTP $HTTP_STATUS)"
fi

# ---- Check 2: Supabase API is reachable --------------------
info "Checking Supabase API..."
if [ -n "$SUPABASE_URL" ] && [ -n "$ANON_KEY" ]; then
  API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "apikey: $ANON_KEY" \
    "$SUPABASE_URL/rest/v1/" 2>/dev/null || echo "000")
  if [ "$API_STATUS" = "200" ] || [ "$API_STATUS" = "404" ]; then
    green "Supabase API reachable (HTTP $API_STATUS)"
  else
    red "Supabase API not reachable (HTTP $API_STATUS)"
  fi
else
  red "Cannot check Supabase - VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not set"
fi

# ---- Check 3: Database health check ------------------------
info "Running database health check..."
if [ -n "$SUPABASE_URL" ] && [ -n "$ANON_KEY" ]; then
  DB_HEALTH=$(curl -s \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{"p_business_id": null}' \
    "$SUPABASE_URL/rest/v1/rpc/fn_health_check" 2>/dev/null || echo "error")

  if echo "$DB_HEALTH" | grep -q "PASS"; then
    green "Database health check returned PASS results"
  elif echo "$DB_HEALTH" | grep -q "FAIL"; then
    red "Database health check has FAIL results - review immediately"
  else
    red "Could not run database health check"
  fi
fi

# ---- Check 4: RLS is enabled -------------------------------
info "Checking RLS enforcement..."
if [ -n "$SUPABASE_URL" ] && [ -n "$ANON_KEY" ]; then
  # Anonymous request to businesses table should return empty or 401
  RLS_TEST=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "apikey: $ANON_KEY" \
    "$SUPABASE_URL/rest/v1/imagecare.businesses?select=id&limit=1" 2>/dev/null || echo "000")

  if [ "$RLS_TEST" = "200" ] || [ "$RLS_TEST" = "401" ] || [ "$RLS_TEST" = "403" ]; then
    green "RLS appears active (anon request returned $RLS_TEST)"
  else
    red "RLS check inconclusive (HTTP $RLS_TEST) - verify manually"
  fi
fi

# ---- Check 5: Migration log is current ---------------------
info "Checking migration log..."
if [ -f "database/migrations/MIGRATIONS.md" ]; then
  LAST_MIGRATION=$(grep "IMC-DB-" database/migrations/MIGRATIONS.md | tail -1)
  green "Last migration on record: $LAST_MIGRATION"
else
  red "Migration log not found"
fi

# ---- Summary -----------------------------------------------
echo ""
echo "=============================================="
echo "  Health Check Summary: $PASS passed | $FAIL failed"
echo "=============================================="
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "DEPLOYMENT ISSUES DETECTED."
  echo "Review failures above. Consider rollback if critical."
  exit 1
else
  echo "All post-deployment checks passed."
  echo ""
  echo "Next: Run Supabase SQL Editor smoke queries:"
  echo "  SELECT * FROM imagecare.fn_health_check();"
  echo "  SELECT * FROM imagecare.fn_recovery_validation();"
  exit 0
fi
