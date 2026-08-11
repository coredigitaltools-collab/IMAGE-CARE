# IMC-BLD-006 - QA Checklist and Release Gates

Complete testing checklist for ImageCare ERP production release.
All Critical and High items must pass before release.

---

## Test Run Commands

```bash
# All tests
npx vitest run

# With coverage
npx vitest run --coverage

# Unit tests only
npx vitest run src/__tests__/unit

# Service tests only
npx vitest run src/__tests__/services

# Integration tests
npx vitest run src/__tests__/integration

# E2E critical scenarios
npx vitest run src/__tests__/e2e

# Security tests
npx vitest run src/__tests__/security

# Watch mode (development)
npx vitest
```

---

## Release Gates (must ALL pass)

### Gate 1 - Automated Tests
- [ ] All unit tests pass
- [ ] All service contract tests pass
- [ ] All integration tests pass
- [ ] All critical scenario tests pass
- [ ] All security tests pass
- [ ] Coverage thresholds met (80% functions, 75% branches)

### Gate 2 - Accounting Integrity
Run `SELECT * FROM imagecare.fn_health_check();` on Supabase:
- [ ] All 10 checks return PASS
- [ ] Journal balance check: PASS
- [ ] No negative stock: PASS

Run `SELECT * FROM imagecare.fn_recovery_validation();`:
- [ ] journal_balance: PASS
- [ ] orphaned_movements: PASS
- [ ] negative_balances: PASS
- [ ] sale_items_integrity: PASS

### Gate 3 - Permission Testing
- [ ] User with no permissions sees no data
- [ ] User with view-only cannot create
- [ ] User with create cannot approve payroll
- [ ] User with create cannot adjust stock
- [ ] Direct API call without token returns 401
- [ ] Cross-business UUID access returns empty (RLS)

### Gate 4 - Critical Scenario Manual Verification
- [ ] Cash sale: inventory decreased, cash increased, KPIs updated
- [ ] Credit sale: receivable created, cash unchanged, KPIs updated
- [ ] Credit repayment: receivable decreased, cash increased
- [ ] Purchase: inventory increased, payable created or cash decreased
- [ ] Expense: cash decreased, net profit decreased
- [ ] Payroll: net pay deducted from cash, PAYE and NSSF recorded separately

### Gate 5 - Offline Testing
- [ ] Sale recorded offline and queued
- [ ] Queue survives app restart
- [ ] Reconnect syncs pending operations
- [ ] Duplicate key prevents re-processing
- [ ] Conflict is isolated, not silently overwritten

### Gate 6 - Backup Readiness
- [ ] Supabase PITR enabled
- [ ] `fn_recovery_validation()` passes on restored data
- [ ] Backup event logged in `imagecare.backup_events`

---

## Manual QA Test Matrix

### Authentication Tests (Section 6)
| Test | Expected | Pass |
|---|---|---|
| Valid login | Session created, permissions loaded | |
| Invalid credentials | Error message, no session | |
| Expired session | Redirect to login | |
| Suspended user | Login rejected with message | |
| Logout | Session cleared, redirected | |

### Sales Tests (Section 9)
| Test | Expected | Pass |
|---|---|---|
| Single item cash sale | Sale confirmed, stock decreased | |
| Multi-item sale | All items posted, totals correct | |
| Credit sale | Receivable created, cash unchanged | |
| Insufficient stock | Rejected with clear message | |
| Duplicate submission | Idempotency prevents double posting | |
| Cancel confirmed sale | Inventory reversed, journal reversed | |

### Inventory Tests (Section 11)
| Test | Expected | Pass |
|---|---|---|
| Purchase increases stock | Movement recorded, view updated | |
| Sale decreases stock | Movement recorded, view updated | |
| Manual adjustment (in) | Requires approve permission | |
| Transfer between branches | Dispatch removes, receive adds | |
| Insufficient stock sale | Rejected before posting | |
| Direct stock edit attempt | Rejected - movements only | |

### Accounting Tests (Section 20)
| Test | Expected | Pass |
|---|---|---|
| Every journal entry balanced | DR = CR | |
| Post sale | Dr Cash / Cr Revenue + COGS | |
| Post purchase | Dr Inventory / Cr Payable | |
| Post expense | Dr Expense / Cr Cash | |
| Post payroll | Dr Salary / Cr Cash + PAYE + NSSF | |
| Edit posted journal | Rejected by tg_imc_guard_posted_journal | |

### Security Tests (Section 24)
| Test | Expected | Pass |
|---|---|---|
| Access other business UUID | Empty result (RLS) | |
| API request without token | 401 Unauthorized | |
| File access without permission | 403 Forbidden | |
| Bypass permission via direct RPC | Permission check in procedure | |

---

## Defect Severity Reference (Section 30)

| Severity | Definition | Action |
|---|---|---|
| Critical | Financial corruption, duplicate transactions, security breach, data loss | Block release immediately |
| High | Module failure, incorrect accounting, incorrect inventory, sync failure | Must fix before release |
| Medium | Workflow issue with workaround | Fix before release or document |
| Low | Cosmetic or minor usability | Fix in next release |

---

## Known Limitations (document before release)

List any limitations that are accepted and documented here:

1. (None currently documented - update before release)

---

*ImageCare ERP - IMC-BLD-006 v1.0*
