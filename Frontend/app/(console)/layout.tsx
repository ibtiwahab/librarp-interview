import { RequireAuth } from "@/components/layout/require-auth";
import { AppShell } from "@/components/layout/app-shell";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
