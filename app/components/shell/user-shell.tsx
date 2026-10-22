import type { ReactNode } from "react";
import { Coins } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { Logo } from "@/components/logo";
import { QueryProvider } from "@/components/query-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireUser } from "@/lib/auth";
import { formatFcfa, formatNumber } from "@/lib/format";
import { UserNav } from "./user-nav";

/** Coque de l'espace utilisateur. Lit la session : doit toujours être rendue dans un <Suspense>. */
export async function UserShell({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const valueFcfa = user.credits * user.creditValueFcfa;
  return (
    <>
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-1 sm:gap-2">
            <p
              className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm font-semibold"
              aria-label={`Solde : ${user.credits} crédits`}
              title={`≈ ${formatFcfa(valueFcfa)}`}
            >
              <Coins className="size-4 text-primary" aria-hidden />
              {formatNumber(user.credits)}
              <span className="hidden font-normal text-muted-foreground sm:inline">
                crédits · ≈ {formatFcfa(valueFcfa)}
              </span>
            </p>
            <span className="hidden text-sm text-muted-foreground md:inline">{user.firstName}</span>
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>
      <UserNav />
      <main id="contenu" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <QueryProvider>{children}</QueryProvider>
      </main>
    </>
  );
}

export function ShellSkeleton() {
  return (
    <div className="flex flex-1 items-center justify-center" role="status" aria-live="polite">
      <p className="text-muted-foreground">Chargement de votre espace…</p>
    </div>
  );
}
