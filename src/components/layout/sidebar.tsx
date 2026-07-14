"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import type { Role } from "@prisma/client";

export function Sidebar({ role }: { role: Role }) {
  return (
    <nav className="flex w-56 shrink-0 flex-col border-r p-4 text-sm">
      <div className="flex-1 space-y-2">
        <Link href="/overview" className="block">Overview</Link>
        <Link href="/request-company" className="block">Request a company</Link>
        <Link href="/settings" className="block">Settings</Link>
        {role === "ADMIN" && (
          <>
            <hr className="my-2" />
            <Link href="/admin/companies" className="block">Admin: Companies</Link>
            <Link href="/admin/users" className="block">Admin: Users</Link>
            <Link href="/admin/settings" className="block">Admin: Settings</Link>
            <Link href="/admin/reports" className="block">Admin: Reports</Link>
            <Link href="/admin/audit-log" className="block">Admin: Audit log</Link>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="block text-left"
      >
        Sign out
      </button>
    </nav>
  );
}
