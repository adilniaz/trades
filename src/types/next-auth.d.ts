import { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      role: Role;
      tokenVersion: number;
    };
  }

  interface User {
    role: Role;
    tokenVersion: number;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
    tokenVersion: number;
  }
}
