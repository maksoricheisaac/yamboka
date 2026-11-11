import { Clapperboard, Smartphone, Wallet } from "lucide-react";

const POINTS = [
  { icon: Smartphone, text: "Depuis votre téléphone, en quelques clics" },
  { icon: Clapperboard, text: "Une vidéo prête à publier à partir de votre photo" },
  { icon: Wallet, text: "Vous payez seulement les crédits que vous achetez, en mobile money" },
];

/**
 * Panneau de marque des pages d'authentification (écran large uniquement : sur téléphone, le formulaire passe
 * avant tout). Du texte et de la matière plutôt qu'une fausse illustration : rien ici ne prétend être une création réelle.
 */
export function AuthAside() {
  return (
    <aside aria-hidden className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-14">
      <div className="absolute -right-32 -top-32 size-[28rem] rounded-full bg-accent/30 blur-3xl" />
      <div className="absolute -bottom-40 -left-24 size-[30rem] rounded-full bg-chart-4/35 blur-3xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,oklch(1_0_0/0.08)_1px,transparent_0)] bg-[length:22px_22px]" />

      <p className="relative text-sm font-medium text-primary-foreground/70">Yamboka</p>

      <div className="relative space-y-10">
        <p className="text-display max-w-md text-balance">Votre produit, en vidéo.</p>
        <ul className="max-w-sm space-y-4">
          {POINTS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-base text-primary-foreground/85">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-primary-foreground/12 backdrop-blur">
                <Icon className="size-4" />
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>

      <span />
    </aside>
  );
}
