"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setUserActive, resetUserPassword } from "@/app/admin/users/actions";

type Props = {
  userId: string;
  active: boolean;
};

export function UserRowActions({ userId, active }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const handleToggleActive = () => {
    startTransition(async () => {
      const result = await setUserActive(userId, !active);
      if (result?.error) alert(result.error);
      router.refresh();
    });
  };

  const handleResetPassword = () => {
    setResettingId(userId);
    setNewPassword("");
  };

  return (
    <div>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="xs"
          disabled={isPending}
          onClick={handleToggleActive}
        >
          {active ? "Deactivate" : "Activate"}
        </Button>
        <Button
          variant="outline"
          size="xs"
          disabled={isPending}
          onClick={handleResetPassword}
        >
          Reset password
        </Button>
      </div>
      {resettingId === userId && (
        <div className="mt-2 space-y-2 rounded border p-2">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (min 8 chars)"
            className="w-full rounded border px-2 py-1 text-sm"
          />
          <div className="flex gap-1">
            <Button
              size="xs"
              disabled={isPending}
              onClick={async () => {
                if (newPassword.length < 8) {
                  alert("Password must be at least 8 characters");
                  return;
                }
                startTransition(async () => {
                  const result = await resetUserPassword(userId, { password: newPassword });
                  if (result?.error) {
                    if (typeof result.error === "string") {
                      alert(result.error);
                    } else {
                      alert("Validation failed: " + JSON.stringify(result.error));
                    }
                  } else {
                    alert("Password reset successfully.");
                  }
                  setResettingId(null);
                  router.refresh();
                });
              }}
            >
              Confirm
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => setResettingId(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
