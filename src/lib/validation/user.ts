import { z } from "zod";

export const strongPassword = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Must contain an uppercase letter")
  .regex(/[a-z]/, "Must contain a lowercase letter")
  .regex(/[0-9]/, "Must contain a digit")
  .regex(/[^A-Za-z0-9]/, "Must contain a special character");

export const createUserSchema = z.object({
  email: z.string().email(),
  password: strongPassword,
  role: z.enum(["ADMIN", "USER"]),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const resetPasswordSchema = z.object({
  password: strongPassword,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
