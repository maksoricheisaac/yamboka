import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { CTA_LABEL, loginUrl, signupUrl } from "@/content/site";
import { Logo } from "./logo";
import { DesktopNav, MobileNav } from "./nav";

/**
 * Barre flottante : une capsule collée en haut, qui suit le défilement (utile pour retrouver « Tarifs » et le CTA
 * sur une longue page). Le fond est presque opaque (90 %) : le contraste du texte reste suffisant sur tout contenu.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Aller au contenu
      </a>
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-2 rounded-full border bg-background/90 pl-4 pr-2 shadow-soft backdrop-blur supports-backdrop-filter:bg-background/80 sm:h-16 sm:pl-5">
        <Logo />
        <DesktopNav />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button asChild variant="ghost" className="hidden rounded-full sm:inline-flex">
            <a href={loginUrl}>Connexion</a>
          </Button>
          <Button asChild className="hidden rounded-full bg-accent text-accent-foreground hover:bg-accent/85 sm:inline-flex">
            <a href={signupUrl}>{CTA_LABEL}</a>
          </Button>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
