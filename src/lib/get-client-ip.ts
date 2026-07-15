import { headers } from "next/headers";

// Trusts the LAST entry in X-Forwarded-For, not the first. This app sits
// behind a Caddy reverse proxy (see docker-compose.yml's external caddy_net)
// whose default reverse_proxy behavior appends its own view of the client IP
// to any existing header rather than overwriting it — so once Caddy is
// active in production, the trusted hop is the last entry, not the first
// (which is attacker-controlled if a client sets the header itself).
export function extractClientIp(forwardedFor: string | null | undefined): string {
  if (!forwardedFor) return "unknown";
  return forwardedFor.split(",").pop()?.trim() || "unknown";
}

export async function getClientIp(): Promise<string> {
  const h = await headers();
  return extractClientIp(h.get("x-forwarded-for"));
}
