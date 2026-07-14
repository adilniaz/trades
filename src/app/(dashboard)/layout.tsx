import { requireAuth } from "@/lib/auth-guard";
import { Sidebar } from "@/components/layout/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();
  return (
    <div className="flex min-h-screen">
      <Sidebar role={user.role} />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
