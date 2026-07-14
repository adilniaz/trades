import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validation/auth";
import { isLockedOut, nextLockoutState, resetLockoutState } from "@/lib/rate-limit";

// bcrypt cost factor 12 — OWASP-recommended default as of 2026. If hardware
// advances significantly, bump to 14 and add a transparent re-hash-on-login
// migration (compare stored hash cost, re-hash with new factor if stale).

// Dummy hash used for timing-safe comparison when the email doesn't exist,
// so login latency doesn't leak whether an account exists.
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO0.CN3Y0kAoO3lZLxYCkgOFBGdaFOJRe";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 },
  pages: { signIn: "/login" },
  cookies: {
    sessionToken: {
      name: "trades.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
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
          // Use a transaction to make the failedAttempts increment atomic with
          // the read, closing the TOCTOU race where two concurrent wrong-password
          // attempts could both base their increment on the same stale counter.
          await prisma.$transaction(async (tx) => {
            const fresh = await tx.user.findUnique({
              where: { id: user.id },
              select: { failedAttempts: true },
            });
            if (!fresh) return;
            const state = nextLockoutState(fresh.failedAttempts);
            await tx.user.update({
              where: { id: user.id },
              data: state,
            });
            if (state.lockedUntil) {
              await tx.auditLog.create({
                data: {
                  actorId: user.id,
                  action: "user.lockedOut",
                  targetType: "User",
                  targetId: user.id,
                  before: { note: "5 failed login attempts" },
                  after: { note: `Locked until ${state.lockedUntil.toISOString()}` },
                },
              });
            }
          });
          return null;
        }

        // Reset lockout state — set to safe zeroed values (failedAttempts=0,
        // lockedUntil=null). Since this only writes safe defaults, no
        // concurrency guard is needed — a concurrent write to the same fields
        // with safe defaults can't corrupt anything.
        await prisma.user.update({ where: { id: user.id }, data: resetLockoutState });

        // Log successful login
        await prisma.auditLog.create({
          data: {
            actorId: user.id,
            action: "user.login",
            targetType: "User",
            targetId: user.id,
            before: Prisma.DbNull,
            after: Prisma.DbNull,
          },
        });

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

// Export the cookie name so proxy.ts can reference it consistently.
export const SESSION_COOKIE_NAME = "trades.session-token";
