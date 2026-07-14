"use server";

import { signIn } from "@/lib/auth";
import { loginSchema } from "@/lib/validation/auth";
import { logger } from "@/lib/logger";

export async function loginAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Invalid email or password" };

  try {
    await signIn("credentials", {
      ...parsed.data,
      redirectTo: "/overview",
    });
    return {};
  } catch (err) {
    // Always return a generic message — non-AuthError exceptions (Prisma
    // errors, DB connection failures, null dereferences) must not leak
    // stack traces or internal details to the client.
    if (err instanceof Error) {
      logger.error({ msg: err.message }, "Login error");
    }
    return { error: "Invalid email or password" };
  }
}
