import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/site/blocks";
import { Button } from "@/components/ui/button";
import { whatsappLink } from "@/content/site";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contactez l’équipe Yamboka par WhatsApp pour toute question sur le service, les crédits ou un contenu.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const link = whatsappLink("Bonjour Yamboka, j’ai une question :");

  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Parlons-en"
        lead="Une question sur le service, vos crédits ou une création ? Écrivez-nous."
      />
      <Section labelledBy="contact-title">
        <h2 id="contact-title" className="sr-only">Nous joindre</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border bg-card p-6 shadow-soft">
            <MessageCircle className="size-7 text-primary" aria-hidden />
            <h3 className="mt-3 text-xl font-bold">WhatsApp</h3>
            {link ? (
              <>
                <p className="mt-2 text-muted-foreground">Le moyen le plus rapide de joindre l’équipe.</p>
                <Button asChild size="lg" className="mt-5">
                  <a href={link} target="_blank" rel="noopener noreferrer">
                    Écrire sur WhatsApp
                    <span className="sr-only"> (s’ouvre dans un nouvel onglet)</span>
                  </a>
                </Button>
              </>
            ) : (
              <p className="mt-2 text-muted-foreground">
                Le contact WhatsApp sera indiqué ici à l’ouverture du service. En attendant, consultez la{" "}
                <Link href="/faq" className="underline underline-offset-4">FAQ</Link>.
              </p>
            )}
          </div>
          <div className="rounded-2xl border bg-card p-6 shadow-soft">
            <h3 className="text-xl font-bold">Signaler un contenu</h3>
            <p className="mt-2 text-muted-foreground">
              Un formulaire de signalement ouvert à tous sera disponible à l’ouverture du service. Les contenus
              signalés seront examinés sous 24 heures, et un contenu manifestement illicite masqué immédiatement.
              Voir la{" "}
              <Link href="/charte-utilisation" className="underline underline-offset-4">charte d’utilisation</Link>.
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}
