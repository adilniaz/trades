"use client";
import { useMemo } from "react";
import zxcvbn from "zxcvbn";

export function PasswordStrengthMeter({ password }: { password: string }) {
  // zxcvbn scores real guessability (pattern/dictionary/keyboard-walk aware),
  // not just character-class variety — "Passw0rd!" scores low here despite
  // satisfying every regex class check the old heuristic used.
  const score = useMemo(() => {
    if (!password) return 0;
    return zxcvbn(password).score; // 0 (very weak) .. 4 (strong)
  }, [password]);

  const colors = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-lime-500", "bg-green-500"];
  const labels = ["Very weak", "Weak", "Fair", "Good", "Strong"];
  const filled = password ? score + 1 : 0;

  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded ${i < filled ? colors[score] : "bg-muted"}`} />
        ))}
      </div>
      {password.length > 0 && <p className="text-xs text-muted-foreground">{labels[score]}</p>}
    </div>
  );
}
