import { describe, it, expect, vi } from "vitest";
import { requireAuthApi } from "@/lib/auth-guard";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
const { mockFindUnique } = vi.hoisted(() => ({
  mockFindUnique: vi.fn().mockResolvedValue({ active: true, tokenVersion: 0 }),
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mockFindUnique },
  },
}));

type SessionLike = {
  user: { id: string; email: string; role: string; tokenVersion: number };
} | null;

describe("requireAuthApi", () => {
  it("returns a 401 NextResponse when there is no session", async () => {
    mockAuth.mockResolvedValue(null as SessionLike);
    const result = await requireAuthApi();
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error.status).toBe(401);
  });

  it("returns a 403 NextResponse when the role doesn't match", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "1", email: "user@example.com", role: "USER", tokenVersion: 0 },
    } as SessionLike);
    const result = await requireAuthApi({ roles: ["ADMIN"] });
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error.status).toBe(403);
  });

  it("returns the session user when authenticated with a matching role", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "1", email: "admin@example.com", role: "ADMIN", tokenVersion: 0 },
    } as SessionLike);
    mockFindUnique.mockResolvedValue({ active: true, tokenVersion: 0, role: "ADMIN" });
    const result = await requireAuthApi({ roles: ["ADMIN"] });
    expect("error" in result).toBe(false);
    if (!("error" in result)) expect(result.role).toBe("ADMIN");
  });

  it("returns the session user when no roles are required, regardless of role", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "1", email: "user@example.com", role: "USER", tokenVersion: 0 },
    } as SessionLike);
    mockFindUnique.mockResolvedValue({ active: true, tokenVersion: 0, role: "USER" });
    const result = await requireAuthApi();
    expect("error" in result).toBe(false);
  });

  it("uses the DB role, not a stale/wrong session role, to grant access", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "1", email: "user@example.com", role: "USER", tokenVersion: 0 },
    } as SessionLike);
    mockFindUnique.mockResolvedValue({ active: true, tokenVersion: 0, role: "ADMIN" });
    const result = await requireAuthApi({ roles: ["ADMIN"] });
    expect("error" in result).toBe(false);
    if (!("error" in result)) expect(result.role).toBe("ADMIN");
  });

  it("uses the DB role, not a stale session role, to deny access", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "1", email: "admin@example.com", role: "ADMIN", tokenVersion: 0 },
    } as SessionLike);
    mockFindUnique.mockResolvedValue({ active: true, tokenVersion: 0, role: "USER" });
    const result = await requireAuthApi({ roles: ["ADMIN"] });
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error.status).toBe(403);
  });

  it("returns 401 when user is deactivated", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "1", email: "test@example.com", role: "USER", tokenVersion: 0 },
    } as never);
    mockFindUnique.mockResolvedValue({ active: false, tokenVersion: 0 });
    const result = await requireAuthApi();
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error.status).toBe(401);
  });

  it("returns 401 when tokenVersion does not match", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "1", email: "test@example.com", role: "USER", tokenVersion: 5 },
    } as never);
    mockFindUnique.mockResolvedValue({ active: true, tokenVersion: 10 });
    const result = await requireAuthApi();
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error.status).toBe(401);
  });

  it("returns 401 when user no longer exists (db returns null)", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "1", email: "test@example.com", role: "USER", tokenVersion: 0 },
    } as never);
    mockFindUnique.mockResolvedValue(null);
    const result = await requireAuthApi();
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error.status).toBe(401);
  });
});
