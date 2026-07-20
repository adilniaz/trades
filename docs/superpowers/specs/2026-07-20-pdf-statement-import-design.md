# PDF statement import — design

**Date:** 2026-07-20
**Status:** Approved (pending user review of this file)

## Problem

Users currently add trade history to the app one of two ways: the manual transaction form, or pasting CSV text at `/import-transactions`. Users who trade through Trade Republic have to manually transcribe every row from their PDF account statement into one of those forms. This feature lets a user upload their Trade Republic PDF account statement directly and have its BUY/SELL/DIVIDEND activity turned into `Transaction` rows, after reviewing and confirming what was extracted.

## Scope

- Source document: Trade Republic's periodic account statement PDF ("SYNTHÈSE DU RELEVÉ DE COMPTE"), French locale — comma decimals, space thousands separators, `DD mois YYYY` dates, French column/type labels (e.g. "Exécution d'ordre", "Virement").
- Parsing is **deterministic** (regex/layout rules against the known Trade Republic format), not AI-assisted. No PDF content or extracted text is sent to any external API. This keeps confidential statement data inside the app's own infrastructure and avoids a new external dependency/cost.
- Only one brokerage format is supported for v1. The parser is explicitly Trade Republic-shaped; a different broker's statement is out of scope and should fail cleanly (see Error handling) rather than silently produce garbage.
- Savings-plan (recurring investment) executions are parsed and imported as ordinary BUY transactions.
- The uploaded PDF and its extracted text are **never persisted** — processed in memory for the duration of the request and discarded. Only the user-reviewed, user-confirmed transaction data is written to the database, exactly as if the user had entered it manually or via CSV.

## Data model change

`Company` gains an optional `isin` field, because Trade Republic identifies securities by ISIN, not ticker:

```prisma
model Company {
  ...
  isin String?
  ...
}
```

- Partial unique index on `isin` scoped to active (non-soft-deleted) rows, mirroring the existing `ticker` partial-unique pattern (see migration `20260714140243_company_ticker_partial_unique`).
- `isin` is optional — existing companies and manually-entered companies aren't required to have one. Only companies a user wants to match via PDF import need it populated.
- Admin company create/edit forms (`/admin/companies/new`, `/admin/companies/[id]/edit`) get an ISIN input field.
- `companyRequestSchema` (`src/lib/validation/company-request.ts`) gains an optional `isin` field. `ticker` remains required — Trade Republic statements never print a ticker, so the user still supplies it by hand when requesting a company from the PDF review screen; `name` and `isin` are prefilled.

## Upload & parsing pipeline

**Entry point:** new "Upload PDF" tab alongside the existing "Paste CSV" tab on `/import-transactions`. Client picks a file, submits as `FormData` to a new Server Action running in the Node runtime (PDF parsing libraries require Node, not Edge).

**Server-side steps (parse action):**

1. `requireAuth()` first line, per the app's hard rule (no `roles` — any authenticated user).
2. Validate the upload before any parsing work: magic-byte check for `%PDF` header, and a size cap (mirroring `import-limits.ts`'s reasoning — generous for a real statement, bounded against worst-case pathological files). Reject anything else immediately with a clear error.
3. Extract text with a lightweight PDF-to-text library (e.g. `pdf-parse`) — plain text, not positional/coordinate data.
4. **Row-stitching:** split extracted text into lines. A line matching the `DD mois YYYY` date pattern starts a new logical row; subsequent lines accumulate into that row until the next date-line or end of text. This handles multi-line wrapped rows (e.g. a "Exécution d'ordre" row whose type label wraps onto its own line, as seen in the reference statement layout).
5. **Row filtering:** keep only rows whose `TYPE` column is a recognized trade-execution label ("Exécution d'ordre"). Non-trade rows (transfers, interest, etc.) are dropped — they're not trade history and were never in scope.
6. **Field extraction** for kept rows: regex the description for `(Buy|Sell) trade <ISIN> <NAME>, quantity: <N>` to get action, ISIN, company name, and quantity. Parse the French-formatted money column (comma decimal, space thousands, trailing `€`) for the amount. Compute `pricePerShare = amount / quantity`. Map `Buy`/savings-plan → `BUY`, `Sell` → `SELL`.
7. A row whose `TYPE` looks like a trade execution but whose description doesn't match the known pattern (e.g. a dividend-payout row, whose exact text format hasn't been confirmed against a real sample yet) is **not silently dropped** — it's returned to the client flagged `unparsed: true` with the raw line text, so the user sees it and can enter it manually instead of losing it.
8. Return a structured JSON array of candidate rows to the client. Nothing is written to the database yet, and neither the PDF bytes nor the extracted text are retained after the response is sent.

