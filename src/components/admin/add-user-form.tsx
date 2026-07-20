"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import type { Role } from "@/types";
import { Copy, RefreshCw } from "lucide-react";

export function AddUserForm(): React.ReactElement {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("STUDENT");
  const [classGrade, setClassGrade] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [tempPwd, setTempPwd] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Name is required.";
    else if (name.length > 120) e.name = "Name must be 120 characters or fewer.";
    if (!email.trim()) e.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = "Enter a valid email address.";
    if (role === "STUDENT" && (classGrade === "" || Number(classGrade) < 6 || Number(classGrade) > 12)) {
      e.classGrade = "Select a class (6–12).";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setErrors({});
    if (!validate()) return;
    setBusy(true);
    setTempPwd(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          role,
          classGrade: role === "STUDENT" ? (classGrade === "" ? null : Number(classGrade)) : null,
        }),
      });
      const data = (await res.json()) as {
        tempPassword?: string;
        error?: string;
      };
      if (!res.ok) {
        push({ title: "Could not create user", description: data.error ?? "", variant: "destructive" });
        return;
      }
      setTempPwd(data.tempPassword ?? null);
      setName("");
      setEmail("");
      setClassGrade("");
      push({ title: "User created", description: email });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium">Add one user</h2>
        <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Open form"}
        </Button>
      </div>
      {open && (
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="STUDENT">Student</SelectItem>
                <SelectItem value="TEACHER">Teacher</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {role === "STUDENT" && (
            <div className="space-y-1.5">
              <Label htmlFor="class">Class</Label>
              <Select
                value={classGrade === "" ? "" : String(classGrade)}
                onValueChange={(v) => setClassGrade(parseInt(v, 10))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose class" />
                </SelectTrigger>
                <SelectContent>
                  {[6, 7, 8, 9, 10, 11, 12].map((g) => (
                    <SelectItem key={g} value={String(g)}>
                      Class {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.classGrade && <p className="text-xs text-destructive">{errors.classGrade}</p>}
            </div>
          )}
          <div className="sm:col-span-2 flex items-center justify-between gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
              Create user
            </Button>
            {tempPwd && (
              <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-xs">
                <span className="text-muted-foreground">Temp password:</span>
                <code className="font-mono">{tempPwd}</code>
                <button
                  type="button"
                  className="ml-1 inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    navigator.clipboard.writeText(tempPwd);
                  }}
                >
                  <Copy className="h-3 w-3" /> Copy
                </button>
              </div>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
