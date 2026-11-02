import { ArrowRight, Bell, Coins, Download, FolderOpen, Mail, Receipt, RotateCcw, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Reveal, Stagger, StaggerItem, TapScale } from "@/components/motion/motion";
import { CtaBand, PageHero, Section } from "@/components/site/blocks";
import { StudioScene } from "@/components/studio/figure";
import { Still } from "@/components/studio/still";
import { Button } from "@/components/ui/button";
import { CTA_LABEL, signupUrl } from "@/content/site";
import { getMedia } from "@/lib/media";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Fonctionnalités",
  description:
    "Transformer une vidéo par IA, créer des images, suivre ses crédits et ses achats : ce que Yamboka permet aujourd’hui et ce qui arrive au lancement.",
  path: "/fonctionnalites",
});

/** Statut honnête de chaque capacité : disponible dans l'espace client, ou prévue au lancement. */
function Status({ now }: { now?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        now ? "bg-success/15 text-success" : "bg-accent/30 text-accent-foreground"
      }`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${now ? "bg-success" : "bg-accent-foreground/60"}`} />
      {now ? "Disponible dans votre espace" : "Au lancement"}
    </span>
  );
}

function Feature({ visual, reverse = false, children }: { visual: ReactNode; reverse?: boolean; children: ReactNode }) {
  return (
    <div className="grid items-center gap-8 md:grid-cols-2 md:gap-14">
      <Reveal className={reverse ? "md:order-2" : ""}>{visual}</Reveal>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

const LAUNCH = [
  { icon: Bell, title: "Suivi et notification", text: "La création se fait en arrière-plan : vous êtes prévenu quand elle est prête." },
  { icon: FolderOpen, title: "Vos créations, retrouvées", text: "Date, modèle utilisé, crédits consommés et date de suppression automatique." },
  { icon: Download, title: "Téléchargement et partage", text: "En MP4 ou JPG, sur WhatsApp ou par lien." },
  { icon: RotateCcw, title: "Crédits rendus si échec", text: "Réservés au lancement d’une création, restitués si elle échoue ou est annulée." },
  { icon: ShieldCheck, title: "Usage responsable", text: "Consentement à chaque création, signalement, modération sous 24 h." },
];

const NOW = [
  { icon: Mail, title: "Compte vérifié", text: "E-mail et mot de passe, ou Google, avec code de confirmation." },
  { icon: Coins, title: "Solde en crédits", text: "Votre solde et l’historique complet de ses mouvements." },
  { icon: Receipt, title: "Achats et reçus", text: "L’état de chaque achat de crédits et un reçu pour les achats réussis." },
];

export default function FeaturesPage() {
  const media = getMedia();
  const portrait = media.gallery.find((g) => g.id === "portrait")?.image;
  return (
    <>
      <PageHero
        path="/fonctionnalites"
        eyebrow="Fonctionnalités"
        title="Ce que Yamboka vous permet de faire"
        lead="Yamboka ouvre bientôt. Voici ce qui est déjà dans votre espace et ce qui arrive au lancement."
      />

      {/* Vidéo : la capacité principale */}
      <Section labelledBy="video-title">
        <Feature
          visual={
            <div className="mx-auto flex max-w-md items-center justify-center gap-2 sm:gap-3" aria-hidden>
              <div className="w-1/3 -rotate-3 rounded-xl border bg-card p-1 shadow-soft"><Still image={media.danseAvant} fallback={<StudioScene mode="video" label="" />} className="rounded-lg" /></div>
              <span className="text-2xl text-primary/60">+</span>
              <div className="w-1/3 rotate-3 rounded-xl border bg-card p-1 shadow-soft"><Still image={media.personnage} fallback={<StudioScene mode="photo" label="" />} className="rounded-lg" /></div>
              <ArrowRight className="size-6 shrink-0 text-primary/60" />
              <div className="relative w-[38%] rounded-xl border bg-card p-1 shadow-soft ring-4 ring-primary/15">
                <Still image={media.danseApres} fallback={<StudioScene mode="result" label="" />} className="rounded-lg" />
                {!media.danseApres && (
                  <span className="absolute bottom-2 right-2 rounded-full bg-background/90 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase">Démo</span>
                )}
              </div>
            </div>
          }
        >
          <Status />
          <h2 id="video-title" className="text-3xl font-bold sm:text-4xl">Transformez une vidéo</h2>
          <p className="text-lg text-muted-foreground">
            Choisissez une tendance, ajoutez votre selfie : Yamboka crée la vidéo. Pas besoin d’envoyer une vidéo de votre côté. Le prix s’affiche avant de confirmer.
          </p>
          <TapScale>
            <Button asChild size="lg" className="rounded-full px-7">
              <a href={signupUrl}>{CTA_LABEL} <ArrowRight aria-hidden /></a>
            </Button>
          </TapScale>
        </Feature>
      </Section>

      {/* Image : capacité complémentaire, plus discrète */}
      <Section tone="muted" labelledBy="image-title">
        <Feature
          reverse
          visual={
            <div className="mx-auto w-40 rotate-2 rounded-2xl border bg-card p-1.5 shadow-soft" aria-hidden>
              <Still image={portrait} fallback={<StudioScene mode="photo" tone="terracotta" label="" />} />
            </div>
          }
        >
          <Status />
          <h2 id="image-title" className="text-2xl font-bold sm:text-3xl">Des images aussi</h2>
          <p className="text-muted-foreground">Portraits et visuels de mode à partir d’un modèle ou d’une description. Un prix fixe par image, affiché avant confirmation.</p>
          <Link href="/galerie" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
            Voir des exemples <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Feature>
      </Section>

      {/* Ce qui est déjà dans l'espace client */}
      <Section labelledBy="now-title">
        <div className="mb-8 space-y-3">
          <Status now />
          <h2 id="now-title" className="text-3xl font-bold">Votre espace, dès aujourd’hui</h2>
        </div>
        <Stagger className="grid gap-8 md:grid-cols-3">
          {NOW.map((f) => (
            <StaggerItem key={f.title} className="flex gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-success/15 text-success"><f.icon className="size-5" aria-hidden /></span>
              <div>
                <h3 className="font-bold">{f.title}</h3>
                <p className="mt-1 text-muted-foreground">{f.text}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      {/* Le reste du parcours, au lancement */}
      <Section tone="muted" labelledBy="launch-title">
        <div className="mb-8 space-y-3">
          <Status />
          <h2 id="launch-title" className="text-3xl font-bold">Et pour finir, au lancement</h2>
        </div>
        <Stagger className="grid gap-x-12 gap-y-7 md:grid-cols-2">
          {LAUNCH.map((f) => (
            <StaggerItem key={f.title} className="flex gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent/30 text-accent-foreground"><f.icon className="size-5" aria-hidden /></span>
              <div>
                <h3 className="font-bold">{f.title}</h3>
                <p className="mt-1 text-muted-foreground">{f.text}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>
      <CtaBand />
    </>
  );
}
