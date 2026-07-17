import Papa from "papaparse";
import { z } from "zod";
import { randomBytes } from "crypto";
import type { Role, Library } from "@/types";

/**
 * CSV bulk user import: parse → validate → preview → commit.
 *
 * Columns expected: name, email, role, class
 *   - name:  required string
 *   - email: required, valid email, no duplicates within the file
 *   - role:  ADMIN | TEACHER | STUDENT
 *   - class: required only for STUDENT (must be 6..12)
 */

const baseRow = z.object({
  name: z.string().trim().min(1, "name is required"),
  email: z.string().trim().toLowerCase().email("invalid email"),
  role: z.enum(["ADMIN", "TEACHER", "STUDENT"]),
  class: z.string().optional().default(""),
});

const CLASS_TO_LIBRARY: Record<string, Library | null> = {
  "6": "CLASS_6",
  "7": "CLASS_7",
  "8": "CLASS_8",
  "9": "CLASS_9",
  "10": "CLASS_10",
  "11": "CLASS_11",
  "12": "CLASS_12",
};

export type CsvPreviewRow = {
  row: number;
  name: string;
  email: string;
  role: Role;
  classGrade: number | null;
  status: "ok" | "error";
  errors: string[];
};

export class CsvUserParser {
  static parse(text: string): CsvPreviewRow[] {
    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
    });
    const rawRows = result.data;
    const emailCounts = new Map<string, number>();
    for (const row of rawRows) {
      const e = (row.email ?? "").trim().toLowerCase();
      if (e) emailCounts.set(e, (emailCounts.get(e) ?? 0) + 1);
    }

    const out: CsvPreviewRow[] = [];
    rawRows.forEach((row, idx) => {
      const parsed = baseRow.safeParse(row);
      if (!parsed.success) {
        out.push({
          row: idx + 2, // header + 1-based
          name: (row.name ?? "").trim(),
          email: (row.email ?? "").trim(),
          role: (row.role ?? "").toUpperCase() as Role,
          classGrade: null,
          status: "error",
          errors: parsed.error.issues.map((i) => i.message),
        });
        return;
      }
      const errors: string[] = [];
      const email = parsed.data.email;
      if ((emailCounts.get(email) ?? 0) > 1) {
        errors.push("duplicate email in file");
      }
      let classGrade: number | null = null;
      const classStr = parsed.data.class.trim();
      if (parsed.data.role === "STUDENT") {
        if (!classStr) {
          errors.push("class is required for students");
        } else if (!(classStr in CLASS_TO_LIBRARY)) {
          errors.push("class must be 6..12");
        } else {
          classGrade = parseInt(classStr, 10);
        }
      } else if (classStr) {
        errors.push("class only applies to students");
      }
      out.push({
        row: idx + 2,
        name: parsed.data.name,
        email,
        role: parsed.data.role as Role,
        classGrade,
        status: errors.length ? "error" : "ok",
        errors,
      });
    });
    return out;
  }

  /** Generate a friendly temporary password (12 chars, mixed). */
  static generateTempPassword(): string {
    const alpha =
      "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const bytes = randomBytes(12);
    let s = "";
    for (let i = 0; i < 12; i++) {
      s += alpha[bytes[i] % alpha.length];
    }
    return s;
  }
}

export function isLibraryEnum(s: string): s is Library {
  return [
    "GENERAL",
    "CLASS_6",
    "CLASS_7",
    "CLASS_8",
    "CLASS_9",
    "CLASS_10",
    "CLASS_11",
    "CLASS_12",
  ].includes(s);
}
