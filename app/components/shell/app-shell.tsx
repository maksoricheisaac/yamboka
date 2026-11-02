import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { QueryProvider } from "@/components/query-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ShellVariant } from "@/lib/nav";
import { AppSidebar } from "./app-sidebar";
import { BottomTabs } from "./bottom-tabs";
import type { NavUser } from "./user-nav";
import { ShellHeader } from "./shell-header";

/**
 * Coque commune des espaces connectés (client et administration) : barre latérale repliable, en-tête, contenu.
 * L'état ouvert/fermé de la barre est mémorisé dans un cookie ; on le lit ici pour éviter tout « saut » au chargement.
 * Lit les cookies : doit toujours être rendue dans un <Suspense>.
 */
export async function AppShell({
  variant,
  user,
  headerExtra,
  children,
}: {
  variant: ShellVariant;
  user: NavUser;
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={defaultOpen} data-space={variant}>
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Aller au contenu
        </a>
        <AppSidebar variant={variant} />
        <SidebarInset className="min-w-0">
          <ShellHeader variant={variant} user={user}>{headerExtra}</ShellHeader>
          <main id="contenu" className={variant === "user" ? "flex-1 p-4 pb-24 md:p-6 lg:pb-6" : "flex-1 p-4 md:p-6"}>
            <div className="mx-auto w-full max-w-6xl">
              <QueryProvider>{children}</QueryProvider>
            </div>
          </main>
        </SidebarInset>
        {variant === "user" && <BottomTabs />}
        <Toaster />
      </SidebarProvider>
    </TooltipProvider>
  );
}
