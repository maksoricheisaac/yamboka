import { ThemeToggle } from "@/components/theme-toggle";
import { HeaderAuthActions } from "./auth-actions";
import { Logo } from "./logo";
import { DesktopNav, MobileNav } from "./nav";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-backdrop-filter:bg-background/70">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Aller au contenu
      </a>
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <DesktopNav />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <HeaderAuthActions />
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
