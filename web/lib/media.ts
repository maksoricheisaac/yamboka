import { existsSync } from 'node:fs';
import path from 'node:path';
import { DEMOS, type DemoItem, type DemoMediaSource, type StillImage } from '@/content/demos';
import { GALLERY, type GalleryEntry } from '@/content/gallery';

/**
 * Médias du site public, détectés sur le disque (côté serveur uniquement : ne pas importer depuis un composant client).
 * Règle unique : un média n'est utilisé que si son fichier existe dans `public/` ; sinon la page garde son illustration.
 * Les noms de fichiers attendus sont listés dans `docs/dev/videos-site-public.md`.
 *
 * - Vidéos et affiches : `public/demos/<nom>.mp4` + `<nom>.webp` (les deux sont nécessaires).
 * - Images : `public/images/<nom>.webp`.
 */
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const present = (url: string) => existsSync(path.join(PUBLIC_DIR, url));

function still(url: string, alt: string): StillImage | undefined {
  return present(url) ? { src: url, alt } : undefined;
}

/** Une vidéo n'est utilisable qu'avec son affiche : un seul des deux fichiers est signalé, puis ignoré. */
function clip(name: string, alt: string): DemoMediaSource | undefined {
  const video = `/demos/${name}.mp4`;
  const poster = `/demos/${name}.webp`;
  const hasVideo = present(video);
  const hasPoster = present(poster);
  if (hasVideo !== hasPoster) {
    console.warn(`[media] « ${name} » ignoré : il faut ${name}.mp4 ET ${name}.webp dans public/demos/.`);
  }
  return hasVideo && hasPoster ? { video, poster, alt } : undefined;
}

const DEMO_ALTS: Record<string, { before: string; after: string }> = {
  danse: {
    before: 'Une femme danse, filmée au téléphone',
    after: 'Le même mouvement repris par un personnage stylisé',
  },
  boutique: {
    before: 'Une commerçante présente une robe dans sa boutique, filmée au téléphone',
    after: 'La même présentation par un mannequin, dans une boutique soignée',
  },
  fete: {
    before: 'Un homme salue devant un gâteau d’anniversaire, filmé au téléphone',
    after: 'Le même message repris par un personnage animé, dans une salle de fête',
  },
};

const USAGE = [
  ['createur', 'Une créatrice de contenu filme une danse avec son téléphone'],
  ['commercant', 'Une commerçante présente un produit à son téléphone dans sa boutique'],
  ['evenement', 'Des bénévoles préparent un événement dans une salle décorée'],
  ['agence', 'Deux community managers travaillent ensemble sur une vidéo verticale'],
] as const;

const COMMENT_STEPS = [
  ['comment-1-compte', 'Écran de création de compte'],
  ['comment-2-credits', 'Écran d’achat de crédits'],
  ['comment-3-creation', 'Écran de création d’une vidéo'],
  ['comment-4-suivi', 'Écran de suivi et de téléchargement d’une création'],
] as const;

export interface SiteMedia {
  /** Vidéo du hero (la création terminée). */
  hero?: DemoMediaSource;
  /** Démonstrations de l'accueil ; `before` et `after` ne sont présents que tous les deux. */
  demos: DemoItem[];
  /** Images fixes tirées des affiches et du personnage de la danse. */
  danseAvant?: StillImage;
  danseApres?: StillImage;
  personnage?: StillImage;
  /** Exemples de la galerie, avec leurs médias présents. */
  gallery: GalleryEntry[];
  /** Cas d'usage, par clé : createur, commercant, evenement, agence. */
  usage: Record<(typeof USAGE)[number][0], StillImage | undefined>;
  /** Captures d'écran des 4 étapes de « Comment ça marche ». */
  comment: (StillImage | undefined)[];
  aPropos?: StillImage;
  /** Chemin du monogramme définitif (SVG carré), s'il existe. */
  logo?: string;
  /** Image de partage (1200 × 630), si elle existe. */
  partage?: string;
  /** Au moins un média réel est affiché quelque part sur le site. */
  anyReal: boolean;
  /** Tous les exemples de la galerie ont leur média réel. */
  galleryComplete: boolean;
}

let cache: SiteMedia | undefined;

function compute(): SiteMedia {
  const demos: DemoItem[] = DEMOS.map((d) => {
    const alts = DEMO_ALTS[d.id];
    const before = clip(`${d.id}-avant`, alts.before);
    const after = clip(`${d.id}-apres`, alts.after);
    // Une paire incomplète se compare mal : on garde alors l'illustration pour les deux côtés.
    return before && after ? { ...d, before, after } : d;
  });
  const byId = new Map(demos.map((d) => [d.id, d]));
  const danse = byId.get('danse');

  const gallery: GalleryEntry[] = GALLERY.map((item) => {
    if (item.video) {
      const demo = item.demoId ? byId.get(item.demoId) : undefined;
      return { ...item, before: demo?.before, after: demo?.after };
    }
    return { ...item, image: item.imageFile ? still(`/images/${item.imageFile}.webp`, item.label) : undefined };
  });

  const usage = Object.fromEntries(USAGE.map(([key, alt]) => [key, still(`/images/usage-${key}.webp`, alt)])) as SiteMedia['usage'];
  const comment = COMMENT_STEPS.map(([name, alt]) => still(`/images/${name}.webp`, alt));
  const hero = clip('hero-creation', 'Une danseuse créée par Yamboka danse dans une cour ensoleillée');
  const personnage = still('/demos/danse-personnage.webp', 'Le personnage choisi pour la danse');
  const aPropos = still('/images/a-propos-brazzaville.webp', 'Brazzaville');
  const logo = present('/images/logo.svg') ? '/images/logo.svg' : undefined;
  const partage = present('/images/partage.jpg') ? '/images/partage.jpg' : undefined;

  const galleryComplete = gallery.every((g) => (g.video ? g.before && g.after : g.image));
  const anyReal =
    !!hero ||
    demos.some((d) => d.after) ||
    !!personnage ||
    gallery.some((g) => g.after || g.image) ||
    Object.values(usage).some(Boolean) ||
    comment.some(Boolean) ||
    !!aPropos;

  return {
    hero,
    demos,
    danseAvant: danse?.before ? { src: danse.before.poster, alt: danse.before.alt } : undefined,
    danseApres: danse?.after ? { src: danse.after.poster, alt: danse.after.alt } : undefined,
    personnage,
    gallery,
    usage,
    comment,
    aPropos,
    logo,
    partage,
    anyReal,
    galleryComplete,
  };
}

/** En production le site est rendu à la construction : on calcule une fois. En développement, on relit le disque. */
export function getMedia(): SiteMedia {
  if (process.env.NODE_ENV !== 'production') return compute();
  return (cache ??= compute());
}
