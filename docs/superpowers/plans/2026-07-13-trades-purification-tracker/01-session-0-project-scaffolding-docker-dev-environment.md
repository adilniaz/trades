> Part of the **Trades Purification Tracker** implementation plan — see [00-overview.md](00-overview.md) for the Goal, Architecture, Tech Stack, full Context, and the complete session list.

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

---

## Session 0: Project Scaffolding & Docker Dev Environment

**Context recap:** Nothing exists yet beyond `/home/adil/projects/trades/trades_template - current.csv`, `Account statement.pdf`, and `averaging_down.md` (reference material only, not imported). This session creates the Next.js project skeleton and a working local dev loop via Docker, matching the sibling apps' `npm run dev` = `docker compose up --build` convention. No app features yet — the deliverable is a blank Next.js page reachable in a browser, started via Docker.

**Prerequisites:** None. First session.

**Files to create:**
- `/home/adil/projects/trades/package.json` (via `create-next-app`, then edited)
- `/home/adil/projects/trades/tsconfig.json`, `next.config.ts`, `tailwind.config.ts` / `postcss.config.mjs` (generated)
- `/home/adil/projects/trades/Dockerfile.dev`
- `/home/adil/projects/trades/docker-compose.dev.yml`
- `/home/adil/projects/trades/.env.example`
- `/home/adil/projects/trades/.gitignore` (generated, verify `node_modules`, `.env`, `.next` present)

- [ ] **Step 1: Scaffold Next.js app**

Run from `/home/adil/projects/trades`:

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*" --turbopack --eslint --no-git
```

(`--no-git` because the directory isn't a git repo yet and has existing non-project files — CSV/PDF/md — that must not be touched by scaffolding. Answer "Yes" if prompted about a non-empty directory.)

- [ ] **Step 2: Install remaining core dependencies**

```bash
npm install @prisma/client @prisma/adapter-pg pg next-auth@beta bcryptjs react-hook-form @hookform/resolvers zod
npm install -D prisma vitest @testing-library/react @testing-library/jest-dom @vitejs/plugin-react jsdom @types/pg @types/bcryptjs tsx
```

- [ ] **Step 3: Add shadcn/ui**

```bash
npx shadcn@latest init -d
npx shadcn@latest add button input label table form dialog dropdown-menu select badge card
```

- [ ] **Step 4: Write `Dockerfile.dev`**

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev:next"]
```

- [ ] **Step 5: Write `docker-compose.dev.yml`**

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: trades
      POSTGRES_PASSWORD: trades_dev_password
      POSTGRES_DB: trades_dev
    ports:
      - "5432:5432"
    volumes:
      - trades_pg_dev:/var/lib/postgresql/data

  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    env_file:
      - .env
    environment:
      DATABASE_URL: postgresql://trades:trades_dev_password@db:5432/trades_dev
    volumes:
      - .:/app
      - /app/node_modules
      - /app/.next
    depends_on:
      - db

volumes:
  trades_pg_dev:
```

- [ ] **Step 6: Write `.env.example`**

```bash
DATABASE_URL="postgresql://trades:trades_dev_password@localhost:5432/trades_dev"
AUTH_SECRET="generate-with-npx-auth-secret"
AUTH_URL="http://localhost:3000"
AUTH_TRUST_HOST="true"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="change-me-on-first-login"
```

Copy it to `.env` locally (not committed) and fill in a real `AUTH_SECRET` via `npx auth secret`.

- [ ] **Step 7: Add `dev:next` script to `package.json`**

```json
"scripts": {
  "dev": "docker compose -f docker-compose.dev.yml up --build",
  "dev:next": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 8: Verify**

```bash
npm run dev
```

Expected: Postgres and the Next.js app both start; `http://localhost:3000` shows the default Next.js starter page. Stop with `Ctrl+C`, then `docker compose -f docker-compose.dev.yml down`.

- [ ] **Step 9: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Next.js app with Docker dev environment"
```

(This is the first commit in a previously non-git directory — confirm with the user before running `git init` if picking this up in a fresh session, since `/home/adil/projects/trades` was not a git repo as of this plan's writing.)
