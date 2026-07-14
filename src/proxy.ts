import { NextResponse } from "next/server";
import { auth, SESSION_COOKIE_NAME } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  const isPublic = pathname === "/login";
  if (!session?.user && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Redirect already-authenticated users away from the login page.
  if (pathname === "/login" && session?.user) {
    return NextResponse.redirect(new URL("/overview", req.url));
  }

  if (session?.user) {
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { active: true, tokenVersion: true },
    });
    if (!dbUser || !dbUser.active || dbUser.tokenVersion !== session.user.tokenVersion) {
      const res = NextResponse.redirect(new URL("/login", req.url));
      // Clear the auth cookie so the browser doesn't keep sending the stale
      // JWT, which would cause an endless redirect loop for deactivated users.
      res.cookies.delete(SESSION_COOKIE_NAME);
      return res;
    }

    if (pathname.startsWith("/admin") && session.user.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/overview", req.url));
    }
  }

  // Per-request nonce for script-src, so inline scripts (React/Next's own
  // hydration payload — this app has no hand-written inline <script> tags)
  // can run without 'unsafe-inline'. Next detects the nonce in the CSP
  // header below and applies it to the scripts it injects automatically.
  // btoa (not Buffer) because this runs on the Edge runtime.
  const nonce = btoa(crypto.randomUUID());
  // Forwarded via a request header so a future Server Component can read it
  // with headers() and apply it to any hand-written inline <script> — none
  // exist today, so nothing currently needs to read this.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // HSTS — browsers must use HTTPS for this domain for the next 2 years.
  // In production this header should also be set by the reverse proxy (Caddy);
  // setting it here too is defense-in-depth per the AGENTS.md convention.
  res.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  );
  // CSP — defense-in-depth against XSS. The app renders user-submitted data
  // (company names, tickers) and React 19's JSX auto-escapes by default, but
  // CSP provides an independent second layer. script-src is nonce-scoped
  // (no 'unsafe-inline') so a future injection point couldn't execute an
  // arbitrary inline script even if one were ever introduced. style-src
  // stays 'unsafe-inline' — shadcn's chart component renders an inline
  // <style> tag from internal config (not user input), and style injection
  // isn't in the same risk class as script injection.
  res.headers.set(
    "Content-Security-Policy",
    `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'`
  );
  return res;
});

export const config = {
  matcher: ["/((?!\/api\/auth|_next\/static|_next\/image|favicon.ico).*)"],
};
