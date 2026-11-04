import type { DemoKind } from '@/components/site/demo-visual';
import type { DemoMediaSource } from '@/content/demos';

/**
 * Exemples de la galerie. Sans fichier, ce sont des illustrations de démonstration (voir content/demos.ts).
 * Les vidéos réutilisent celles de l'accueil (`demoId`).
 */
export type GalleryCategory = 'danse' | 'boutique' | 'fete';

export interface GalleryItem {
  id: string;
  kind: DemoKind;
  label: string;
  category: GalleryCategory;
  /** Une phrase : ce que montre l'exemple. */
  blurb: string;
  /** Identifiant de la démonstration de l'accueil dont on réutilise la paire avant / après. */
  demoId?: string;
}

/** Un exemple de la galerie, avec les médias réellement présents (aucun = illustration). */
export interface GalleryEntry extends GalleryItem {
  before?: DemoMediaSource;
  after?: DemoMediaSource;
}

export const GALLERY_CATEGORIES: { id: GalleryCategory; label: string }[] = [
  { id: 'danse', label: 'Danse' },
  { id: 'boutique', label: 'Boutiques' },
  { id: 'fete', label: 'Fêtes' },
];

/** Exemples de la galerie : uniquement des vidéos. */
export const GALLERY: GalleryItem[] = [
  { id: 'danse-afro', kind: 'danse', label: 'Danse afro', category: 'danse', demoId: 'danse', blurb: 'Votre selfie reprend la danse de la tendance, pour TikTok et les statuts WhatsApp.' },
  { id: 'pub-boutique', kind: 'boutique', label: 'Pub de boutique', category: 'boutique', demoId: 'boutique', blurb: 'Une courte publicité à partir de la photo de vos articles.' },
  { id: 'anniversaire', kind: 'anniversaire', label: 'Anniversaire', category: 'fete', demoId: 'fete', blurb: 'Un message animé et personnalisé pour une fête.' },
];
