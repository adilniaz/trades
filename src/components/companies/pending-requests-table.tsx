"use client";

import { useState } from "react";
import { toast } from "sonner";
import { approveCompanyRequest, rejectCompanyRequest } from "@/app/admin/companies/actions";
import { Button } from "@/components/ui/button";
import { CompanyForm } from "./company-form";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import type { Company, User } from "@prisma/client";

type PendingRequest = Company & { requestedBy: Pick<User, "email"> | null };

export function PendingRequestsTable({ requests }: { requests: PendingRequest[] }) {
  const [approving, setApproving] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {requests.map((r) => (
        <div key={r.id} className="rounded border p-4">
          <p className="text-sm">
            <strong>{r.name}</strong> ({r.ticker}) — requested by {r.requestedBy?.email ?? "unknown"}
          </p>
          {approving === r.id ? (
            <CompanyForm
              initial={{
                name: r.name,
                ticker: r.ticker,
                nonCompliantPct: 0,
                dividendPeriod: "",
                nextDividendDate: undefined,
              }}
              disabledFields={["name", "ticker"]}
              onSubmit={async (data) => {
                const result = await approveCompanyRequest(r.id, data as unknown as FormData);
                if (result?.error) {
                  toast.error(typeof result.error === "string" ? result.error : "Approval failed");
                }
                setApproving(null);
              }}
              submitLabel="Approve"
            />
          ) : (
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => setApproving(r.id)}>
                Fill details &amp; approve
              </Button>
              <ConfirmationDialog
                title="Reject this request?"
                description={`${r.name} (${r.ticker}) will be permanently removed.`}
                confirmLabel="Reject"
                variant="destructive"
                onConfirm={async () => {
                  try {
                    await rejectCompanyRequest(r.id);
                  } catch {
                    toast.error("Failed to reject request");
                  }
                }}
              >
                <Button size="sm" variant="outline">
                  Reject
                </Button>
              </ConfirmationDialog>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
