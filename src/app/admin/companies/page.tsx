import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { activeCompanyWhere } from "@/lib/prisma-where";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PendingRequestsTable } from "@/components/companies/pending-requests-table";
import { DeleteCompanyButton } from "@/components/companies/delete-company-button";
import { CompanySearch } from "@/components/companies/company-search";

const DEFAULT_PAGE_SIZE = 20;

export default async function AdminCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; q?: string }>;
}) {
  await requireAuth({ roles: ["ADMIN"] });

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.pageSize) || DEFAULT_PAGE_SIZE));
  const query = sp.q?.trim() || "";

  const approvedWhere = activeCompanyWhere({
    status: "APPROVED" as const,
    ...(query
      ? { OR: [{ name: { contains: query } }, { ticker: { contains: query } }] }
      : {}),
  });

  const [approved, approvedTotal, pending] = await Promise.all([
    prisma.company.findMany({
      where: approvedWhere,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.company.count({ where: approvedWhere }),
    prisma.company.findMany({
      where: activeCompanyWhere({ status: "PENDING" as const }),
      include: { requestedBy: { select: { email: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const baseUrl = `/admin/companies${query ? `?q=${encodeURIComponent(query)}` : ""}`;

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Company Management</h1>
        <div className="flex gap-2">
          <Link href="/admin/companies/import">
            <Button variant="outline">Bulk import (CSV)</Button>
          </Link>
          <Link href="/admin/companies/new">
            <Button>Add company</Button>
          </Link>
        </div>
      </div>

      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Requests ({pending.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <PendingRequestsTable requests={pending} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Approved Companies ({approvedTotal})</CardTitle>
              <Suspense fallback={null}>
                <CompanySearch />
              </Suspense>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={[
              { key: "name", header: "Name" },
              { key: "ticker", header: "Ticker" },
              { key: "nonCompliantPct", header: "Non-compliant %" },
              { key: "dividendPeriod", header: "Dividend period" },
              { key: "nextDividend", header: "Next dividend" },
              { key: "actions", header: "Actions", className: "w-32" },
            ]}
            rows={approved.map((c) => ({
              name: <span className="font-medium">{c.name}</span>,
              ticker: c.ticker,
              nonCompliantPct: `${Number(c.nonCompliantPct)}%`,
              dividendPeriod: c.dividendPeriod ?? "—",
              nextDividend: c.nextDividendDate
                ? new Date(c.nextDividendDate).toISOString().slice(0, 10)
                : "—",
              actions: (
                <div className="flex gap-1">
                  <Link href={`/admin/companies/${c.id}/edit`}>
                    <Button variant="outline" size="xs">
                      Edit
                    </Button>
                  </Link>
                  <DeleteCompanyButton id={c.id} />
                </div>
              ),
            }))}
            totalCount={approvedTotal}
            page={page}
            pageSize={pageSize}
            baseUrl={baseUrl}
          />
        </CardContent>
      </Card>
    </div>
  );
}