## Review screen & confirm/import

Client renders the parse response as an editable table — state lives only in the browser between parse and confirm, nothing server-side is staged.

Per row: date, action (BUY/SELL), matched company (or "unmatched"), quantity, computed price/share, amount, and an include checkbox.

- **Company matching:** row's ISIN is looked up against active + `APPROVED` companies. No match → row flagged "no matching company," checkbox defaults unchecked, with a link to `/request-company?name=...&isin=...` prefilling the request form.
- **Duplicate detection:** each matched row is checked against the user's existing `Transaction` rows (same company, type, date, and shares/amount). A hit flags the row "possible duplicate, already imported" and unchecks it by default; the user can re-check it to force import if it's a legitimate repeat (e.g. two trades on the same security on the same day).
- User can hand-edit any field before confirming, to correct parser mistakes.
- **Unparsed rows** (from pipeline step 7) show the raw text with no editable structured fields and are excluded from the checked set by default — they're a visible "you'll need to add this one manually" prompt, not a silent drop.

**Confirm action:** takes the client's checked/edited rows. Per the app's Server-Action trust boundary, this action does **not** trust the client's data as final:

- `requireAuth()` first line.
- Re-validates every row through the existing `transactionSchema` (same schema the manual form and CSV import use).
- Re-resolves the company **server-side by ISIN** — never trusts a client-supplied `companyId` directly, to prevent a tampered request from attaching a transaction to the wrong company.
- Re-runs the duplicate check server-side before creating.
- Rows that fail any of the above are skipped and reported, same shape as `bulkImportTransactions`'s `skipped` list.
- Each accepted row is created inside a `prisma.$transaction` with a corresponding `AuditLog` entry (`action: "transaction.pdfImport"`), matching the existing `bulkImportTransactions` pattern exactly.

## Error handling & edge cases

- Non-PDF file, corrupted PDF, password-protected PDF, or a PDF that yields zero recognized rows → clear error message shown to the user, no partial state.
- Partial success is expected and fine: a parse producing some good rows and some unparseable ones populates the review table with both — good rows ready to confirm, bad ones flagged with a reason — rather than an all-or-nothing failure.
- File size is capped before parsing begins, protecting against slow/pathological parses, not just storage (moot anyway since nothing is stored).
- Both the parse action and the confirm action call `requireAuth()` as their first line, independent of any layout/proxy gating, per the project's hard auth-guard convention.

## Testing

- New parser module (e.g. `src/lib/pdf-statement-parser.ts`) is pure logic (text in, structured rows out) independent of the PDF library and Server Actions, so it's directly unit-testable in Vitest. Test fixtures are text blocks modeled on the redacted reference layout, covering: row-stitching across wrapped lines, French number parsing, the ISIN/description regex, non-trade-row filtering, savings-plan-as-BUY mapping, and the "unparsed, needs manual entry" fallback.
- Company-matching (by ISIN) and duplicate-detection logic get unit tests against Company/Transaction fixtures.
- `src/lib/calculations.ts` and `_docs/averaging_down.md` are untouched by this feature — no re-verification needed there.

## Open items for implementation time

- The exact description format for DIVIDEND rows and savings-plan execution rows (and any other trade-execution-adjacent row types) hasn't been confirmed against a real statement — only the manual "Buy trade" pattern is confirmed via the redacted screenshot. The parser must be built/tuned against a redacted real sample statement (account numbers and amounts blanked, layout and labels intact) before the regex rules can be considered final, including confirming whether savings-plan rows share the "Buy trade ISIN NAME, quantity: N" description shape or use distinct wording. Until then, unrecognized-but-trade-shaped rows fall into the "unparsed" bucket by design (see pipeline step 7), so this is a tuning task, not a blocking unknown.
- Exact PDF-to-text library choice (`pdf-parse` vs. an alternative) is an implementation detail to confirm during setup based on Next.js 16/Turbopack compatibility, not a design constraint.
