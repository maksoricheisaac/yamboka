import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page introuvable", robots: { index: false } };

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="contenu" className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-start justify-center gap-5 px-4 py-24 sm:px-6">
        <p className="font-heading text-6xl font-bold text-primary">404</p>
        <h1 className="text-3xl font-bold">Cette page n’existe pas</h1>
        <p className="text-lg text-muted-foreground">Le lien est peut-être incorrect, ou la page a été déplacée.</p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/">Retour à l’accueil</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/tarifs">Voir les tarifs</Link>
          </Button>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
