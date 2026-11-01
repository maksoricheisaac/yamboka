"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { CTA_LABEL, MAIN_NAV, loginUrl, signupUrl } from "@/content/site";

/** Accueil : correspondance exacte (sinon « / » serait actif partout). */
function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigation principale" className="hidden items-center gap-0.5 lg:flex">
      {MAIN_NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`relative rounded-full px-4 py-2 text-sm font-medium transition-colors hover:bg-muted ${
              active ? "bg-primary/10 text-primary" : "text-foreground/80"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Ouvrir le menu">
          <Menu className="size-5" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[min(88vw,22rem)]">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
          <SheetDescription className="sr-only">Navigation du site Yamboka</SheetDescription>
        </SheetHeader>
        <nav aria-label="Navigation mobile" className="flex flex-col gap-1 px-4">
          {MAIN_NAV.map((item) => (
            <SheetClose asChild key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                className="rounded-xl px-3 py-3.5 text-base font-medium hover:bg-muted aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary"
              >
                {item.label}
              </Link>
            </SheetClose>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 p-4">
          <Button asChild size="lg" className="rounded-full">
            <a href={signupUrl}>{CTA_LABEL}</a>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-full">
            <a href={loginUrl}>Connexion</a>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
