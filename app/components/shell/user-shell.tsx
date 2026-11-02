import { Coins } from "lucide-react";
import Link from "next/link";
import { QueryProvider } from "@/components/query-provider";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ClapperLoader } from "@/components/studio/clapper";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { formatFcfa, formatNumber } from "@/lib/format";
import { AppShell } from "./app-shell";

/** Coque de l'espace utilisateur. Lit la session : doit toujours être rendue dans un <Suspense>. */
export async function UserShell({ children }: { children: ReactNode }) {
  const user = await requireUser();
  // Un administrateur n'est pas présenté avec l'interface client : son espace est /admin.
  if (user.role === "ADMIN") redirect("/admin");
  const valueFcfa = user.credits * user.creditValueFcfa;
  return (
    <AppShell
      variant="user"
      user={{ name: `${user.firstName} ${user.lastName}`.trim(), email: user.email, role: user.role }}
      headerExtra={
        <>
        <QueryProvider><NotificationBell /></QueryProvider>
        <Link
          href="/app/credits"
          className="flex h-10 items-center gap-1.5 rounded-full bg-secondary px-3 text-sm font-semibold outline-none transition-colors hover:bg-secondary/70 focus-visible:ring-3 focus-visible:ring-ring/60 active:scale-95"
          aria-label={`Solde : ${user.credits} crédits. Ouvrir mes crédits`}
          title={`≈ ${formatFcfa(valueFcfa)}`}
        >
          <Coins className="size-4 text-primary" aria-hidden />
          {formatNumber(user.credits)}
          <span className="hidden font-normal text-muted-foreground sm:inline">
            crédits · ≈ {formatFcfa(valueFcfa)}
          </span>
        </Link>
        </>
      }
    >
      {children}
    </AppShell>
  );
}

export function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center">
      <ClapperLoader label="Chargement de votre espace…" />
    </div>
  );
}
