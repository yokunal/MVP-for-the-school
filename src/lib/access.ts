import { ALL_LIBRARIES, type Library } from "@/types";

/**
 * Centralised role-based access rules. The same rules apply on the server
 * (when fetching books) and on the client (when picking which libraries to
 * show in the nav), so we keep them in one place.
 */

export class AccessPolicy {
  /** Libraries the user is allowed to BROWSE / READ. */
  static accessibleLibraries(role: string, classGrade: number | null): Library[] {
    if (role === "ADMIN") return ALL_LIBRARIES;
    if (role === "TEACHER") {
      return [
        "GENERAL",
        "CLASS_6",
        "CLASS_7",
        "CLASS_8",
        "CLASS_9",
        "CLASS_10",
        "CLASS_11",
        "CLASS_12",
      ];
    }
    // STUDENT → GENERAL + their class library only.
    const libs: Library[] = ["GENERAL"];
    if (classGrade === 6) libs.push("CLASS_6");
    else if (classGrade === 7) libs.push("CLASS_7");
    else if (classGrade === 8) libs.push("CLASS_8");
    else if (classGrade === 9) libs.push("CLASS_9");
    else if (classGrade === 10) libs.push("CLASS_10");
    else if (classGrade === 11) libs.push("CLASS_11");
    else if (classGrade === 12) libs.push("CLASS_12");
    return libs;
  }

  /** Single-book read access check. */
  static canReadBook(
    role: string,
    classGrade: number | null,
    bookLibrary: string
  ): boolean {
    return (AccessPolicy.accessibleLibraries(role, classGrade) as string[]).includes(bookLibrary);
  }

  /** Whether the role gets an admin dashboard at all. */
  static isAdmin(role: string): boolean {
    return role === "ADMIN";
  }

  /** Map a class integer (6..12) to its matching library, or null. */
  static libraryForGrade(grade: number | null): Library | null {
    if (grade === 6) return "CLASS_6";
    if (grade === 7) return "CLASS_7";
    if (grade === 8) return "CLASS_8";
    if (grade === 9) return "CLASS_9";
    if (grade === 10) return "CLASS_10";
    if (grade === 11) return "CLASS_11";
    if (grade === 12) return "CLASS_12";
    return null;
  }
}
