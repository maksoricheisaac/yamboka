import { ShieldCheck } from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { ShellSkeleton } from "@/components/shell/user-shell";
import { requireUser } from "@/lib/auth";

/** Porte d'entrée de l'administration : rôle ADMIN exigé (l'API le vérifie à nouveau sur chaque route). */
async function AdminGate({ children }: { children: ReactNode }) {
  const user = await requireUser({ role: "ADMIN" });
  return (
    <AppShell
      variant="admin"
      user={{ name: `${user.firstName} ${user.lastName}`.trim(), email: user.email, role: user.role }}
      headerExtra={
        <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          <ShieldCheck className="size-3.5" aria-hidden /> <span className="sr-only sm:not-sr-only">Administrateur</span>
        </span>
      }
    >
      {children}
    </AppShell>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}
