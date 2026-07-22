'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useTheme } from 'next-themes';
import type { Role } from '@prisma/client';
import {
  type LucideIcon,
  Building2Icon,
  FileBarChart2Icon,
  FilePlus2Icon,
  LayoutDashboardIcon,
  LogOutIcon,
  MenuIcon,
  MoonIcon,
  ScrollTextIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  StampIcon,
  SunIcon,
  UploadIcon,
  UsersIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const userNav: NavItem[] = [
  { href: '/overview', label: 'Overview', icon: LayoutDashboardIcon },
  {
    href: '/import-transactions',
    label: 'Import transactions',
    icon: UploadIcon,
  },
  { href: '/request-company', label: 'Request a company', icon: FilePlus2Icon },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
];

const adminNav: NavItem[] = [
  { href: '/admin/companies', label: 'Companies', icon: Building2Icon },
  { href: '/admin/users', label: 'Users', icon: UsersIcon },
  { href: '/admin/settings', label: 'Settings', icon: SlidersHorizontalIcon },
  { href: '/admin/reports', label: 'Reports', icon: FileBarChart2Icon },
  { href: '/admin/audit-log', label: 'Audit log', icon: ScrollTextIcon },
];

function Wordmark() {
  return (
    <div className="flex items-center gap-2 px-3 py-1">
      <StampIcon
        className="size-5 text-gold-text"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <span className="font-heading text-lg font-semibold tracking-tight">
        Trades
      </span>
    </div>
  );
}

function NavLink({
  item,
  active,
  pendingCount,
}: {
  item: NavItem;
  active: boolean;
  pendingCount?: number;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-2.5 rounded-sm px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-sidebar-primary font-medium text-sidebar-primary-foreground'
          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{item.label}</span>
      {pendingCount !== undefined && pendingCount > 0 && (
        <Badge variant="secondary">{pendingCount}</Badge>
      )}
    </Link>
  );
}

function NavLinks({
  role,
  pendingCount,
  pathname,
}: {
  role: Role;
  pendingCount?: number;
  pathname: string;
}) {
  const items = role === 'ADMIN' ? adminNav : userNav;
  return (
    <div className="space-y-1">
      {items.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          active={pathname.startsWith(item.href)}
          pendingCount={
            item.href === '/admin/companies' ? pendingCount : undefined
          }
        />
      ))}
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
  const pathname = usePathname();

  // theme is unknown on the server (next-themes resolves it client-side from
  // localStorage/system preference), so this differs between server and
  // client render on first paint. suppressHydrationWarning accepts that one-
  // time mismatch instead of warning, matching the pattern layout.tsx uses
  // for the same next-themes hydration gap on <html>.
  const themeToggle = (
    <button
      type="button"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-left text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      suppressHydrationWarning
    >
      {theme === 'dark' ? (
        <SunIcon className="size-4" aria-hidden="true" />
      ) : (
        <MoonIcon className="size-4" aria-hidden="true" />
      )}
      <span suppressHydrationWarning>
        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
      </span>
    </button>
  );

  const signOutBtn = (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-left text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <LogOutIcon className="size-4" aria-hidden="true" />
      Sign out
    </button>
  );

  return (
    <>
      {/* Desktop sidebar — deliberately "ever-dark": the nav rail reads as a
          bound ledger cover and doesn't flip with the page's light/dark mode. */}
      <nav className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground lg:flex">
        <Wordmark />
        <div className="mt-4 flex-1 overflow-y-auto">
          <NavLinks
            role={role}
            pendingCount={pendingCount}
            pathname={pathname}
          />
        </div>
        <div className="space-y-1 border-t border-sidebar-border pt-3">
          {themeToggle}
          {signOutBtn}
        </div>
      </nav>

      {/* Mobile header + sheet */}
      <div className="flex items-center gap-3 border-b p-4 lg:hidden">
        <Sheet>
          <SheetTrigger
            render={<Button variant="outline" size="icon-sm" type="button" />}
          >
            <MenuIcon className="size-4" aria-hidden="true" />
            <span className="sr-only">Open navigation</span>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-64 bg-sidebar p-3 text-sidebar-foreground"
          >
            <div className="flex h-full flex-col">
              <Wordmark />
              <div className="mt-4 flex-1 overflow-y-auto">
                <NavLinks
                  role={role}
                  pendingCount={pendingCount}
                  pathname={pathname}
                />
              </div>
              <div className="space-y-1 border-t border-sidebar-border pt-3">
                {themeToggle}
                {signOutBtn}
              </div>
            </div>
          </SheetContent>
        </Sheet>
        <Wordmark />
      </div>
    </>
  );
}
