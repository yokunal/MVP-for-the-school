"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

const NAV_LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/books", label: "Books" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/audit-log", label: "Audit Log" },
] as const;

export function AdminHeader(): React.ReactElement {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="container flex h-14 items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href="/admin" className="font-semibold">
            School Library · Admin
          </Link>
          {/* Desktop nav */}
          <nav className="hidden gap-4 text-sm md:flex">
            {NAV_LINKS.map(({ href, label }) => (
              <Link key={href} href={href} className="hover:underline">
                {label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Mobile nav trigger */}
        <div className="flex items-center gap-1 md:hidden">
          <Sheet
            trigger={
              <Button variant="ghost" size="icon" aria-label="Open admin menu">
                <Menu className="h-5 w-5" />
              </Button>
            }
          >
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                {label}
              </Link>
            ))}
            <Link
              href="/dashboard"
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
            >
              Student view
            </Link>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </Sheet>
        </div>

        {/* Desktop right-side items */}
        <div className="hidden items-center gap-3 text-sm md:flex">
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:underline"
          >
            Student view
          </Link>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="inline-flex items-center gap-1 text-muted-foreground hover:underline"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
