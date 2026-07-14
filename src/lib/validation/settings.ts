import { z } from "zod";

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const transactionFeeSchema = z.object({
  transactionFee: z.coerce
    .number()
    .min(0, "Fee must be 0 or more")
    .refine((v) => isFinite(v), "Fee must be a finite number"),
});

export type TransactionFeeInput = z.infer<typeof transactionFeeSchema>;
