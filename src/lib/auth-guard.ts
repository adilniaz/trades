import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

type SessionUser = { id: string; email: string; role: Role };

export async function requireAuth(opts?: { roles?: Role[] }): Promise<SessionUser> {
  const session = await auth();
  // Known simplification: redirecting to /login without a returnUrl/callbackUrl
  // parameter. The login page doesn't currently redirect back after sign-in.
  if (!session?.user) redirect("/login");

  // Defense-in-depth: verify the user is still active, the JWT's tokenVersion
  // matches the DB, and re-fetch role from the DB rather than trusting the
  // JWT — matching proxy.ts's enforcement. Without this, a deactivated (or,
  // if a role-change feature is ever added, demoted) user's still-valid JWT
  // would pass the guard if proxy.ts is ever bypassed (e.g., a route added
  // outside the matcher).
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { active: true, tokenVersion: true, role: true },
  });
  if (!dbUser || !dbUser.active || dbUser.tokenVersion !== session.user.tokenVersion) {
    // Note: redirect() cannot clear the auth cookie (it throws NEXT_REDIRECT).
    // The stale cookie persists until proxy.ts handles the next request and
    // clears it (proxy.ts:28). This gap only matters for routes outside the
    // proxy matcher, which currently don't exist — all app routes are covered.
    redirect("/login");
  }
  if (opts?.roles && !opts.roles.includes(dbUser.role)) redirect("/overview");

  return { id: session.user.id, email: session.user.email, role: dbUser.role };
}

export async function requireAuthApi(
  opts?: { roles?: Role[] }
): Promise<SessionUser | { error: NextResponse }> {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  // Same defense-in-depth as requireAuth above.
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { active: true, tokenVersion: true, role: true },
  });
  if (!dbUser || !dbUser.active || dbUser.tokenVersion !== session.user.tokenVersion) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (opts?.roles && !opts.roles.includes(dbUser.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { id: session.user.id, email: session.user.email, role: dbUser.role };
}
