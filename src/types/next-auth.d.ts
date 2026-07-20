import type { Role } from "@/types";
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: Role;
      classGrade: number | null;
      mustChangePassword: boolean;
      sessionVersion: number;
    };
  }

  interface User {
    id: string;
    name: string;
    email: string;
    role: Role;
    classGrade: number | null;
    isActive: boolean;
    mustChangePassword: boolean;
    sessionVersion: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    classGrade: number | null;
    mustChangePassword: boolean;
    sessionVersion: number;
  }
}
