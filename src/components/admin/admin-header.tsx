"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { LogOut } from "lucide-react";

export function AdminHeader(): React.ReactElement {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="container flex h-14 items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href="/admin" className="font-semibold">
            School Library · Admin
          </Link>
          <nav className="hidden gap-4 text-sm md:flex">
            <Link href="/admin" className="hover:underline">
              Dashboard
            </Link>
            <Link href="/admin/books" className="hover:underline">
              Books
            </Link>
            <Link href="/admin/users" className="hover:underline">
              Users
            </Link>
            <Link href="/admin/audit-log" className="hover:underline">
              Audit Log
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
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
