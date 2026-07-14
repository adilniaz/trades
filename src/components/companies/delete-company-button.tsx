"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteCompany } from "@/app/admin/companies/actions";

type Props = {
  companyId: string;
};

export function DeleteCompanyButton({ companyId }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = () => {
    if (!confirm("Are you sure you want to delete this company?")) return;

    startTransition(async () => {
      const result = await deleteCompany(companyId);
      if (result.error === "HOLD_LIVE_TRANSACTIONS") {
        const forceful = confirm(
          `This company has active (non-deleted) transactions. Deleting will soft-delete the company but leave transactions intact. Continue?`
        );
        if (!forceful) return;
        const retry = await deleteCompany(companyId, true);
        if (retry.error) {
          window.alert(String(retry.error));
        }
      } else if (result.error) {
        setError(String(result.error));
      }
    });
  };

  return (
    <>
      <Button
        variant="destructive"
        size="xs"
        onClick={handleDelete}
        disabled={pending}
      >
        {pending ? "Deleting…" : "Delete"}
      </Button>
      {error && (
        <span className="text-xs text-red-600 ml-1">{error}</span>
      )}
    </>
  );
}
