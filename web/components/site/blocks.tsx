import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { TapScale } from "@/components/motion/motion";
import { StudioScene } from "@/components/studio/figure";
import { Still } from "@/components/studio/still";
import { Button } from "@/components/ui/button";
import { CTA_LABEL, signupUrl } from "@/content/site";
import { getMedia } from "@/lib/media";
import { JsonLd, breadcrumbLd } from "@/lib/seo";

export function Section({
  children,
  className = "",
  id,
  tone = "default",
  labelledBy,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  tone?: "default" | "muted";
  labelledBy?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`${tone === "muted" ? "bg-secondary/50" : ""} py-16 sm:py-20 ${className}`}
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">{children}</div>
    </section>
  );
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  lead,
  align = "left",
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  lead?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={`mb-10 max-w-2xl space-y-3 ${align === "center" ? "mx-auto text-center" : ""}`}>
      {eyebrow && <p className="text-sm font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>}
      <h2 id={id} className="text-3xl font-bold sm:text-4xl">
        {title}
      </h2>
      {lead && <p className="text-lg text-muted-foreground">{lead}</p>}
    </div>
  );
}

/** En-tête des pages secondaires : un seul <h1> par page. Même lueur ambre que l'accueil, pour une seule identité. */
export function PageHero({ eyebrow, title, lead, path }: { eyebrow?: string; title: string; lead?: string; path?: string }) {
  return (
    <div className="relative overflow-hidden border-b">
      {path && <JsonLd data={breadcrumbLd([{ name: "Accueil", path: "/" }, { name: title, path }])} />}
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(50rem_20rem_at_90%_0%,color-mix(in_oklch,var(--accent),transparent_80%),transparent)]" />
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-12 sm:px-6 sm:py-16">
        {eyebrow && <p className="text-sm font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>}
        <h1 className="max-w-3xl text-4xl font-bold sm:text-5xl">{title}</h1>
        {lead && <p className="max-w-2xl text-lg text-muted-foreground sm:text-xl">{lead}</p>}
      </div>
    </div>
  );
}

export function CtaBand({
  title = "Prêt à créer votre première vidéo ?",
  lead = "Créez un compte et découvrez le service. Le coût de chaque création s’affiche avant de confirmer.",
}: {
  title?: string;
  lead?: string;
}) {
  const { danseApres } = getMedia();
  return (
    <Section>
      <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-12 text-primary-foreground sm:px-12 sm:py-14">
        <div aria-hidden className="absolute -right-16 -top-16 size-64 rounded-full bg-accent/30 blur-3xl" />
        <div aria-hidden className="absolute -bottom-6 right-8 hidden w-32 rotate-6 rounded-2xl border border-primary-foreground/20 bg-card p-1 shadow-soft md:block">
          <Still image={danseApres} fallback={<StudioScene mode="result" label="" />} />
        </div>
        <div className="relative max-w-xl space-y-4">
          <h2 className="text-3xl font-bold sm:text-4xl">{title}</h2>
          <p className="text-lg text-primary-foreground/85">{lead}</p>
          <TapScale>
            <Button asChild size="lg" variant="secondary" className="mt-2 rounded-full px-7">
              <a href={signupUrl}>
                {CTA_LABEL}
                <ArrowRight aria-hidden />
              </a>
            </Button>
          </TapScale>
        </div>
      </div>
    </Section>
  );
}

/** Contenu long et lisible (pages légales, à propos). */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16 [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-bold [&_li]:my-1.5 [&_p]:my-3 [&_p]:leading-relaxed [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6">
      {children}
    </div>
  );
}
