import type { DemoKind } from '@/components/site/demo-visual';
import type { DemoMediaSource, StillImage } from '@/content/demos';

/**
 * Exemples de la galerie. Sans fichier, ce sont des illustrations de démonstration (voir content/demos.ts).
 * `video` distingue les transformations vidéo (mises en avant) des images (complémentaires).
 * Les vidéos réutilisent celles de l'accueil (`demoId`) ; les images viennent de `public/images/<imageFile>.webp`.
 */
export type GalleryCategory = 'danse' | 'boutique' | 'fete';

export interface GalleryItem {
  id: string;
  kind: DemoKind;
  label: string;
  category: GalleryCategory;
  video: boolean;
  /** Une phrase : ce que montre l'exemple. */
  blurb: string;
  /** Vidéos : identifiant de la démonstration de l'accueil dont on réutilise la paire avant / après. */
  demoId?: string;
  /** Images : nom du fichier (sans extension) dans `public/images/`. */
  imageFile?: string;
}

/** Un exemple de la galerie, avec les médias réellement présents (aucun = illustration). */
export interface GalleryEntry extends GalleryItem {
  before?: DemoMediaSource;
  after?: DemoMediaSource;
  image?: StillImage;
}

export const GALLERY_CATEGORIES: { id: GalleryCategory; label: string }[] = [
  { id: 'danse', label: 'Danse' },
  { id: 'boutique', label: 'Boutiques' },
  { id: 'fete', label: 'Fêtes' },
];

/** Ordre intercalé vidéo / images : sur grand écran, chaque rangée est pleine (vidéo sur 4 colonnes, image sur 2). */
export const GALLERY: GalleryItem[] = [
  { id: 'danse-afro', kind: 'danse', label: 'Danse afro', category: 'danse', video: true, demoId: 'danse', blurb: 'Votre selfie reprend la danse de la tendance, pour TikTok et les statuts WhatsApp.' },
  { id: 'portrait', kind: 'portrait', label: 'Portrait stylisé', category: 'danse', video: false, imageFile: 'galerie-portrait', blurb: 'Un portrait à partir d’un modèle ou d’une description.' },
  { id: 'mode', kind: 'mode', label: 'Mode et vitrine', category: 'boutique', video: false, imageFile: 'galerie-mode', blurb: 'Un visuel de mode pour présenter vos articles.' },
  { id: 'pub-boutique', kind: 'boutique', label: 'Pub de boutique', category: 'boutique', video: true, demoId: 'boutique', blurb: 'Une courte publicité à partir d’une simple vidéo de téléphone.' },
  { id: 'anniversaire', kind: 'anniversaire', label: 'Anniversaire', category: 'fete', video: true, demoId: 'fete', blurb: 'Un message animé et personnalisé pour une fête.' },
  { id: 'invitation', kind: 'evenement', label: 'Invitation d’événement', category: 'fete', video: false, imageFile: 'galerie-invitation', blurb: 'Mariages, concerts, associations : un visuel pour inviter.' },
];
