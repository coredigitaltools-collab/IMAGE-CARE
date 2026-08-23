# ImageCare ERP — Authentication & Daily PIN System — Final Report

## 1. Authentication changes made

- `signIn()` no longer takes a Business ID. `login()` in `authService.ts` now resolves `business_id` server-side via a new RPC, `fn_get_my_business_id()`, before calling the existing (unmodified) `fn_get_user_context()`.
- `AppContext.tsx` gained a lock-state layer (`isLocked`, `hasPin`, `lock()`, `unlockWithPin()`, `setPin()`, `refreshHasPin()`) on top of the existing authenticated-session state. The original "always reload fresh context from the backend, never trust stale storage" session-restoration principle is unchanged — it now also runs on PIN unlock, not just on cold start.
- `RequireAuth` in `router.tsx` now checks three things in order: authenticated → not locked → has a PIN. Redirects to `/login`, `/unlock`, or `/setup-pin` accordingly.

## 2. Registration flow implemented

`RegisterPage.tsx` (`/register`) collects **only** Business Name, Owner Name, Email, Password, Confirm Password. On submit:
`supabase.auth.signUp()` → `fn_register_business()` (creates the business row, the owner `users` row with `is_owner = true`, and explicit `user_permissions` grants for every module — `is_owner` alone does not grant sidebar/route visibility, per the existing `usePermission.ts` architecture) → loads full context → routes to PIN setup.

`fn_register_business` is idempotent: a retried call for the same auth account returns the already-created business instead of creating a duplicate (enforced by `imagecare.users.auth_user_id` being globally `UNIQUE`).

## 3. Business ID removed from user-facing auth

`LoginPage.tsx` and `RegisterPage.tsx` have no Business ID field. It is never requested, displayed, or transmitted by the client anywhere in the new flow.

## 4. Internal business_id preserved

Untouched everywhere else: every table, RLS policy, and RPC (including `fn_get_user_context`, which was **not modified**) still requires and enforces `business_id`. It is now resolved automatically server-side from `auth.uid()` via the new `fn_get_my_business_id()`.

## 5. PIN setup implemented

`PinSetupPage.tsx` (`/setup-pin`) — "Create your 4 digit PIN" / "This PIN will be used to quickly unlock your ERP on this device." Two masked (`type="password"`) 4-digit fields, must match. Calls `fn_set_pin`, which validates exactly 4 digits, hashes with `pgcrypto`'s `crypt()/gen_salt('bf')` (bcrypt), and is stored in a new `pin_hash` column — never plaintext, never logged, never the Supabase Auth password (entirely separate credential store).

## 6. Daily PIN unlock implemented

`UnlockPage.tsx` (`/unlock`) — "Welcome back, [Name]" / dot indicators / Unlock button. Shown automatically on a cold app start when a live Supabase session is restored and the user already has a PIN (`isLocked` starts `true` in that case). Correct PIN calls `fn_verify_pin`, reloads context fresh, and clears the lock — no re-entry of email/password.

## 7. Lock vs Sign Out implemented

`UserMenu.tsx` now has two distinct actions:
- **Lock** — sets `isLocked = true`, navigates to `/unlock`. Session and permissions untouched. This is the expected daily action.
- **Sign out** — unchanged: fully terminates the Supabase session; signing back in requires full email + password.

## 8. PIN reset implemented

`ForgotPinPage.tsx` (`/forgot-pin`, linked from the unlock screen) requires a full email + password re-authentication (calls the same `signIn()` used everywhere else), then routes to `PinSetupPage` in "reset" mode. `fn_set_pin` only ever overwrites the hash — the old PIN is never read back or recoverable.

## 9. Existing users

No schema change touches any existing `users`/`businesses`/permission row. The 4 new `pin_*` columns are nullable additions. An existing user's next successful email/password login resolves `hasPin = false` (since `pin_hash IS NULL`) and is routed to PIN setup automatically before reaching the Dashboard — after that, daily PIN unlock works exactly as for a new user. No duplicate business/user/permission rows can be created (`fn_register_business` is only reachable from `/register`, and is idempotent regardless).

## 10. Business data isolation verified (reasoning, not a live test)

