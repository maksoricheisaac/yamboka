import Link from "next/link";
import { FOOTER_NAV, SITE } from "@/content/site";
import { Logo } from "./logo";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t bg-secondary/40">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">
            « Ya mboka » : du pays, de chez nous. Une plateforme née à Brazzaville, pensée pour l’Afrique du mobile
            money.
          </p>
        </div>
        {FOOTER_NAV.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <h2 className="mb-3 font-heading text-sm font-semibold">{group.title}</h2>
            <ul className="space-y-2">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t">
        <p className="mx-auto w-full max-w-6xl px-4 py-5 text-xs text-muted-foreground sm:px-6">
          © {SITE.name}. Brazzaville, République du Congo. Les exemples présentés sur ce site
          sont des démonstrations illustratives.
        </p>
      </div>
    </footer>
  );
}
