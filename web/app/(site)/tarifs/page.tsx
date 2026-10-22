import type { Metadata } from "next";
import { CtaBand, PageHero, Section, SectionHeading } from "@/components/site/blocks";
import { PackCard } from "@/components/site/pack-card";
import { Badge } from "@/components/ui/badge";
import { CREDIT_VALUE_FCFA, PACKS, PRICES, formatFcfa } from "@/content/offer";

export const metadata: Metadata = {
  title: "Tarifs",
  description:
    "Packs de crédits de 500 à 25 000 FCFA, sans abonnement. 1 crédit = 25 FCFA : une vidéo de 10 secondes coûte 1 000 FCFA, une image 50 FCFA.",
  alternates: { canonical: "/tarifs" },
};

export default function PricingPage() {
  return (
    <>
      <PageHero
        eyebrow="Tarifs"
        title="Payez à la demande, à partir de 500 FCFA"
        lead={`1 crédit = ${formatFcfa(CREDIT_VALUE_FCFA)}. Pas d’abonnement : vous achetez des crédits, puis vous les dépensez quand vous créez.`}
      />

      <Section labelledBy="packs-title">
        <SectionHeading
          id="packs-title"
          title="Les packs de crédits"
          lead="Plus le pack est grand, plus le bonus est important. Les crédits achetés sont valables 12 mois."
        />
        <div className="grid gap-6 pt-3 sm:grid-cols-2 lg:grid-cols-3">
          {PACKS.map((pack) => (
            <PackCard key={pack.name} pack={pack} />
          ))}
        </div>
        <p className="mt-6 rounded-xl border border-accent/60 bg-accent/15 p-4 text-sm">
          <strong>État du service :</strong> le paiement par MTN Mobile Money et Airtel Money sera ouvert au
          lancement. Les boutons ci-dessus mènent à la création de compte ; aucun paiement n’est réalisé sur ce site.
        </p>
      </Section>

      <Section tone="muted" labelledBy="costs-title">
        <SectionHeading
          id="costs-title"
          title="Combien coûte chaque création ?"
          lead="Le coût exact est toujours affiché, en crédits et en FCFA, avant que vous confirmiez."
        />
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <caption className="sr-only">Coût par type de création</caption>
            <thead className="border-b bg-muted/60">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Création</th>
                <th scope="col" className="px-4 py-3 font-semibold">Crédits</th>
                <th scope="col" className="px-4 py-3 font-semibold">Prix</th>
                <th scope="col" className="px-4 py-3 font-semibold">Disponibilité</th>
              </tr>
            </thead>
            <tbody>
              {PRICES.map((row) => (
                <tr key={row.label} className="border-b last:border-0">
                  <th scope="row" className="px-4 py-3 font-medium">
                    {row.label}
                    <span className="block text-xs font-normal text-muted-foreground">{row.detail}</span>
                  </th>
                  <td className="px-4 py-3">{row.credits}</td>
                  <td className="px-4 py-3">{row.fcfa}</td>
                  <td className="px-4 py-3">
                    {row.available ? (
                      <Badge>Au lancement</Badge>
                    ) : (
                      <Badge variant="secondary">Prévu plus tard</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          La durée d’une vidéo est arrondie à la seconde supérieure. Les tarifs peuvent évoluer ; le prix affiché au
          moment de confirmer fait foi.
        </p>
      </Section>

      <Section labelledBy="rules-title">
        <SectionHeading id="rules-title" title="Les règles des crédits" />
        <ul className="grid gap-4 md:grid-cols-2">
          {[
            "Les crédits ne sont ni remboursables en argent, ni transférables entre comptes.",
            "Les crédits achetés expirent 12 mois après l’achat ; les plus anciens sont utilisés en premier.",
            "Les crédits de bienvenue (4 par défaut) sont attribués une seule fois, après vérification de l’e-mail, et expirent après 30 jours.",
            "Les crédits sont réservés au lancement d’une création et restitués si elle échoue ou est annulée.",
          ].map((t) => (
            <li key={t} className="rounded-xl border bg-card p-4">
              {t}
            </li>
          ))}
        </ul>
      </Section>
      <CtaBand />
    </>
  );
}
