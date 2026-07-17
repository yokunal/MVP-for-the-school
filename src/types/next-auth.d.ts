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
    };
  }

  interface User {
    id: string;
    name: string;
    email: string;
    role: Role;
    classGrade: number | null;
    isActive: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    classGrade: number | null;
  }
}