`fn_get_my_business_id()` and the untouched `fn_get_user_context()` both filter strictly by `auth_user_id = auth.uid()`. The client can no longer supply a `business_id` at all in the normal login path (previously it was a client-supplied RPC parameter, though `fn_get_user_context`'s own `WHERE` clause already prevented cross-tenant reads — this is a further hardening, not a fix to a prior leak).

## 11. Security approach for PIN storage

- Stored as a `pgcrypto` bcrypt hash (`crypt(pin, gen_salt('bf'))`) in a new `imagecare.users.pin_hash` column. Never plaintext, anywhere.
- Verified server-side only (`fn_verify_pin`); the hash never leaves the database.
- Completely separate from the Supabase Auth password — no code path uses the PIN to authenticate with Supabase.
- Rate-limited: 5 wrong attempts → 30-minute **temporary** lockout (reuses the exact thresholds already defined in `src/config/env.ts`'s `APP_CONSTANTS`), never a permanent lock. Full email/password sign-in remains available at all times regardless of PIN lock state.
- **Fixed an unrelated but directly relevant exposure**: `settingsService.ts`'s `listStaff()` (People & Access page) was doing `select('*')` on `imagecare.users`, which would have included `pin_hash`, `pin_failed_attempts`, and `pin_locked_until` in that page's API response to any user with staff-list access. Replaced with an explicit column list that excludes those fields — same data returned as before, minus the newly-added PIN columns.

## 12. Files changed (13 total)

**New:**
- `database/migrations/0020_stage7_pin_auth.sql` — PIN columns + `fn_get_my_business_id`, `fn_register_business`, `fn_has_pin`, `fn_set_pin`, `fn_verify_pin`
- `src/features/auth/authStyles.ts`, `RegisterPage.tsx`, `PinSetupPage.tsx`, `UnlockPage.tsx`, `ForgotPinPage.tsx`

**Modified:**
- `src/features/auth/LoginPage.tsx` — Business ID field removed, "Forgot password?" and "Create an account" links added
- `src/context/AppContext.tsx` — business_id resolution, `register()`, lock/unlock state
- `src/services/auth/authService.ts` — `login()`/`register()`/PIN RPC wrappers
- `src/services/settings/settingsService.ts` — `listStaff()` no longer exposes PIN columns
- `src/app/router.tsx` — `RequireAuth` PIN gating, 4 new public routes
- `src/components/layout/UserMenu.tsx` — added "Lock"
- `src/__tests__/services/authService.test.ts` — updated for the new `login()` signature, added coverage for `getMyBusinessId`, `register`, `hasPin`, `setPin`, `verifyPin`

**Not touched:** `fn_get_user_context`, inventory/sales/reports/payroll/every other module's logic, `business_id` as a database column anywhere.

## 13. Verification gate results

All four required gates were run against the full project after every change, not just the new files:

| Gate | Result |
|---|---|
| `npm run typecheck` | **Pass** — 0 errors |
| `npm run lint` | **Pass** — 0 errors, 0 warnings |
| `npm run test` | **Pass** — 446 passed, 13 skipped (0 failed), including 38 tests in the rewritten/expanded `authService.test.ts` |
| `npm run build` | **Pass** — production build succeeded; Tailwind CSS output confirmed intact (unrelated to this task, from the earlier styling-regression fix, still verified working) |

## 14. Test scenarios (reasoned through against the implementation, not run live — no live Supabase project or browser was available in this session)

- **A (new business → PIN → Dashboard):** signUp → fn_register_business → PIN setup (forced, hasPin=false) → Dashboard. ✓ by code path.
- **B (daily lock/unlock):** Lock sets isLocked only; cold start with existing PIN also sets isLocked=true automatically; correct PIN → fresh context reload → unlock. ✓
- **C (wrong PIN):** Rate-limited server-side, clear error message with attempts remaining, app stays behind `/unlock` the whole time (RequireAuth still redirects). ✓
- **D (forgot PIN):** Full reauth via `signIn()` → PinSetupPage in reset mode → old hash overwritten, never read back. ✓
- **E (sign out):** Full session teardown; next entry requires full email/password; business auto-resolved via `fn_get_my_business_id`. ✓
- **F (existing user):** No schema change to existing rows; next login prompts PIN setup once; daily unlock works after. ✓
- **G (data isolation):** Both business-resolution RPCs filter strictly on `auth.uid()`; `fn_get_user_context` itself is unchanged. ✓

## Known caveats / things to verify live

- Whether this Supabase project requires email confirmation before issuing a session on signUp — `register()` handles both cases (confirmed-immediately vs. "check your email"), but which one actually happens depends on the project's Auth settings, not something this session could check.
- `fn_register_business` reads the owner's email from `auth.users` inside a `SECURITY DEFINER` function — a standard, widely-used Supabase pattern, but worth a first live registration test to confirm the deploying project's grants allow it.
- The migration (`0020_stage7_pin_auth.sql`) needs to be run in Supabase before any of this works — same manual step as the earlier `grant_restored_module_permissions.sql`.
