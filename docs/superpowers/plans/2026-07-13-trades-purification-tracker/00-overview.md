# Trades Purification Tracker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan session-by-session. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Multi-session note:** This plan is written so each **Session** below is self-contained — a fresh session/agent with zero prior conversation context can read just that Session's "Context Recap" plus the Global Constraints below and execute it correctly. Sessions are ordered; each declares its prerequisites. Do not skip ahead.
>
> **Plan-mode note:** This file was authored under Claude Code's plan-mode restriction (only this file could be written during planning). Once execution starts, the source-of-truth code lives in `/home/adil/projects/trades/` per the paths below — this document itself does not need to move.

**Goal:** Build a multi-user Next.js web app that replaces the `trades_template` Google Sheet: admins curate a company list (name, ticker, non-compliant %, dividend period), users log Buy/Sell/Dividend transactions per company, and the app derives position, capital gains, purification amounts owed, and a break-even price — plus lets users mark purification as paid.

**Architecture:** Next.js 16 App Router monolith (Server Actions for mutations, minimal REST only for NextAuth/export), Postgres via Prisma 7, NextAuth v5 Credentials auth with role-gated middleware, all business math isolated in a pure/testable `src/lib/calculations.ts`. Mirrors the existing sibling apps at `~/laraib/projects/` (`hisab`, `cookbook`, `bake_em_up`) stack-for-stack so it fits their shared Caddy deployment and is maintainable by the same conventions.

**Tech Stack:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Prisma 7 + `@prisma/adapter-pg` · Postgres · NextAuth v5 beta (Credentials, JWT sessions) · Tailwind CSS v4 + shadcn/ui · `react-hook-form` + `zod` v4 · `bcryptjs` · Vitest + Testing Library · Docker + docker-compose.

## Context

The user maintains a Google Sheet (`trades_template`) tracking a personal
stock portfolio through a Shariah-compliance "purification" lens: each
company has a **non-compliant %** (fraction of revenue considered
non-compliant), and any capital gains/dividends earned from that company
must have that same fraction "purified" (donated). The sheet is
single-user, manually maintained, and has no transaction history — one row
per company with a single current shares/buy-in/sold-at.

This app formalizes that workflow for multiple private users sharing one
admin-curated company list, replaces the single-snapshot row with a real
transaction ledger (so average cost, capital gains, and a break-even price
can all be derived), and adds a "mark as purified" action so the app tracks
not just what's owed but what's actually been paid out — closing a gap the
sheet never covered.

A companion file `/home/adil/projects/trades/averaging_down.md` derives the
break-even-price formula this app implements (Session 3); the algebra is
re-verified there and generalized to work over an arbitrary transaction
history, not just the paired buy/sell tranches in the doc's worked example.

## Global Constraints

These apply to every session/task below; the skill-level instructions for
each task implicitly include them.

- **Stack versions:** Next.js 16, React 19, Prisma 7 (`@prisma/adapter-pg` driver adapter — do not use the legacy Prisma engine binary), NextAuth v5 **beta** (import from `next-auth` v5, not v4 APIs), Tailwind v4, Zod v4.
- **IDs:** `cuid()` primary keys everywhere (`@id @default(cuid())`), never auto-increment ints.
- **Field naming:** camelCase in Prisma schema and TypeScript; Prisma maps to Postgres snake_case automatically — do not hand-write `@map`.
- **Soft delete:** `Company` and `Transaction` get a nullable `deletedAt DateTime?`, indexed (`@@index([deletedAt])`). Every query against these models must filter `deletedAt: null` unless explicitly listing deleted history. Never hard-delete rows. **One deliberate exception:** a `Company` row created by a user's request (`status: "PENDING"`, `requestedById` set) that the admin rejects is hard-deleted, not soft-deleted — it was never real approved data, and hard-deleting frees its `ticker` for a future request (Session 4).
- **Auth defense in depth:** every Server Action and API route handler calls `requireAuth()` / `requireAuthApi()` as its **first line**, even though `src/proxy.ts` also gates routes. Do not rely on proxy/layout-level checks alone — this is a hard rule carried over from the sibling apps' `AGENTS.md`, which cites real incidents caused by skipping it.
- **Validation:** every form has a Zod schema in `src/lib/validation/`. The **same schema instance** is imported by both the client component (via `zodResolver`) and the Server Action that receives the submission — never hand-maintain two schemas that are supposed to match.
- **No public signup:** there is no `/signup` route anywhere in this app.
- **Currency/number handling:** Prisma `Decimal` fields are converted to plain JS `number` via `.toNumber()` at the boundary where they enter `src/lib/calculations.ts`, and back to `Decimal`/string only when persisting. This app's amounts are personal-portfolio scale, so plain-`number` arithmetic in the calculation layer is an accepted simplification — do not introduce a big-decimal library for this.
- **Single-currency assumption:** every `Transaction.amount`/`pricePerShare` is assumed to already be in one home currency — there is no per-row currency field and no FX conversion anywhere in the app. This is a conscious v1 decision (Session 1's `Setting` row `displayCurrency` controls only the label shown next to figures, not conversion). If the portfolio ever spans multiple settlement currencies, this assumption must be revisited before trusting portfolio-wide totals.
- **Audit trail:** admin actions that change a value later used in a calculation, or that change account access — company edits (`nonCompliantPct`, ticker, dividend info), `transactionFee` changes, user activation/deactivation, admin password resets — write an `AuditLog` row (model in Session 1; write sites in Sessions 4–5). Never silently mutate config that affects historical purification figures.
- **Testing:** Vitest. Test files live under `tests/`, mirroring the `src/` path of the thing under test (e.g. `src/lib/calculations.ts` → `tests/lib/calculations.test.ts`).
- **Commits:** one commit per completed task/step group, using the message conventions shown inline below. Run `git status` before committing to confirm you're only staging what you intend.

## Session index

Each session file below is self-contained: it repeats these Global Constraints and its own Context Recap, so a fresh session/agent can execute it without reading this overview or any other session file.

- [Session 0: Project Scaffolding & Docker Dev Environment](01-session-0-project-scaffolding-docker-dev-environment.md)
- [Session 1: Database Schema, Prisma, Seed](02-session-1-database-schema-prisma-seed.md)
- [Session 2: Auth (NextAuth, Route Guards, Proxy, Rate Limiting)](03-session-2-auth-nextauth-route-guards-proxy-rate-limiting.md)
- [Session 3: Core Calculations Library (TDD)](04-session-3-core-calculations-library-tdd.md)
- [Session 4: Admin — Company Management (CRUD + Approval Queue)](05-session-4-admin-company-management-crud-approval-queue.md)
- [Session 5: Admin — User Management & Global Settings](06-session-5-admin-user-management-global-settings.md)
- [Session 6: User — Dashboard / Holdings Overview](07-session-6-user-dashboard-holdings-overview.md)
- [Session 7: User — Transactions (Add / Per-Company History)](08-session-7-user-transactions-add-per-company-history.md)
- [Session 8: User — Request Company & Mark-as-Purified](09-session-8-user-request-company-mark-as-purified.md)
- [Session 9: CSV Export, Docs, Prod Readiness](10-session-9-csv-export-docs-prod-readiness.md)
- [Post-plan verification](11-post-plan-verification.md)

