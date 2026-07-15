import { z } from "zod";
import zxcvbn from "zxcvbn";

export const strongPassword = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Must contain an uppercase letter")
  .regex(/[a-z]/, "Must contain a lowercase letter")
  .regex(/[0-9]/, "Must contain a digit")
  .regex(/[^A-Za-z0-9]/, "Must contain a special character")
  // zxcvbn scores real guessability (pattern/dictionary/keyboard-walk aware),
  // not just character-class variety — a password like "Passw0rd!" satisfies
  // every regex above but still scores low here. Mirrors the client-side
  // meter in src/components/ui/password-strength.tsx, but this is what's
  // actually enforced.
  .refine((pwd) => zxcvbn(pwd).score >= 2, "Password is too easy to guess — choose something less predictable");

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
