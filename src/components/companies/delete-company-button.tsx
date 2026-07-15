"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteCompany } from "@/app/(dashboard)/admin/companies/actions";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

export function DeleteCompanyButton({ id }: { id: string }) {
  const router = useRouter();
  const [forceWarning, setForceWarning] = useState<string | null>(null);

  async function handleDelete() {
    try {
      const result = await deleteCompany(id);
      if (result) {
        const err = (result as { error?: unknown }).error;
        if (typeof err === "object" && err !== null && "count" in err) {
          setForceWarning(`${(err as { count: number }).count} user(s) hold live transactions. Delete anyway?`);
          return;
        }
        if (err) toast.error(typeof err === "string" ? err : "Failed to delete company");
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete company");
    }
  }

  async function handleForceDelete() {
    try {
      const result = await deleteCompany(id, true);
      if (result) {
        const err = (result as { error?: unknown }).error;
        if (err) toast.error(typeof err === "string" ? err : "Failed to delete company");
      }
      setForceWarning(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete company");
    }
  }

  if (forceWarning) {
    return (
      <ConfirmationDialog
        title="Delete company with active holdings?"
        description={forceWarning}
        confirmLabel="Delete anyway"
        variant="destructive"
        onConfirm={handleForceDelete}
      >
        <Button size="sm" variant="outline">
          Delete
        </Button>
      </ConfirmationDialog>
    );
  }

  return (
    <ConfirmationDialog
      title="Delete this company?"
      description="This will soft-delete the company. Transactions are preserved."
      confirmLabel="Delete"
      variant="destructive"
      onConfirm={handleDelete}
    >
      <Button size="sm" variant="outline">
        Delete
      </Button>
    </ConfirmationDialog>
  );
}
