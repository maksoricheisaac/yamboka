/**
 * Registre des modèles Higgsfield utilisés par Yamboka : ce que chacun accepte RÉELLEMENT.
 *
 * Higgsfield accepte sans erreur les champs qu'un modèle ne connaît pas (constaté le 1er nov. 2026 : Soul v2 a
 * accepté `image_urls` puis ignoré la photo). Une requête « acceptée » ne prouve donc rien : c'est ce registre,
 * vérifié contre la documentation officielle et contre l'API (point d'estimation gratuit), qui dit quels
 * paramètres envoyer, et qui interdit d'envoyer une photo à un modèle qui l'ignorerait.
 *
 * Un modèle absent du registre n'est jamais appelé « au hasard » : la création est refusée avant tout débit.
 */

/** Formats d'image proposés aux utilisateurs (voir CREATION_FORMATS dans @yamboka/shared). */
export type ImageFormat =
  '1:1' | '4:3' | '3:2' | '3:4' | '2:3' | '16:9' | '9:16';

export interface BuildContext {
  prompt: string;
  /** URL publique de la photo de l'utilisateur chez le fournisseur. */
  imageUrl: string;
  /** URL de la vidéo de référence (transfert de mouvement). */
  videoUrl?: string;
  format: string;
  resolution: string | null;
}

export interface ModelSpec {
  /** Ce que le modèle produit. */
  output: 'image' | 'video';
  /** Le modèle utilise la photo de l'utilisateur. Faux : l'envoyer serait inutile (elle serait ignorée). */
  usesPhoto: boolean;
  /** Le modèle exige une vidéo de référence (style « tendance »). */
  needsReferenceVideo: boolean;
  /** Formats acceptés nativement ; null quand le format découle de la source (vidéo). */
  formats: readonly ImageFormat[] | null;
  /** Paramètres exacts à envoyer, et seulement ceux-là. */
  build(ctx: BuildContext): Record<string, unknown>;
}

const ALL_FORMATS: readonly ImageFormat[] = [
  '1:1',
  '4:3',
  '3:2',
  '3:4',
  '2:3',
  '16:9',
  '9:16',
];

/**
 * Soul v2 : texte → image uniquement (documentation officielle, vérifié par essai réel).
 * Aucun champ de photo : le modèle ignorerait une `image_urls`.
 */
const SOUL: ModelSpec = {
  output: 'image',
  usesPhoto: false,
  needsReferenceVideo: false,
  formats: ALL_FORMATS, // 9:16, 16:9, 4:3, 3:4, 1:1, 2:3, 3:2 : liste officielle
  build: (c) => ({ prompt: c.prompt, aspect_ratio: c.format }),
};

/**
 * Grok Image 2.0 : texte → image, ou édition quand `image_urls` est fourni. Contrairement à d'autres modèles
 * testés (Qwen Edit, Marketing Studio), il n'ajoute pas de texte que l'utilisateur n'a pas demandé.
 * Formats acceptés (vérifiés par estimation) : auto, 1:1, 1:2, 2:1, 3:2, 2:3, 4:3, 3:4, 16:9, 9:16.
 * Qualité et résolution : valeurs par défaut du fournisseur (medium, 1k).
 */
const GROK_EDIT: ModelSpec = {
  output: 'image',
  usesPhoto: true,
  needsReferenceVideo: false,
  formats: ALL_FORMATS,
  build: (c) => ({
    prompt: c.prompt,
    image_urls: [c.imageUrl],
    aspect_ratio: c.format,
  }),
};

/**
 * Genjutsu (Light) : transfert de mouvement. Une vidéo de référence ET une photo ; le format de sortie découle
 * des sources. Vérifié par essai réel (480p) : MP4 valide.
 */
const MOTION_TRANSFER: ModelSpec = {
  output: 'video',
  usesPhoto: true,
  needsReferenceVideo: true,
  formats: null,
  build: (c) => ({
    video_url: c.videoUrl,
    image_urls: [c.imageUrl],
    ...(c.resolution ? { resolution: c.resolution } : {}),
  }),
};

const MODELS: Record<string, ModelSpec> = {
  'higgsfield-ai/soul/v2/standard': SOUL,
  'xai/grok-imagine-image-2.0': GROK_EDIT,
};

/** Le modèle (chemin tel que stocké dans GenerationProduct.providerModel), ou undefined s'il n'est pas géré. */
export function modelSpecOf(providerModel: string): ModelSpec | undefined {
  if (MODELS[providerModel]) return MODELS[providerModel];
  if (/^higgsfield\/genjutsu(-light)?\/motion-transfer\//.test(providerModel))
    return MOTION_TRANSFER;
  return undefined;
}
