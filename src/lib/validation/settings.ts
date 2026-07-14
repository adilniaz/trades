import { z } from "zod";
import { strongPassword } from "@/lib/validation/user";

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: strongPassword,
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const transactionFeeSchema = z.object({
  transactionFee: z.coerce
    .number()
    .min(0, "Fee must be 0 or more")
    .refine((v) => isFinite(v), "Fee must be a finite number"),
});

export type TransactionFeeInput = z.infer<typeof transactionFeeSchema>;
