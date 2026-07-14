"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateTransactionFee } from "@/app/admin/settings/actions";

type Props = {
  currentFee: number;
};

export function SettingsForm({ currentFee }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fee, setFee] = useState(String(currentFee));
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const num = Number(fee);
    if (isNaN(num) || num < 0 || !isFinite(num)) {
      setMessage({ type: "error", text: "Please enter a valid non-negative number" });
      return;
    }

    startTransition(async () => {
      try {
        const result = await updateTransactionFee({ transactionFee: num });
        if (result && "error" in result) {
          setMessage({ type: "error", text: result.error as string });
          return;
        }
        setMessage({ type: "success", text: "Saved." });
        router.refresh();
      } catch (e) {
        setMessage({ type: "error", text: e instanceof Error ? e.message : "Failed to save" });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="transactionFee">Fee per transaction</Label>
        <Input
          id="transactionFee"
          type="number"
          step="0.01"
          min="0"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        {message && (
          <p className={`text-sm ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
