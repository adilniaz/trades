> Part of the **Trades Purification Tracker** implementation plan — see [00-overview.md](00-overview.md) for the Goal, Architecture, Tech Stack, full Context, and the complete session list.

## Post-plan verification (whole app)

**Revision note:** this checklist was revised after an early plan review (`analysis.md`) whose fixes are now applied throughout Sessions 1–9. The line about `breakeven()` matching `averaging_down.md` below was flagged as *false* by that review at the time it was written (the tests asserted numbers off by one fee) — Session 3 was fixed and this claim is now accurate. Added checks below for the fixes that don't have an obvious home in Session 9's own checklist: audit logging, tokenVersion enforcement, bulk import, and the CSV formula-injection fix's actual security property.

- `npx vitest run` — full suite green: `calculations.test.ts`, `rate-limit.test.ts`, `auth-guard.test.ts`, and `export-utils.test.ts` at minimum.
- Manual walkthrough (Session 9 Step 12) covering every role transition: admin-only pages blocked for a `USER` role, deactivated users can't log in, pending companies invisible to users until approved, soft-deleted companies/transactions disappear from all user-facing views but remain in the DB.
- Confirm `averaging_down.md`'s worked example numbers match `breakeven()`'s output exactly (Session 3 Step 2's tests encode this — `95.4`/`100.2`/`105.4`, not the earlier `95.3`/`100.1`/`105.3`).
- Confirm `tokenVersion` enforcement actually forces re-login: deactivate a user (or reset their password) while they're logged in elsewhere, and confirm their next navigation redirects to `/login` rather than continuing to work until the JWT's natural 24h expiry.
- Confirm `/admin/audit-log` has entries for at least one of each: company create/update/approve/reject/delete, user create/deactivate/reactivate/password-reset, and transaction fee change.
- Confirm `/admin/reports` totals equal the sum of each individual user's `/overview` totals.
- Bulk-import a handful of real rows from `trades_template - current.csv` via `/admin/companies/import` and spot-check the imported `nonCompliantPct` values against the source file exactly (not just that the row count matches).
- Confirm the CSV export test actually proves the formula-injection fix (leading apostrophe in the raw file), not just that a value got CSV-quoted — see Session 9 Step 12's manual export-and-inspect check.
- Confirm a company can't be soft-deleted while a user holds live transactions against it without the admin explicitly confirming (Session 4's `deleteCompany` force flag).
