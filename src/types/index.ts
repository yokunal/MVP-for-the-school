// Shared types and value re-exports for use across the app.
//
// In Postgres mode `Library` and `Role` came from `@prisma/client` as enums.
// When we switched to SQLite for local testing, Prisma no longer supports
// enums on SQLite, so the canonical values live here.

export const Library = {
  GENERAL: "GENERAL",
  CLASS_6: "CLASS_6",
  CLASS_7: "CLASS_7",
  CLASS_8: "CLASS_8",
  CLASS_9: "CLASS_9",
  CLASS_10: "CLASS_10",
  CLASS_11: "CLASS_11",
  CLASS_12: "CLASS_12",
} as const;
export type Library = (typeof Library)[keyof typeof Library];

export const Role = {
  ADMIN: "ADMIN",
  TEACHER: "TEACHER",
  STUDENT: "STUDENT",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

// Legacy aliases so old imports keep compiling during the SQLite test.
export type { Library as LibraryType, Role as RoleType };

export const LIBRARY_LABELS: Record<Library, string> = {
  GENERAL: "General",
  CLASS_6: "Class 6",
  CLASS_7: "Class 7",
  CLASS_8: "Class 8",
  CLASS_9: "Class 9",
  CLASS_10: "Class 10",
  CLASS_11: "Class 11",
  CLASS_12: "Class 12",
};

export const ALL_LIBRARIES: Library[] = [
  "GENERAL",
  "CLASS_6",
  "CLASS_7",
  "CLASS_8",
  "CLASS_9",
  "CLASS_10",
  "CLASS_11",
  "CLASS_12",
];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  TEACHER: "Teacher",
  STUDENT: "Student",
};
