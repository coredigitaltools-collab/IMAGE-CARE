# IMC-BLD-007 - ImageCare ERP Build & Deployment Guide

Complete reference for building, testing, deploying and maintaining ImageCare ERP.

---

## Build Stage Summary

| Stage | Scope | Acceptance Gate |
|---|---|---|
| 1. Foundation | Auth, permissions, UI shell | Users authenticate, context loads |
| 2. Database | Schema, migrations, RLS, triggers | fn_health_check 10/10 PASS |
| 3. Shared Engines | Business, Inventory, Accounting, Cash, Credit | Engine tests + accounting reconciliation |
| 4. Core Services | All service contracts (BLD-003) | Service contract tests pass |
| 5. Frontend Integration | 21 SRS modules connected | Critical E2E scenarios pass |
| 6. Offline Architecture | Sync, queue, conflicts | Offline workflow + duplicate prevention tests pass |
| 7. Reporting | KPIs, summaries, reconciliation | Reports reconcile with transactions |
| 8. Security Hardening | RLS, auth, storage, audit | Security test suite passes |
| 9. Backup & Recovery | Backups, PITR, restore validation | fn_recovery_validation() passes |
| 10. Production Release | Full deployment | All gates pass |

---

## Current Build Status

| Stage | Status |
|---|---|
| Stage 1: Foundation | Complete - BLD-001 deployed |
| Stage 2: Database | Complete - DB-001 through DB-008 deployed, 10/10 health check |
| Stage 3: Shared Engines | Complete - all engine procedures deployed |
| Stage 4: Core Services | Complete - BLD-003 service contracts deployed |
| Stage 5: Frontend Integration | Complete - BLD-004 hooks and context deployed |
| Stage 6: Offline Architecture | Implemented in BLD-001 through BLD-005 |
| Stage 7: Reporting | Complete - all reporting functions deployed |
| Stage 8: Security Hardening | 17/17 security tests passing |
| Stage 9: Backup & Recovery | DB-008 deployed, PITR to configure in Supabase |
| Stage 10: Production Release | Pending final QA sign-off |

---

## Daily Development Workflow

```bash
# 1. Start dev server
npm run dev

# 2. Run tests in watch mode during development
npx vitest

# 3. Before committing
npx vitest run
npx tsc --noEmit

# 4. Commit and push
# Use GitHub Desktop
```

---

## Deployment Pipeline

```
Developer commits to main
        |
        v
GitHub Actions CI
  - TypeScript check
  - Lint
  - Tests (114 tests)
  - Build
        |
        v
GitHub Pages deployment (preview)
        |
        v
Manual: Pre-deployment checklist
  scripts/pre-deploy-check.sh
        |
        v
Manual: Supabase SQL health check
  SELECT * FROM imagecare.fn_health_check();
        |
        v
Production deployment
        |
        v
Post-deployment health check
  scripts/post-deploy-health-check.sh
        |
        v
Smoke tests
  npx vitest run src/__tests__/smoke
```

---

## Pre-Deployment Checklist (Manual)

Run before every production deployment:

- [ ] All 114 automated tests passing (`npx vitest run`)
- [ ] TypeScript clean (`npx tsc --noEmit`)
- [ ] Build succeeds (`npm run build`)
- [ ] `.env.local` not committed to git
- [ ] No `service_role` key in frontend environment
- [ ] Supabase `fn_health_check()` returns 10/10 PASS
- [ ] Migration log is current
- [ ] Backup confirmed in Supabase dashboard

---

## Post-Deployment Smoke Tests

Run immediately after every deployment in Supabase SQL Editor:

```sql
-- Health check
SELECT * FROM imagecare.fn_health_check();

-- Performance report
SELECT * FROM imagecare.fn_performance_report();

-- Recovery validation
SELECT * FROM imagecare.fn_recovery_validation();

-- MV status
SELECT * FROM imagecare.vw_mv_refresh_status;
```

All should return PASS or healthy results before allowing users in.

---

## Rollback Procedure

### Application Rollback
1. In GitHub, go to Actions
2. Find the last successful deployment
3. Re-run that workflow to redeploy the previous build

### Database Rollback
Non-destructive changes (adding columns, indexes, functions):
```sql
-- Reverse the specific change
DROP INDEX IF EXISTS imagecare.idx_imc_new_index;
DROP FUNCTION IF EXISTS imagecare.fn_new_function();
```

Destructive changes - use Supabase PITR:
1. Go to Supabase Dashboard > Database > Backups
2. Select Point in Time Recovery
3. Choose timestamp before the problematic migration
4. After restore, run `fn_recovery_validation()`

---

## Release Versioning

Format: `MAJOR.MINOR.PATCH`

- **MAJOR** - Breaking changes to schema or service contracts
- **MINOR** - New features, new modules
- **PATCH** - Bug fixes, test additions, documentation

Current version: `1.0.0`

Tag releases in GitHub:
```bash
git tag -a v1.0.0 -m "Release 1.0.0 - Initial production release"
git push origin v1.0.0
```

---

## Environment Variables Reference

| Variable | Purpose | Where |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL | `.env.local` + GitHub Secrets |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key | `.env.local` + GitHub Secrets |
| `VITE_APP_VERSION` | App version for display | Optional - set in CI |

**Never add:**
- `VITE_SUPABASE_SERVICE_ROLE` - bypasses RLS, frontend only ever uses anon key

---

## Feature Completion Gate

A feature is complete only when ALL of the following are true:

- [ ] Database model implemented and migrated
- [ ] Service contract implemented (BLD-003 pattern)
- [ ] Permissions enforced at service level
- [ ] Business engine behavior correct
- [ ] Audit behavior implemented
- [ ] Online workflow passes
- [ ] Offline workflow passes (where supported)
- [ ] Reports and downstream effects reconcile
- [ ] Required QA tests pass

A screen that renders visually is NOT a complete feature.

---

## Change Management Rules

| Change Type | Required Actions |
|---|---|
| Shared engine change | Impact review + regression tests for all affected modules |
| Database schema change | Version-controlled migration + test environment first |
| Permission model change | Security test re-run |
| Sync/offline change | Offline regression tests + duplicate prevention tests |
| Reporting calculation change | KPI reconciliation against transaction data |
| Completed frontend module change | Explicit written approval required |

---

## GitHub Secrets Setup

Go to GitHub repository > Settings > Secrets and Variables > Actions:

Add these secrets:
- `VITE_SUPABASE_URL` - your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - your Supabase anon key

These are used by the CI pipeline to run builds and tests.

---

## Monitoring Checklist

After each release, monitor:

- Application errors in browser console
- Authentication failures
- API response latency
- Supabase database health (`vw_table_activity`)
- Sync queue health (`vw_sync_queue_health`)
- Backup status (`vw_backup_health`)
- Storage errors
- Unusual authorization failures in auth_audit_logs

---

*ImageCare ERP - IMC-BLD-007 v1.0*
