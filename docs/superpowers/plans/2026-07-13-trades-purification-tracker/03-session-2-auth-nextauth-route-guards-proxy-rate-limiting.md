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

## Session 2: Auth (NextAuth, Route Guards, Proxy, Rate Limiting)

**Context recap:** Sessions 0–1 give a running app with a seeded admin user in the database, but no way to log in yet. This session wires up NextAuth v5 Credentials auth, the `requireAuth`/`requireAuthApi` guard functions every later Server Action must call, `src/proxy.ts` for edge-level session/role checks, and login rate-limiting with account lockout.

**Prerequisites:** Session 1 complete (seeded admin exists in DB).

**Interfaces produced (used by all later sessions):**
- `auth()` — NextAuth session accessor, returns `{ user: { id, email, role, tokenVersion } } | null`
- `requireAuth(opts?: { roles?: Role[] }): Promise<{ id: string; email: string; role: Role }>` — redirects to `/login` if unauthenticated, or **redirects to `/overview`** if role mismatch (there is no dedicated 403 page in this app — this doc previously claimed one; the actual implementation in Step 5 below always redirects, and that's the correct, intended behavior). Use in Server Components/Server Actions that render/redirect.
- `requireAuthApi(opts?: { roles?: Role[] }): Promise<{ id: string; email: string; role: Role } | { error: NextResponse }>` — returns the session user, or an object carrying a ready-to-return 401/403 `NextResponse`. Use in `route.ts` handlers.

**Files to create:**
- `/home/adil/projects/trades/src/lib/auth.ts`
- `/home/adil/projects/trades/src/lib/auth-guard.ts`
- `/home/adil/projects/trades/src/lib/rate-limit.ts`
- `/home/adil/projects/trades/src/proxy.ts`
- `/home/adil/projects/trades/src/app/api/auth/[...nextauth]/route.ts`
- `/home/adil/projects/trades/src/app/(auth)/login/page.tsx`
- `/home/adil/projects/trades/src/app/(auth)/login/actions.ts`
- `/home/adil/projects/trades/src/lib/validation/auth.ts`

- [ ] **Step 1: Write `src/lib/validation/auth.ts`**

```typescript
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;
```

- [ ] **Step 2: Write `src/lib/rate-limit.ts`**

```typescript
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export function isLockedOut(lockedUntil: Date | null): boolean {
  return !!lockedUntil && lockedUntil.getTime() > Date.now();
}

export function nextLockoutState(failedAttempts: number): {
  failedAttempts: number;
  lockedUntil: Date | null;
} {
  const failed = failedAttempts + 1;
  if (failed >= MAX_FAILED_ATTEMPTS) {
    return {
      failedAttempts: 0,
      lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000),
    };
  }
  return { failedAttempts: failed, lockedUntil: null };
}

export const resetLockoutState = { failedAttempts: 0, lockedUntil: null as Date | null };
```

- [ ] **Step 2b: Write `tests/lib/rate-limit.test.ts`**

`rate-limit.ts` is pure and zero-dependency, exactly like `calculations.ts` — it gets the same test-first treatment since it's the account-lockout security mechanism, not left to manual verification alone.

```typescript
import { describe, it, expect } from "vitest";
import { isLockedOut, nextLockoutState, resetLockoutState } from "@/lib/rate-limit";

describe("isLockedOut", () => {
  it("is false when lockedUntil is null", () => {
    expect(isLockedOut(null)).toBe(false);
  });
  it("is true when lockedUntil is in the future", () => {
    expect(isLockedOut(new Date(Date.now() + 60_000))).toBe(true);
  });
  it("is false when lockedUntil is in the past", () => {
    expect(isLockedOut(new Date(Date.now() - 60_000))).toBe(false);
  });
});

describe("nextLockoutState", () => {
  it("increments failedAttempts without locking below the threshold", () => {
    expect(nextLockoutState(0)).toEqual({ failedAttempts: 1, lockedUntil: null });
    expect(nextLockoutState(3)).toEqual({ failedAttempts: 4, lockedUntil: null });
  });
  it("locks out and resets the counter at the threshold (5th failure)", () => {
    const result = nextLockoutState(4);
    expect(result.failedAttempts).toBe(0);
    expect(result.lockedUntil).not.toBeNull();
    expect(result.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("resetLockoutState", () => {
  it("is a zeroed, unlocked state", () => {
    expect(resetLockoutState).toEqual({ failedAttempts: 0, lockedUntil: null });
  });
});
```

Run `npx vitest run tests/lib/rate-limit.test.ts` and confirm all pass before moving on.

- [ ] **Step 3: Write `src/lib/auth.ts`**

```typescript
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validation/auth";
import { isLockedOut, nextLockoutState, resetLockoutState } from "@/lib/rate-limit";

// Dummy hash used for timing-safe comparison when the email doesn't exist,
// so login latency doesn't leak whether an account exists.
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO0.CN3Y0kAoO3lZLxYCkgOFBGdaFOJRe";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
          await bcrypt.compare(password, DUMMY_HASH);
          return null;
        }

        // Always run bcrypt.compare before checking lockout/active state,
        // even though we won't honor a correct password once locked/inactive.
        // Skipping the compare on those branches would make a locked or
        // deactivated account respond measurably faster than a plain wrong
        // password, leaking lockout/active state via response timing.
        const valid = await bcrypt.compare(password, user.passwordHash);

        if (isLockedOut(user.lockedUntil)) return null;
        if (!user.active) return null;

        if (!valid) {
          // Optimistic-concurrency increment: the update only applies if
          // failedAttempts still matches what we just read, so two
          // concurrent failed attempts from parallel requests can't both
          // silently base their increment off the same stale value and
          // undercount toward the lockout threshold. Not a full row lock —
          // a narrow remaining race is accepted at this app's invite-only,
          // small-user-count scale, but this closes the easy case.
          const next = nextLockoutState(user.failedAttempts);
          await prisma.user.updateMany({
            where: { id: user.id, failedAttempts: user.failedAttempts },
            data: next,
          });
          return null;
        }

        await prisma.user.update({ where: { id: user.id }, data: resetLockoutState });

        return {
          id: user.id,
          email: user.email,
          role: user.role,
          tokenVersion: user.tokenVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // `User.role`/`User.tokenVersion` are declared in
      // src/types/next-auth.d.ts below, so those two assignments are
      // properly typed with no cast needed. `user.id` is a separate case:
      // NextAuth's own base `User` interface declares `id?: string`
      // (optional) and this app's augmentation only adds role/tokenVersion
      // to it, not id — so `user.id` is still `string | undefined` here,
      // while `JWT.id` (declared below) is required. `authorize()` always
      // returns a real id in practice, so the non-null assertion is safe;
      // the `if (user)` guard alone does not narrow `user.id` itself.
      if (user) {
        token.id = user.id!;
        token.role = user.role;
        token.tokenVersion = user.tokenVersion;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.tokenVersion = token.tokenVersion;
      return session;
    },
  },
});
```

- [ ] **Step 4: Extend NextAuth's session type** — create `src/types/next-auth.d.ts`

```typescript
import { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      role: Role;
      tokenVersion: number;
    };
  }

  // Augmenting User (not just Session) is required, not optional cleanup:
  // NextAuth's base User type only has id?/name?/email?/image?. Without
  // this, authorize()'s return literal below (which includes role and
  // tokenVersion) fails TypeScript's excess-property check on an object
  // literal — it wouldn't compile as written.
  interface User {
    role: Role;
    tokenVersion: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    tokenVersion: number;
  }
}
```

- [ ] **Step 5: Write `src/lib/auth-guard.ts`**

```typescript
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { Role } from "@prisma/client";

type SessionUser = { id: string; email: string; role: Role };

export async function requireAuth(opts?: { roles?: Role[] }): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (opts?.roles && !opts.roles.includes(session.user.role)) redirect("/overview");
  return session.user;
}

export async function requireAuthApi(
  opts?: { roles?: Role[] }
): Promise<SessionUser | { error: NextResponse }> {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (opts?.roles && !opts.roles.includes(session.user.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return session.user;
}
```

- [ ] **Step 5b: Write `tests/lib/auth-guard.test.ts`**

The Global Constraints call auth-guard-first-line "a hard rule... cites real incidents caused by skipping it," but the guard itself had zero automated regression coverage before this — enforcement relied entirely on manual "verify as admin" steps per session (see `analysis.md` 4a). `requireAuthApi` doesn't call `redirect()` (unlike `requireAuth`), so it's the easier of the two to unit test in isolation by mocking `@/lib/auth`.

```typescript
import { describe, it, expect, vi } from "vitest";
import { requireAuthApi } from "@/lib/auth-guard";
import { auth } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

const mockAuth = vi.mocked(auth);

describe("requireAuthApi", () => {
  it("returns a 401 NextResponse when there is no session", async () => {
    mockAuth.mockResolvedValue(null);
    const result = await requireAuthApi();
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error.status).toBe(401);
  });

  it("returns a 403 NextResponse when the role doesn't match", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "1", email: "user@example.com", role: "USER", tokenVersion: 0 },
    } as never);
    const result = await requireAuthApi({ roles: ["ADMIN"] });
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error.status).toBe(403);
  });

  it("returns the session user when authenticated with a matching role", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "1", email: "admin@example.com", role: "ADMIN", tokenVersion: 0 },
    } as never);
    const result = await requireAuthApi({ roles: ["ADMIN"] });
    expect("error" in result).toBe(false);
    if (!("error" in result)) expect(result.role).toBe("ADMIN");
  });

  it("returns the session user when no roles are required, regardless of role", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "1", email: "user@example.com", role: "USER", tokenVersion: 0 },
    } as never);
    const result = await requireAuthApi();
    expect("error" in result).toBe(false);
  });
});
```

Run `npx vitest run tests/lib/auth-guard.test.ts` and confirm all pass. This doesn't cover `requireAuth`'s `redirect()` path (harder to unit test — `next/navigation`'s `redirect` throws in a way that's better exercised by the manual role-transition walkthrough in Step 10 and Session 9's final verification), but it closes the gap on the API-route half of the guard, which is what every admin-only Server Action/route in Sessions 4–6 and 9 actually depends on.

Usage convention for API routes (documented here since it's used repeatedly from Session 4 onward):

```typescript
const result = await requireAuthApi({ roles: ["ADMIN"] });
if ("error" in result) return result.error;
const user = result; // typed SessionUser
```

- [ ] **Step 6: Write `src/proxy.ts`** (Next 16's `middleware.ts` replacement)

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  const isPublic = pathname === "/login";
  if (!session?.user && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (session?.user) {
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { active: true, tokenVersion: true },
    });
    // tokenVersion mismatch means the DB value has been bumped since this
    // JWT was issued (deactivation, reactivation, or a password change/reset
    // — see Sessions 5 and 9) — force this stale session to re-authenticate
    // rather than silently trusting a token that predates the change.
    if (!dbUser || !dbUser.active || dbUser.tokenVersion !== session.user.tokenVersion) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    if (pathname.startsWith("/admin") && session.user.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/overview", req.url));
    }
  }

  const res = NextResponse.next();
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return res;
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
```

Note: `tokenVersion` is now actually enforced (revised after the initial plan review flagged it as fetched-but-unused — see `analysis.md` 2e). It's bumped on user deactivation/reactivation (Session 5) and on any password change/reset (Sessions 5 and 9), and every request compares the session's `tokenVersion` against the DB's current value above, forcing re-login the moment either happens — closing the gap where a deactivated or password-reset user's still-valid JWT would otherwise keep working until it naturally expired.

- [ ] **Step 7: Write `src/app/api/auth/[...nextauth]/route.ts`**

```typescript
export { GET, POST } from "@/lib/auth";
```

(NextAuth v5 exports `handlers.GET`/`handlers.POST`; re-export via the `handlers` object — adjust to `import { handlers } from "@/lib/auth"; export const { GET, POST } = handlers;` if the direct re-export syntax doesn't type-check against the installed beta version.)

- [ ] **Step 8: Write `src/app/(auth)/login/actions.ts`**

```typescript
"use server";

import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { loginSchema } from "@/lib/validation/auth";

export async function loginAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Invalid email or password" };

  try {
    await signIn("credentials", {
      ...parsed.data,
      redirectTo: "/overview",
    });
    return {};
  } catch (err) {
    if (err instanceof AuthError) return { error: "Invalid email or password" };
    throw err;
  }
}
```

- [ ] **Step 9: Write `src/app/(auth)/login/page.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, {});

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form action={formAction} className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" required />
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 10: Verify**

```bash
npm run dev
```

Navigate to `http://localhost:3000/overview` (doesn't exist yet — expect a 404 *after* being redirected to `/login`, confirming the guard works). Log in with the seeded admin credentials from `.env`; confirm redirect attempt to `/overview` occurs (404 is fine at this point — Session 6 builds that page). Try 5 wrong passwords in a row for a test account and confirm the 6th correct-password attempt is still rejected (locked out) — recreate the test user's `lockedUntil` via Prisma Studio to unlock for repeat testing.

- [ ] **Step 11: Commit**

```bash
git add src/lib/auth.ts src/lib/auth-guard.ts src/lib/rate-limit.ts src/proxy.ts src/types/next-auth.d.ts src/app/api/auth src/app/\(auth\) src/lib/validation/auth.ts tests/lib/rate-limit.test.ts tests/lib/auth-guard.test.ts
git commit -m "feat: add NextAuth credentials login, route guards, rate limiting, and tokenVersion enforcement"
```
