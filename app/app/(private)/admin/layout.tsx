import { ShieldCheck } from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { Logo } from "@/components/logo";
import { ShellSkeleton } from "@/components/shell/user-shell";
import { requireUser } from "@/lib/auth";

/** Porte d'entrée de l'administration : rôle ADMIN exigé (l'API le vérifie à nouveau sur chaque route). */
async function AdminGate({ children }: { children: ReactNode }) {
  const user = await requireUser({ role: "ADMIN" });
  return (
    <>
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo href="/admin" />
            <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              <ShieldCheck className="size-3.5" aria-hidden /> Administration
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main id="contenu" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}
