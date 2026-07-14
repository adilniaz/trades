"use client";

import { useState } from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CompanyForm } from "@/components/companies/company-form";
import { approveCompanyRequest, rejectCompanyRequest } from "@/app/admin/companies/actions";
import type { CompanyInput } from "@/lib/validation/company";

type PendingRequest = {
  id: string;
  name: string;
  ticker: string;
  requestedBy: { email: string } | null;
};

type Props = {
  requests: PendingRequest[];
};

export function PendingRequestsTable({ requests }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async (requestId: string, data: CompanyInput) => {
    // Build FormData from the validated company input
    const fd = new FormData();
    fd.set("name", data.name);
    fd.set("ticker", data.ticker);
    fd.set("nonCompliantPct", String(data.nonCompliantPct));
    if (data.dividendPeriod) fd.set("dividendPeriod", data.dividendPeriod);
    if (data.nextDividendDate) fd.set("nextDividendDate", data.nextDividendDate.toISOString());

    const result = await approveCompanyRequest(requestId, fd);
    if (result?.error) {
      setError(typeof result.error === "string" ? result.error : "Validation error");
      return result;
    }
    setExpandedId(null);
  };

  const handleReject = async (requestId: string) => {
    if (!confirm("Are you sure you want to reject this request? It will be permanently deleted.")) {
      return;
    }
    try {
      await rejectCompanyRequest(requestId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reject");
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button className="ml-2 underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company Name</TableHead>
            <TableHead>Ticker</TableHead>
            <TableHead>Requested By</TableHead>
            <TableHead className="w-64">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((req) => (
            <TableRow key={req.id}>
              <TableCell className="font-medium">{req.name}</TableCell>
              <TableCell>
                <Badge variant="outline">{req.ticker}</Badge>
              </TableCell>
              <TableCell>{req.requestedBy?.email ?? "—"}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
                  >
                    {expandedId === req.id ? "Cancel" : "Fill details & approve"}
                  </Button>
                  <Button
                    variant="destructive"
                    size="xs"
                    onClick={() => handleReject(req.id)}
                  >
                    Reject
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {expandedId && (
        <div className="rounded-lg border p-4">
          <h3 className="mb-4 font-medium">Fill details & approve</h3>
          <CompanyForm
            initial={
              requests.find((r) => r.id === expandedId) ?? undefined
            }
            onSubmit={(data) => handleApprove(expandedId, data)}
            submitLabel="Approve"
            disabledFields={["name", "ticker"]}
          />
        </div>
      )}
    </div>
  );
}
