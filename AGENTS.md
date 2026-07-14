# AGENTS.md

Conventions for this app (mirrors ~/laraib/projects/hisab, cookbook, bake_em_up).

## Hard rules

- Every Server Action and API route handler calls `requireAuth()` /
  `requireAuthApi()` as its first line, even on routes proxy.ts also
  gates. Two sibling-app incidents were caused by skipping this — do not
  rely on proxy/layout checks alone.
- `Company` and `Transaction` are soft-deleted via `deletedAt`. Every
  query must filter `deletedAt: null` unless intentionally listing
  deleted history.
- Client and server validation for a given form must import the *same*
  Zod schema from `src/lib/validation/` — never hand-duplicate.
- `Company.nonCompliantPct` is read live at calculation time, not
  snapshotted per-transaction. If historical accuracy across percentage
  changes is ever needed, add a `nonCompliantPctAtEntry` field to
  `Transaction` captured on create — not built currently.
- Money fields are `Decimal` in Postgres/Prisma but converted to plain
  `number` at the `src/lib/calculations.ts` boundary — this app's scale
  doesn't warrant a big-decimal dependency.
- No public signup route exists or should be added; accounts are
  admin-provisioned only (see `src/app/admin/users/actions.ts#createUser`).

## Testing

Vitest, `tests/` mirrors `src/`. `src/lib/calculations.ts` is the most
test-critical file in the app — any change to its formulas needs a
corresponding test case, including re-verifying against the worked
example in `averaging_down.md`.

## Known simplifications (documented, not bugs)

- `src/lib/settings.ts`'s `getSettings()` cache is a plain module-level
  variable — not shared across processes. Fine for the current
  single-container deployment; would need a shared cache (or no caching at
  all — it's a single-row lookup) if ever scaled to multiple instances.
- The whole app assumes one home currency for every `Transaction` — there
  is no per-row currency field or FX conversion. `Setting.displayCurrency`
  only controls a label, not conversion.
- `src/app/admin/companies/actions.ts#bulkImportCompanies` does a naive
  comma-split, not full CSV quoted-field parsing — company names
  containing a literal comma need the comma stripped before import.
- `Company.nonCompliantPct` and `Setting.transactionFee` are read live at
  calculation time. `AuditLog` records *that* and *when* they changed, but
  changing them still recomputes purification figures for any old
  unpurified transaction against the new value — there's no per-transaction
  snapshot of the rate that applied when the transaction was purified.
