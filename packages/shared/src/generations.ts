import { z } from 'zod';

/**
 * Contrats du parcours de création : styles (presets) proposés, demande de création, création suivie.
 * Les trois « types de création » de l'interface se déduisent du catalogue :
 *  - fun   : preset de type MOTION (tendance dont la vidéo de référence est fournie par Yamboka) ;
 *  - affiche : preset dont le produit est facturé à l'image ;
 *  - pub   : tout autre preset vidéo (LOOK, OBJECT_SWAP).
 */

export const CREATION_KINDS = ['affiche', 'pub', 'fun'] as const;
export type CreationKind = (typeof CREATION_KINDS)[number];

export const CREATION_FORMATS = ['9:16', '1:1', '16:9'] as const;
export type CreationFormat = (typeof CREATION_FORMATS)[number];

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export interface StyleView {
  id: string;
  name: string;
  description: string | null;
  category: string;
  kind: CreationKind;
  /** Mis à la une par l'administrateur. */
  featured: boolean;
  /** Coût exact en crédits, calculé côté serveur. */
  credits: number;
  /** Seconde(s) de vidéo facturée(s), null pour une image. */
  seconds: number | null;
  /** Vignette (URL de l'API) ou null si le preset n'en a pas encore. */
  thumbnailUrl: string | null;
}

export type CreationStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface CreationOptions {
  /** Description libre de l'utilisateur (texte, prix, coordonnées, ambiance…). */
  prompt?: string;
  format: CreationFormat;
  /** Anciens champs séparés : lus pour les créations faites avant le prompt unique, jamais écrits. */
  text?: string;
  price?: string;
  phone?: string;
}

export interface CreationView {
  id: string;
  kind: CreationKind;
  styleName: string;
  status: CreationStatus;
  /** Style (preset) utilisé, pour relancer une création identique. */
  styleId: string | null;
  /** Description saisie par l'utilisateur (ou reconstituée pour une ancienne création). */
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
  /** Le résultat est une vidéo (sinon une image). */
  isVideo: boolean;
  /** URLs de l'API (privées : exigent la session du propriétaire). */
  thumbnailUrl: string | null;
  fileUrl: string | null;
  downloadUrl: string | null;
}

export interface CreationPage {
  items: CreationView[];
  nextCursor: string | null;
}

export const MAX_PROMPT_LENGTH = 600;

/**
 * Demande de création (la photo part dans la même requête multipart). Une seule description libre : texte à afficher,
 * prix, coordonnées, ambiance… y sont écrits tels quels. `styleId` est obligatoire pour une tendance (fun) ; pour une
 * affiche ou une pub, le serveur choisit le style par défaut s'il est absent.
 */
export const createCreationSchema = z.object({
  kind: z.enum(CREATION_KINDS, { error: 'Choisissez un type de création.' }),
  styleId: z.uuid('Choisissez un style.').optional(),
  format: z.enum(CREATION_FORMATS).default('9:16'),
  prompt: z
    .string()
    .trim()
    .max(MAX_PROMPT_LENGTH, `${MAX_PROMPT_LENGTH} caractères au maximum.`)
    .optional()
    .transform((v) => (v ? v : undefined)),
  consent: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .refine((v) => v, {
      message: 'Vous devez confirmer que vous avez le droit d’utiliser cette photo.',
    }),
});
export type CreateCreationInput = z.infer<typeof createCreationSchema>;

export const REPORT_REASONS = [
  'Contenu inapproprié',
  'Usurpation d’identité',
  'Arnaque ou tromperie',
  'Autre',
] as const;

export const reportCreationSchema = z.object({
  reason: z.enum(REPORT_REASONS, { error: 'Choisissez un motif.' }),
  details: z.string().trim().max(500).optional(),
});
export type ReportCreationInput = z.infer<typeof reportCreationSchema>;
