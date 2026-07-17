"use client";

import { SessionProvider } from "next-auth/react";
import { ToastHost } from "@/components/ui/toast";

export function Providers({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <SessionProvider>
      <ToastHost>{children}</ToastHost>
    </SessionProvider>
  );
}
