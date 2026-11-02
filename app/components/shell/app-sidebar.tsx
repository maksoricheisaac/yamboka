"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { SITE_URL } from "@/lib/site";
import { NAV_BY_VARIANT, isActive, type ShellVariant } from "@/lib/nav";

/**
 * Barre latérale flottante (shadcn sidebar-04), repliable en rail d'icônes sur ordinateur (Ctrl/⌘ + B)
 * et tiroir sur mobile. Le menu dépend de l'espace : client ou administration.
 */
export function AppSidebar({ variant }: { variant: ShellVariant }) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar variant="floating" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Yamboka">
              <Link href={variant === "admin" ? "/admin" : "/app"} onClick={closeOnMobile}>
                <LogoMark size={32} className="shrink-0" />
                <span className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
                  <span className="font-heading text-base font-bold">Yamboka</span>
                  <span className="text-xs text-muted-foreground">
                    {variant === "admin" ? "Centre de pilotage" : "Mon espace"}
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV_BY_VARIANT[variant].map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const active = isActive(pathname, item);
                if (item.soon)
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton aria-disabled tabIndex={-1} tooltip={`${item.title} — bientôt disponible`}>
                        <item.icon aria-hidden />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                      <SidebarMenuBadge className="rounded-full bg-accent/40 px-2 text-[0.65rem] font-semibold text-accent-foreground">Bientôt</SidebarMenuBadge>
                    </SidebarMenuItem>
                  );
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <Link href={item.href} aria-current={active ? "page" : undefined} onClick={closeOnMobile}>
                        <item.icon aria-hidden />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Voir le site Yamboka">
              <a href={SITE_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden />
                <span>Voir le site</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
