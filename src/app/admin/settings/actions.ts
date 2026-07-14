"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth-guard";
import { getSettings, setTransactionFee } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { transactionFeeSchema } from "@/lib/validation/settings";

export async function updateTransactionFee(input: unknown) {
  const admin = await requireAuth({ roles: ["ADMIN"] });

  const parsed = transactionFeeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { transactionFee } = parsed.data;
  const before = await getSettings();

  await prisma.$transaction(async (tx) => {
    await setTransactionFee(transactionFee, tx);
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action: "setting.transactionFee",
        targetType: "Setting",
        targetId: "transactionFee",
        before: { transactionFee: before.transactionFee },
        after: { transactionFee },
      },
    });
  });

  revalidatePath("/admin/settings");
  return { success: true };
}
