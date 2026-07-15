"use server";

import { unstable_rethrow } from "next/navigation";
import { signIn } from "@/lib/auth";
import { loginSchema } from "@/lib/validation/auth";
import { logger } from "@/lib/logger";
import { isIpThrottled, recordFailedAttempt } from "@/lib/ip-rate-limit";
import { getClientIp } from "@/lib/get-client-ip";

export async function loginAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Invalid email or password" };

  const ip = await getClientIp();
  // IP-keyed backstop against credential stuffing across many accounts —
  // per-account lockout (src/lib/rate-limit.ts) already covers repeated
  // attempts against one email. Same generic error either way, so a
  // throttled attempt can't be distinguished from a wrong password.
  if (isIpThrottled(ip)) {
    return { error: "Invalid email or password" };
  }

  try {
    await signIn("credentials", {
      ...parsed.data,
      redirectTo: "/overview",
    });
    return {};
  } catch (err) {
    // signIn() throws Next's internal redirect error on *success* too (it
    // calls redirect() itself) — re-throw framework control-flow errors so
    // the redirect actually happens, instead of counting a successful login
    // as a failed attempt below.
    unstable_rethrow(err);

    // Always return a generic message — non-AuthError exceptions (Prisma
    // errors, DB connection failures, null dereferences) must not leak
    // stack traces or internal details to the client.
    if (err instanceof Error) {
      logger.error({ msg: err.message }, "Login error");
    }
    recordFailedAttempt(ip);
    return { error: "Invalid email or password" };
  }
}
