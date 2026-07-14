import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { Sidebar } from "@/components/layout/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();

  let pendingCount: number | undefined;
  if (user.role === "ADMIN") {
    pendingCount = await prisma.company.count({
      where: { status: "PENDING", deletedAt: null },
    });
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar role={user.role} pendingCount={pendingCount} />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
