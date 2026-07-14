"use client";

import { useState } from "react";
import { toast } from "sonner";
import { markPurified } from "@/app/(dashboard)/companies/[id]/actions";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

export function MarkPurifiedButton({ companyId, total }: { companyId: string; total: number }) {
  const [pending, setPending] = useState(false);

  if (total <= 0) return null;

  return (
    <ConfirmationDialog
      title="Mark as purified?"
      description={`This will mark ${total.toFixed(2)} as purified. This cannot be undone.`}
      confirmLabel="Mark as purified"
      onConfirm={async () => {
        setPending(true);
        try {
          await markPurified(companyId);
          toast.success("Marked as purified");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Failed to mark as purified");
        } finally {
          setPending(false);
        }
      }}
    >
      <Button size="sm" disabled={pending}>
        {pending ? "Marking…" : "Mark as purified"}
      </Button>
    </ConfirmationDialog>
  );
}
