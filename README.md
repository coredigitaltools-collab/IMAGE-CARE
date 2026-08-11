# IMC-BLD-006 - ImageCare ERP Testing & QA Specification v1.0

Complete quality assurance layer for ImageCare ERP.
Tests business correctness, not just visual behavior.

---

## Files

| File | Purpose |
|---|---|
| `vitest.config.ts` | Test runner configuration with coverage thresholds |
| `src/__tests__/setup.ts` | Global mocks, test data factories |
| `src/__tests__/unit/formatters.test.ts` | Currency, date, status formatting + validation rules |
| `src/__tests__/unit/permissions.test.ts` | Permission helpers, canDo, error parsing |
| `src/__tests__/services/salesService.test.ts` | Service contract tests, permission enforcement |
| `src/__tests__/integration/businessRules.test.ts` | Business rule enforcement across services |
| `src/__tests__/e2e/criticalScenarios.test.ts` | 7 critical end-to-end financial scenarios |
| `src/__tests__/security/securityTests.test.ts` | RLS isolation, permission bypass, data exposure |
| `docs/QA_CHECKLIST.md` | Release gates and manual QA matrix |

---

## Test Data Factories

```typescript
import { makeUserContext, makeNoPermissionContext, TEST_BUSINESS_ID, TEST_BRANCH_ID } from './__tests__/setup';

// Full permissions owner
const ownerCtx = makeUserContext();

// No permissions user
const restrictedCtx = makeNoPermissionContext();

// Custom permissions
const cashierCtx = makeUserContext({
  permissions: {
    sales: { view: true, create: true, edit: false, delete: false, approve: false, export: false, sync: false, branch_scope: 'assigned' },
  }
});
```

---

## Integration

Copy into `C:\GITHUB\IMAGE-CARE`:

```
vitest.config.ts                                  → vitest.config.ts
src/__tests__/setup.ts                            → src/__tests__/setup.ts
src/__tests__/unit/                               → src/__tests__/unit/
src/__tests__/services/                           → src/__tests__/services/
src/__tests__/integration/                        → src/__tests__/integration/
src/__tests__/e2e/                                → src/__tests__/e2e/
src/__tests__/security/                           → src/__tests__/security/
docs/QA_CHECKLIST.md                             → docs/QA_CHECKLIST.md
```

Then install test dependencies:

```
npm install -D vitest @vitest/coverage-v8 @testing-library/jest-dom @testing-library/react jsdom
```

Run tests:
```
npx vitest run
```

---

*ImageCare ERP - IMC-BLD-006 v1.0*
