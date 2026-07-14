"use client";
import { useMemo } from "react";

export function PasswordStrengthMeter({ password }: { password: string }) {
  const strength = useMemo(() => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  }, [password]);

  const colors = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-lime-500", "bg-green-500"];
  const labels = ["Very weak", "Weak", "Fair", "Good", "Strong"];

  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded ${i < strength ? colors[strength - 1] : "bg-muted"}`} />
        ))}
      </div>
      {password.length > 0 && <p className="text-xs text-muted-foreground">{labels[Math.max(0, strength - 1)]}</p>}
    </div>
  );
}
