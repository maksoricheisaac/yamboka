import {
  Bell,
  Download,
  FolderOpen,
  Image as ImageIcon,
  LayoutTemplate,
  Receipt,
  ShieldCheck,
  Smartphone,
  Video,
  WifiOff,
} from "lucide-react";
import type { Metadata } from "next";
import { CtaBand, PageHero, Section } from "@/components/site/blocks";

export const metadata: Metadata = {
  title: "Fonctionnalités",
  description:
    "Création de vidéos et d’images par IA, modèles prêts à l’emploi, suivi des créations, crédits transparents et modération : tout ce que propose Yamboka.",
  alternates: { canonical: "/fonctionnalites" },
};

const GROUPS = [
  {
    title: "Créer",
    items: [
      {
        icon: Video,
        title: "Vidéo en 3 étapes",
        text: "Envoyez votre vidéo (4 à 15 s), ajoutez 1 à 4 photos ou choisissez un modèle, puis confirmez. Aucun choix technique n’est imposé : la qualité standard est le 480p.",
      },
      {
        icon: ImageIcon,
        title: "Images portrait et mode",
        text: "Générez une image à partir d’un modèle ou d’une description. Prix fixe par image, affiché avant confirmation.",
      },
      {
        icon: LayoutTemplate,
        title: "Modèles prêts à l’emploi",
        text: "Danse, publicité, anniversaire, mode : des modèles (mouvement, look ou remplacement d’objet) qui évitent de rédiger un texte de description.",
      },
    ],
  },
  {
    title: "Suivre et conserver",
    items: [
      {
        icon: Bell,
        title: "Suivi et notifications",
        text: "La création se fait en arrière-plan. Vous pouvez quitter l’application : une notification vous prévient quand c’est prêt, ou si cela a échoué.",
      },
      {
        icon: FolderOpen,
        title: "Votre galerie personnelle",
        text: "Retrouvez vos créations avec leur date, le modèle utilisé et les crédits consommés. Chaque création indique sa date de suppression automatique.",
      },
      {
        icon: Download,
        title: "Téléchargement et partage",
        text: "Téléchargez en MP4 ou JPG, partagez sur WhatsApp ou par lien. Signalez un résultat raté ou un contenu inapproprié en un geste.",
      },
    ],
  },
  {
    title: "Payer et garder la maîtrise",
    items: [
      {
        icon: Receipt,
        title: "Crédits transparents",
        text: "Solde permanent en crédits avec son équivalent en FCFA, historique complet des mouvements, historique des achats et reçu pour chaque achat réussi.",
      },
      {
        icon: ShieldCheck,
        title: "Remboursement automatique",
        text: "Les crédits sont réservés au lancement d’une création et restitués automatiquement si elle échoue ou est annulée.",
      },
      {
        icon: ShieldCheck,
        title: "Usage responsable",
        text: "Consentement à chaque création, filigrane sur les vidéos, signalement public, modération sous 24 heures. Voir la charte d’utilisation.",
      },
    ],
  },
  {
    title: "Pensé pour le mobile",
    items: [
      {
        icon: Smartphone,
        title: "Mobile d’abord",
        text: "Une interface en français, simple et utilisable sur un smartphone Android d’entrée de gamme. Installable sur l’écran d’accueil.",
      },
      {
        icon: WifiOff,
        title: "Sobre en données",
        text: "Vidéo compressée avant l’envoi, envoi repris en cas de coupure, aperçus légers : le fichier complet n’est téléchargé qu’à la demande.",
      },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <PageHero
        eyebrow="Fonctionnalités"
        title="Tout ce qu’il faut pour créer, sans complexité"
        lead="Yamboka réunit la création, le suivi, les crédits et la sécurité dans une seule application en français."
      />
      {GROUPS.map((group, gi) => (
        <Section key={group.title} tone={gi % 2 === 0 ? "default" : "muted"} labelledBy={`g-${gi}`}>
          <h2 id={`g-${gi}`} className="mb-8 text-3xl font-bold">
            {group.title}
          </h2>
          <ul className="grid gap-5 md:grid-cols-3">
            {group.items.map((item) => (
              <li key={item.title} className="rounded-2xl border bg-card p-6 shadow-soft">
                <item.icon className="size-6 text-primary" aria-hidden />
                <h3 className="mt-3 text-lg font-bold">{item.title}</h3>
                <p className="mt-1.5 text-muted-foreground">{item.text}</p>
              </li>
            ))}
          </ul>
        </Section>
      ))}
      <CtaBand />
    </>
  );
}
