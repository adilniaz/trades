"use client";

import { useState } from "react";
import { markPurified } from "@/app/(dashboard)/companies/[id]/actions";
import { Button } from "@/components/ui/button";

export function MarkPurifiedButton({ companyId, total }: { companyId: string; total: number }) {
  const [pending, setPending] = useState(false);

  if (total <= 0) return null;

  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={async () => {
        if (!window.confirm(`Mark ${total.toFixed(2)} as purified?`)) return;
        setPending(true);
        try {
          await markPurified(companyId);
        } catch (e) {
          window.alert(e instanceof Error ? e.message : "Failed to mark as purified");
        } finally {
          setPending(false);
        }
      }}
    >
      {pending ? "Marking…" : "Mark as purified"}
    </Button>
  );
}
