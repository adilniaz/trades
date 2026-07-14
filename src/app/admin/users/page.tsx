import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { UserRowActions } from "@/app/admin/users/user-row-actions";

const DEFAULT_PAGE_SIZE = 20;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}) {
  await requireAuth({ roles: ["ADMIN"] });

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.pageSize) || DEFAULT_PAGE_SIZE));

  const [users, totalCount] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count(),
  ]);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">User Management</h1>
        <Link href="/admin/users/new">
          <Button>Add user</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Users ({totalCount})</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={[
              { key: "email", header: "Email" },
              { key: "role", header: "Role" },
              { key: "status", header: "Status" },
              { key: "actions", header: "Actions", className: "w-48" },
            ]}
            rows={users.map((u) => ({
              email: <span className="font-medium">{u.email}</span>,
              role: u.role,
              status: u.active ? (
                <span className="text-green-600 font-medium">Active</span>
              ) : (
                <span className="text-red-600 font-medium">Inactive</span>
              ),
              actions: <UserRowActions userId={u.id} active={u.active} />,
            }))}
            totalCount={totalCount}
            page={page}
            pageSize={pageSize}
            baseUrl="/admin/users"
          />
        </CardContent>
      </Card>
    </div>
  );
}
