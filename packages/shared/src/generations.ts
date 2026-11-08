import type { Page } from './admin-views';
import { z } from 'zod';
import { VIDEO_DURATION, VIDEO_RESOLUTIONS, type VideoResolution } from './pricing';

/**
 * Contrats du parcours de création : idées (presets) proposées, demande de création, création suivie.
 * Yamboka ne produit que des vidéos : UNE photo + UN texte → une vidéo (Wan 3.0, image → vidéo). Le client choisit
 * lui-même le format, la résolution et la durée ; le coût est calculé avec `videoCostCredits` (voir pricing.ts).
 */

/** Formats proposés, avec leur usage en clair. Tous sont acceptés nativement par le modèle. */
export const CREATION_FORMATS = ['9:16', '3:4', '1:1', '4:3', '16:9'] as const;
export type CreationFormat = (typeof CREATION_FORMATS)[number];
export const DEFAULT_FORMAT: CreationFormat = '9:16';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Public visé par une idée : sert à les classer à l'écran. */
export const SUGGESTION_AUDIENCES = ['business', 'perso'] as const;
export type SuggestionAudience = (typeof SUGGESTION_AUDIENCES)[number];

/** Une idée en un clic : un texte par défaut et des réglages par défaut, tous modifiables par le client. */
export interface StyleView {
  id: string;
  name: string;
  description: string | null;
  category: string;
  audience: SuggestionAudience;
  /** Mis à la une par l'administrateur. */
  featured: boolean;
  /** Texte proposé, qui remplit le champ de description. */
  prompt: string | null;
  /** Conseil sur la photo à envoyer. */
  photoHint: string | null;
  format: CreationFormat | null;
  resolution: VideoResolution | null;
  durationSeconds: number | null;
  /** Vignette (URL de l'API) ou null si l'idée n'en a pas encore. */
  thumbnailUrl: string | null;
}

export type CreationStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface CreationOptions {
  /** Description saisie par le client. */
  prompt?: string;
  format: CreationFormat;
  resolution?: VideoResolution;
  durationSeconds?: number;
  /** Anciens champs séparés : lus pour les créations faites avant le prompt unique, jamais écrits. */
  text?: string;
  price?: string;
  phone?: string;
}

export interface CreationView {
  id: string;
  /** Idée utilisée comme point de départ, ou null. */
  styleName: string | null;
  status: CreationStatus;
  styleId: string | null;
  /** Description saisie par le client (ou reconstituée pour une ancienne création). */
  prompt: string | null;
  credits: number;
  /** Vrai si les crédits ont été restitués après un échec. */
  refunded: boolean;
  errorMessage: string | null;
  options: CreationOptions;
  createdAt: string;
  completedAt: string | null;
  /** Date après laquelle le résultat n'est plus conservé. */
  expiresAt: string | null;
  /** Vrai quand la création vient du fournisseur SIMULÉ : aucune IA n'a été utilisée. */
  simulated: boolean;
  /** URLs de l'API (privées : exigent la session du propriétaire). */
  thumbnailUrl: string | null;
  fileUrl: string | null;
  downloadUrl: string | null;
}

export type CreationPage = Page<CreationView>;

/** Réglages de la page de création, lus côté serveur : tarifs, bornes, garde-fou, valeur du crédit. */
export interface CreationConfig {
  rates: Record<VideoResolution, number>;
  creditValueFcfa: number;
  guard: { credits: number; balancePercent: number };
}

export const MAX_PROMPT_LENGTH = 600;

/**
 * Demande de création (la photo part dans la même requête multipart). Le coût N'EST PAS envoyé : le serveur le
 * recalcule. `personPhoto` : la photo montre une personne, le client a coché « j'ai le droit d'utiliser cette photo ».
 */
export const createCreationSchema = z.object({
  styleId: z.uuid('Choisis une idée valide.').optional(),
  format: z.enum(CREATION_FORMATS).default('9:16'),
  resolution: z.enum(VIDEO_RESOLUTIONS).default('480p'),
  durationSeconds: z.coerce
    .number()
    .int('La durée doit être un nombre entier de secondes.')
    .min(VIDEO_DURATION.min, `La durée minimale est de ${VIDEO_DURATION.min} secondes.`)
    .max(VIDEO_DURATION.max, `La durée maximale est de ${VIDEO_DURATION.max} secondes.`)
    .default(VIDEO_DURATION.default),
  prompt: z
    .string()
    .trim()
    .min(1, 'Décris ta vidéo en quelques mots.')
    .max(MAX_PROMPT_LENGTH, `${MAX_PROMPT_LENGTH} caractères au maximum.`),
  personPhoto: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .default(false)
    .transform((v) => v === true || v === 'true'),
  consent: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .default(false)
    .transform((v) => v === true || v === 'true'),
});
export type CreateCreationInput = z.infer<typeof createCreationSchema>;

export const REPORT_REASONS = [
  'Contenu inapproprié',
  'Usurpation d’identité',
  'Arnaque ou tromperie',
  'Autre',
] as const;

export const reportCreationSchema = z.object({
  reason: z.enum(REPORT_REASONS, { error: 'Choisis un motif.' }),
  details: z.string().trim().max(500).optional(),
});
export type ReportCreationInput = z.infer<typeof reportCreationSchema>;
