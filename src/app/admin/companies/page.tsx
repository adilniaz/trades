import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PendingRequestsTable } from "@/components/companies/pending-requests-table";
import { DeleteCompanyButton } from "@/components/companies/delete-company-button";

export default async function AdminCompaniesPage() {
  await requireAuth({ roles: ["ADMIN"] });

  const [approved, pending] = await Promise.all([
    prisma.company.findMany({
      where: { status: "APPROVED", deletedAt: null },
      orderBy: { name: "asc" },
    }),
    prisma.company.findMany({
      where: { status: "PENDING", deletedAt: null },
      include: { requestedBy: { select: { email: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

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
          <CardTitle>Approved Companies ({approved.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {approved.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No approved companies yet. Add one or bulk import.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Non-compliant %</TableHead>
                  <TableHead>Dividend period</TableHead>
                  <TableHead>Next dividend</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approved.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.ticker}</TableCell>
                    <TableCell>{Number(c.nonCompliantPct)}%</TableCell>
                    <TableCell>{c.dividendPeriod ?? "—"}</TableCell>
                    <TableCell>
                      {c.nextDividendDate
                        ? new Date(c.nextDividendDate).toISOString().slice(0, 10)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Link href={`/admin/companies/${c.id}/edit`}>
                          <Button variant="outline" size="xs">
                            Edit
                          </Button>
                        </Link>
                        <DeleteCompanyButton companyId={c.id} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
