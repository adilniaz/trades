import { requireAuth } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

function renderJson(v: unknown): string {
  if (v === null || v === undefined) return "—";
  return JSON.stringify(v);
}

export default async function AuditLogPage() {
  await requireAuth({ roles: ["ADMIN"] });

  const logs = await prisma.auditLog.findMany({
    include: { actor: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Audit Log</h1>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity ({logs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No audit log entries yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Before</TableHead>
                  <TableHead>After</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(entry.createdAt).toISOString().slice(0, 19).replace("T", " ")}
                    </TableCell>
                    <TableCell>{entry.actor.email}</TableCell>
                    <TableCell>{entry.action}</TableCell>
                    <TableCell>
                      {entry.targetType} #{entry.targetId.slice(0, 8)}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs font-mono">
                      {renderJson(entry.before)}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs font-mono">
                      {renderJson(entry.after)}
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
