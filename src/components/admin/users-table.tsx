"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Copy, RefreshCw, ShieldOff, ShieldCheck, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Role } from "@/types";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  classGrade: number | null;
  isActive: boolean;
  createdAt: string;
};

export function UsersTable({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}): React.ReactElement {
  const router = useRouter();
  const { push } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);

  async function resetPassword(id: string): Promise<void> {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}/reset-password`, { method: "POST" });
      const data = (await res.json()) as { tempPassword?: string; error?: string };
      if (!res.ok) {
        push({ title: "Could not reset", description: data.error ?? "", variant: "destructive" });
        return;
      }
      if (data.tempPassword) {
        await navigator.clipboard.writeText(data.tempPassword).catch(() => {});
        push({
          title: "New temp password (copied)",
          description: data.tempPassword,
        });
      }
    } finally {
      setBusyId(null);
      setResetTarget(null);
    }
  }

  async function toggleActive(id: string, next: boolean): Promise<void> {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        push({ title: "Could not update", description: data.error ?? "", variant: "destructive" });
        return;
      }
      push({ title: next ? "Reactivated" : "Deactivated" });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Class</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground">
              No users yet.
            </TableCell>
          </TableRow>
        ) : (
          users.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.name}</TableCell>
              <TableCell className="font-mono text-xs">{u.email}</TableCell>
              <TableCell>
                <Badge variant="outline">{u.role}</Badge>
              </TableCell>
              <TableCell>{u.classGrade ? `Class ${u.classGrade}` : "—"}</TableCell>
              <TableCell>
                {u.isActive ? (
                  <Badge variant="secondary">Active</Badge>
                ) : (
                  <Badge variant="destructive">Disabled</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === u.id}
                    onClick={() => setResetTarget(u)}
                  >
                    <Copy className="h-3.5 w-3.5" /> Reset pwd
                  </Button>
                  {u.id !== currentUserId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === u.id}
                      onClick={() => toggleActive(u.id, !u.isActive)}
                    >
                      {u.isActive ? (
                        <>
                          <ShieldOff className="h-3.5 w-3.5" /> Disable
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-3.5 w-3.5" /> Enable
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>

    {/* Reset password confirmation dialog */}
    <Dialog open={resetTarget !== null} onOpenChange={(o) => { if (!o) setResetTarget(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Reset password for <span className="font-medium text-foreground">{resetTarget?.name}</span>
            {" "}({resetTarget?.email})? A new temporary password will be generated and
            shown after confirmation.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setResetTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="default"
            disabled={busyId !== null}
            onClick={() => {
              const id = resetTarget?.id;
              if (id) resetPassword(id);
            }}
          >
            {busyId ? <RefreshCw className="mr-1 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-1 h-4 w-4" />}
            Reset password
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
