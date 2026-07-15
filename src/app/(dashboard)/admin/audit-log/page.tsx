import { requireAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { DataTable } from '@/components/ui/data-table';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { PageHeading } from '@/components/layout/page-heading';

function renderJson(v: unknown): string {
  if (v === null || v === undefined) return '—';
  return JSON.stringify(v);
}

const DEFAULT_PAGE_SIZE = 30;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}) {
  await requireAuth({ roles: ['ADMIN'] });

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(sp.pageSize) || DEFAULT_PAGE_SIZE),
  );

  const [logs, totalCount] = await Promise.all([
    prisma.auditLog.findMany({
      include: { actor: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeading>Audit log</PageHeading>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity ({totalCount})</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={[
              { key: 'when', header: 'When' },
              { key: 'admin', header: 'Admin' },
              { key: 'action', header: 'Action' },
              { key: 'target', header: 'Target' },
              { key: 'before', header: 'Before' },
              { key: 'after', header: 'After' },
            ]}
            rows={logs.map((entry) => ({
              when: (
                <span className="whitespace-nowrap font-mono tabular-nums">
                  {new Date(entry.createdAt)
                    .toISOString()
                    .slice(0, 19)
                    .replace('T', ' ')}
                </span>
              ),
              admin: entry.actor.email,
              action: entry.action,
              target: `${entry.targetType} #${entry.targetId.slice(0, 8)}`,
              before: (
                <span className="max-w-xs truncate text-xs font-mono block">
                  {renderJson(entry.before)}
                </span>
              ),
              after: (
                <span className="max-w-xs truncate text-xs font-mono block">
                  {renderJson(entry.after)}
                </span>
              ),
            }))}
            totalCount={totalCount}
            page={page}
            pageSize={pageSize}
            baseUrl="/admin/audit-log"
          />
        </CardContent>
      </Card>
    </div>
  );
}
