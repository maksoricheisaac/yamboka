"use client";

import { usePathname } from "next/navigation";
import { Fragment, type ReactNode } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserNav, type NavUser } from "./user-nav";
import { crumbsFor, type ShellVariant } from "@/lib/nav";

/** Topbar : menu, fil d'Ariane (page courante en dernier), puis à droite zone libre, thème et menu du compte. */
export function ShellHeader({ variant, user, children }: { variant: ShellVariant; user: NavUser; children?: ReactNode }) {
  const crumbs = crumbsFor(variant, usePathname());
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 md:px-6">
      <SidebarTrigger className="-ml-1 size-10 lg:size-8" />
      <Separator orientation="vertical" className="mr-1 data-vertical:h-4 data-vertical:self-auto" />
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap">
          {crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1;
            return (
              <Fragment key={`${crumb.label}-${i}`}>
                <BreadcrumbItem className={last ? "min-w-0" : "hidden sm:inline-flex"}>
                  {last || !crumb.href ? (
                    <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!last && <BreadcrumbSeparator className="hidden sm:block" />}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        {children}
        <ThemeToggle />
        <UserNav user={user} profileHref={variant === "admin" ? "/admin/profil" : "/app/profil"} settingsHref={variant === "admin" ? undefined : "/app/parametres"} />
      </div>
    </header>
  );
}
