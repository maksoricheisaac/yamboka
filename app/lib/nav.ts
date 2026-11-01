import {
  Activity,
  Boxes,
  Clapperboard,
  Bell,
  Coins,
  History,
  GalleryVertical,
  TrendingUp,
  CreditCard,
  FileText,
  LifeBuoy,
  LayoutDashboard,
  LineChart,
  Receipt,
  ShieldCheck,
  ScrollText,
  Settings,
  Sparkles,
  Tags,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Navigation des deux espaces. Définie dans un module partagé par la barre latérale (composant client)
 * et le fil d'Ariane : les icônes sont des composants, ils ne peuvent pas traverser la frontière
 * serveur → client sous forme de props.
 */

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Actif seulement sur l'URL exacte (sinon aussi sur les sous-pages). */
  exact?: boolean;
  /** Sous-pages qui ont leur propre entrée de menu : elles n'activent pas celle-ci. */
  except?: string[];
  /** Fonction annoncée mais pas encore ouverte : affichée désactivée, avec la mention « Bientôt ». */
  soon?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export type ShellVariant = "user" | "admin";

export const USER_NAV: NavGroup[] = [
  {
    label: "Mon espace",
    items: [
      { title: "Tableau de bord", href: "/app", icon: LayoutDashboard, exact: true },
      { title: "Créer", href: "/app/creer", icon: Sparkles },
      { title: "Mes créations", href: "/app/creations", icon: GalleryVertical },
      { title: "Tendances", href: "/app/tendances", icon: TrendingUp },
    ],
  },
  {
    label: "Crédits et achats",
    items: [
      { title: "Crédits", href: "/app/credits", icon: Coins, except: ["/app/credits/historique"] },
      { title: "Historique", href: "/app/credits/historique", icon: History },
      { title: "Achats", href: "/app/achats", icon: Receipt },
    ],
  },
  {
    label: "Compte",
    items: [
      { title: "Notifications", href: "/app/notifications", icon: Bell },
      { title: "Mon profil", href: "/app/profil", icon: UserRound },
      { title: "Paramètres", href: "/app/parametres", icon: Settings },
    ],
  },
];

/** Rubriques de l'administration : Pilotage, Clients, Générations et modération, Offre, Finances, Configuration, Audit. */
export const ADMIN_NAV: NavGroup[] = [
  {
    label: "Pilotage",
    items: [{ title: "Tableau de bord", href: "/admin", icon: Activity, exact: true }],
  },
  {
    label: "Clients",
    items: [
      { title: "Utilisateurs", href: "/admin/utilisateurs", icon: Users },
      { title: "Réclamations", href: "/admin/signalements", icon: LifeBuoy },
    ],
  },
  {
    label: "Générations et modération",
    items: [{ title: "Générations", href: "/admin/generations", icon: Clapperboard }],
  },
  {
    label: "Offre",
    items: [
      { title: "Packs de crédits", href: "/admin/packs", icon: Tags },
      { title: "Produits", href: "/admin/produits", icon: Boxes },
      { title: "Presets", href: "/admin/presets", icon: Sparkles },
    ],
  },
  {
    label: "Finances",
    items: [
      { title: "Paiements", href: "/admin/paiements", icon: CreditCard },
      { title: "Synthèse financière", href: "/admin/finances", icon: LineChart },
    ],
  },
  {
    label: "Configuration",
    items: [
      { title: "Paramètres", href: "/admin/parametres", icon: Settings },
      { title: "Textes légaux", href: "/admin/textes-legaux", icon: FileText },
      { title: "Administrateurs", href: "/admin/administrateurs", icon: ShieldCheck },
    ],
  },
  {
    label: "Audit",
    items: [{ title: "Journal d’audit", href: "/admin/audit", icon: ScrollText }],
  },
];

/** Barre d'onglets du bas (mobile) : les cinq actions les plus fréquentes, accessibles au pouce. */
export const USER_TABS: { title: string; href: string; icon: LucideIcon; exact?: boolean }[] = [
  { title: "Accueil", href: "/app", icon: LayoutDashboard, exact: true },
  { title: "Créer", href: "/app/creer", icon: Sparkles },
  { title: "Créations", href: "/app/creations", icon: GalleryVertical },
  { title: "Tendances", href: "/app/tendances", icon: TrendingUp },
  { title: "Crédits", href: "/app/credits", icon: Coins },
];

export const NAV_BY_VARIANT: Record<ShellVariant, NavGroup[]> = { user: USER_NAV, admin: ADMIN_NAV };

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.except?.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return false;
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export interface Crumb {
  label: string;
  href?: string;
}

/** Pages secondaires dont l'URL contient un identifiant : parent navigable + libellé de la page. */
const DETAIL_PAGES: { pattern: RegExp; parent: { label: string; href: string }; label: string; variant?: ShellVariant }[] = [
  { pattern: /^\/admin\/utilisateurs\/[^/]+$/, parent: { label: "Utilisateurs", href: "/admin/utilisateurs" }, label: "Fiche client", variant: "admin" },
  { pattern: /^\/app\/credits\/paiement\/[^/]+$/, parent: { label: "Crédits et achats", href: "/app/credits" }, label: "Paiement" },
  { pattern: /^\/app\/creations\/[^/]+$/, parent: { label: "Mes créations", href: "/app/creations" }, label: "Création" },
  { pattern: /^\/app\/achats\/[^/]+$/, parent: { label: "Achats", href: "/app/achats" }, label: "Reçu" },
];

/** Fil d'Ariane d'une page : [rubrique ›] page, ou parent › détail pour les pages à identifiant. */
export function crumbsFor(variant: ShellVariant, pathname: string): Crumb[] {
  const detail = DETAIL_PAGES.find((d) => d.pattern.test(pathname));
  if (detail && (detail.variant ?? "user") === variant) return [detail.parent, { label: detail.label }];
  if (pathname === "/app/profil" || pathname === "/admin/profil") return [{ label: "Mon profil" }];

  const groups = NAV_BY_VARIANT[variant];
  for (const group of groups) {
    const item = group.items.find((i) => i.href === pathname);
    if (item) {
      // L'espace client n'a qu'une rubrique : inutile de la répéter. L'admin affiche sa rubrique.
      return variant === "admin" ? [{ label: group.label }, { label: item.title }] : [{ label: item.title }];
    }
  }
  return [{ label: variant === "admin" ? "Administration" : "Mon espace" }];
}
