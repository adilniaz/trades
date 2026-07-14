"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth-guard";
import { getSettings, setTransactionFee } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { transactionFeeSchema } from "@/lib/validation/settings";

export async function updateTransactionFee(input: unknown) {
  const admin = await requireAuth({ roles: ["ADMIN"] });
  const { transactionFee } = transactionFeeSchema.parse(input);
  const before = await getSettings();
  await setTransactionFee(transactionFee);
  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "setting.transactionFee",
      targetType: "Setting",
      targetId: "transactionFee",
      before: { transactionFee: before.transactionFee },
      after: { transactionFee },
    },
  });
  revalidatePath("/admin/settings");
}
