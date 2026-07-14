"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import type { Role } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

function NavLinks({
  role,
  pendingCount,
}: {
  role: Role;
  pendingCount?: number;
}) {
  return (
    <div className="space-y-2">
      <Link href="/overview" className="block">Overview</Link>
      <Link href="/import-transactions" className="block">Import transactions</Link>
      <Link href="/request-company" className="block">Request a company</Link>
      <Link href="/settings" className="block">Settings</Link>
      {role === "ADMIN" && (
        <>
          <hr className="my-2" />
          <Link href="/admin/companies" className="flex items-center">
            Admin: Companies
            {pendingCount !== undefined && pendingCount > 0 && (
              <Badge variant="secondary" className="ml-1">{pendingCount}</Badge>
            )}
          </Link>
          <Link href="/admin/users" className="block">Admin: Users</Link>
          <Link href="/admin/settings" className="block">Admin: Settings</Link>
          <Link href="/admin/reports" className="block">Admin: Reports</Link>
          <Link href="/admin/audit-log" className="block">Admin: Audit log</Link>
        </>
      )}
    </div>
  );
}

export function Sidebar({
  role,
  pendingCount,
}: {
  role: Role;
  pendingCount?: number;
}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/rules-of-hooks -- standard next-themes hydration pattern
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  const themeToggle = (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="block text-left text-xs text-muted-foreground"
    >
      {theme === "dark" ? "☀ Light" : "☾ Dark"}
    </button>
  );

  const signOutBtn = (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="block text-left"
    >
      Sign out
    </button>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden lg:flex w-56 shrink-0 flex-col border-r p-4 text-sm">
        <div className="flex-1">
          <NavLinks role={role} pendingCount={pendingCount} />
        </div>
        <div className="space-y-2">
          {themeToggle}
          {signOutBtn}
        </div>
      </nav>

      {/* Mobile header + sheet */}
      <div className="lg:hidden flex items-center p-4 border-b">
        <Sheet>
          <SheetTrigger>
            <Button variant="outline" size="sm" type="button">☰</Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-56 p-4 text-sm">
            <div className="flex flex-col h-full">
              <div className="flex-1">
                <NavLinks role={role} pendingCount={pendingCount} />
              </div>
              <div className="space-y-2 pt-4 border-t mt-4">
                {themeToggle}
                {signOutBtn}
              </div>
            </div>
          </SheetContent>
        </Sheet>
        <span className="ml-3 text-sm font-medium">Trades</span>
      </div>
    </>
  );
}
