"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PasswordStrengthMeter } from "@/components/ui/password-strength";
import { setUserActive, resetUserPassword } from "@/app/(dashboard)/admin/users/actions";

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
      if (result?.error) {
        toast.error(typeof result.error === "string" ? result.error : "Failed");
      } else {
        toast.success(active ? "User deactivated" : "User activated");
      }
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
          <PasswordStrengthMeter password={newPassword} />
          <div className="flex gap-1">
            <Button
              size="xs"
              disabled={isPending}
              onClick={async () => {
                if (newPassword.length < 8) {
                  toast.error("Password must be at least 8 characters");
                  return;
                }
                startTransition(async () => {
                  const result = await resetUserPassword(userId, { password: newPassword });
                  if (result?.error) {
                    if (typeof result.error === "string") {
                      toast.error(result.error);
                    } else {
                      toast.error("Validation failed");
                    }
                  } else {
                    toast.success("Password reset successfully");
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
