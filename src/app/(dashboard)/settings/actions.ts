"use server";

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { changePasswordSchema } from "@/lib/validation/settings";

export async function changePassword(input: unknown) {
  const user = await requireAuth();
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) throw new Error("Password change failed");
  const data = parsed.data;

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!dbUser) throw new Error("Password change failed");
  const valid = await bcrypt.compare(data.currentPassword, dbUser.passwordHash);
  if (!valid) throw new Error("Password change failed");

  const passwordHash = await bcrypt.hash(data.newPassword, 12);
  // Bump tokenVersion so this device's own current session is also forced
  // to re-authenticate — consistent with how admin-initiated resets behave
  // (Session 5), and closes the loop on tokenVersion actually meaning
  // something (Session 2's proxy.ts enforces it).
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, tokenVersion: { increment: 1 } },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "user.changePassword",
      targetType: "User",
      targetId: user.id,
      before: Prisma.DbNull,
      after: Prisma.DbNull,
    },
  });
}
