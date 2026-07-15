import { describe, it, expect } from "vitest";
import { strongPassword } from "@/lib/validation/user";

describe("strongPassword", () => {
  it("rejects a regex-passing-but-easily-guessed password", () => {
    // Satisfies every character-class regex, but zxcvbn scores it low —
    // this is the exact example cited in password-strength.tsx's comment.
    const result = strongPassword.safeParse("Passw0rd!");
    expect(result.success).toBe(false);
  });

  it("accepts a genuinely strong password", () => {
    const result = strongPassword.safeParse("xK9$vQ2!mZ7#pL4w");
    expect(result.success).toBe(true);
  });

  it("still rejects on the pre-existing length requirement", () => {
    const result = strongPassword.safeParse("Ab1!");
    expect(result.success).toBe(false);
  });

  it("still rejects on the pre-existing character-class requirements", () => {
    const result = strongPassword.safeParse("alllowercase1!");
    expect(result.success).toBe(false);
  });
});
