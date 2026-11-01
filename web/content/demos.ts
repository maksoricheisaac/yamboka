/**
 * Démonstrations de la page d'accueil.
 *
 * Aucune vraie création n'est requise : sans fichier, le site affiche une illustration clairement étiquetée « Démo ».
 * Il n'y a rien à renseigner ici : déposez les fichiers aux noms attendus dans `web/public/demos/` et
 * `web/public/images/` (liste complète : `docs/dev/videos-site-public.md`), ils sont détectés par `lib/media.ts`.
 *   - vidéo MP4 (H.264) ≤ 1,5 Mo, 4:5, 6 à 8 s, muette, + affiche WebP ≤ 90 Ko de même nom.
 * Une paire avant / après n'est affichée que si ses quatre fichiers existent ; sinon l'illustration reste.
 */
export interface DemoMediaSource {
  /** Chemin public, ex. « /demos/danse-apres.mp4 ». */
  video: string;
  /** Affiche affichée avant lecture et si la vidéo échoue, ex. « /demos/danse-apres.webp ». */
  poster: string;
  /** Description pour les lecteurs d'écran. */
  alt: string;
}

/** Image fixe (affiche, portrait, photo) servie depuis `public/`. */
export interface StillImage {
  src: string;
  alt: string;
}

export interface DemoItem {
  id: string;
  label: string;
  tone: 'primary' | 'terracotta' | 'sky';
  before?: DemoMediaSource;
  after?: DemoMediaSource;
}

/** Les trois démonstrations de l'accueil. `lib/media.ts` y ajoute les médias présents sur le disque. */
export const DEMOS: DemoItem[] = [
  { id: 'danse', label: 'Danse afro', tone: 'primary' },
  { id: 'boutique', label: 'Pub de boutique', tone: 'terracotta' },
  { id: 'fete', label: 'Anniversaire', tone: 'sky' },
];
