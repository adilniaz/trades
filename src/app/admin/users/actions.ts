"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { createUserSchema, resetPasswordSchema } from "@/lib/validation/user";

// ---------------------------------------------------------------------------
// Create user
// ---------------------------------------------------------------------------

export async function createUser(input: unknown) {
  const admin = await requireAuth({ roles: ["ADMIN"] });

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { email, password, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: { email: ["A user with this email already exists"] } };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { email, passwordHash, role },
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "user.create",
      targetType: "User",
      targetId: user.id,
      before: Prisma.DbNull,
      after: { email: user.email, role: user.role, active: user.active },
    },
  });

  revalidatePath("/admin/users");
  return { success: true, id: user.id };
}

// ---------------------------------------------------------------------------
// Activate / deactivate user
// ---------------------------------------------------------------------------

export async function setUserActive(id: string, active: boolean) {
  const admin = await requireAuth({ roles: ["ADMIN"] });

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return { error: "User not found" };

  const user = await prisma.user.update({
    where: { id },
    data: {
      active,
      // Bump tokenVersion so any active sessions for this user are
      // invalidated immediately on the next proxy check.
      tokenVersion: { increment: 1 },
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: active ? "user.activate" : "user.deactivate",
      targetType: "User",
      targetId: user.id,
      before: { active: existing.active },
      after: { active: user.active },
    },
  });

  revalidatePath("/admin/users");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Reset user password
// ---------------------------------------------------------------------------

export async function resetUserPassword(id: string, input: unknown) {
  const admin = await requireAuth({ roles: ["ADMIN"] });

  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return { error: "User not found" };

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  await prisma.user.update({
    where: { id },
    data: {
      passwordHash,
      tokenVersion: { increment: 1 },
      failedAttempts: 0,
      lockedUntil: null,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "user.resetPassword",
      targetType: "User",
      targetId: id,
      before: { note: "password hash (redacted)" },
      after: { note: "password hash (redacted)" },
    },
  });

  revalidatePath("/admin/users");
  return { success: true };
}
