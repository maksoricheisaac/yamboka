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
  /** Le modèle utilise la photo de l'utilisateur. Faux : l'envoyer serait inutile (elle serait ignorée). */
  usesPhoto: boolean;
  /** Le modèle exige une vidéo de référence (style « tendance »). */
  needsReferenceVideo: boolean;
  /** Formats acceptés nativement ; null quand le format découle de la vidéo de référence (cas de Genjutsu). */
  formats: readonly string[] | null;
  /** Paramètres exacts à envoyer, et seulement ceux-là. */
  build(ctx: BuildContext): Record<string, unknown>;
}

/**
 * Genjutsu (Light) : transfert de mouvement. Une vidéo de référence ET une photo ; le format de sortie découle
 * des sources. Vérifié par essai réel (480p) : MP4 valide.
 */
const MOTION_TRANSFER: ModelSpec = {
  usesPhoto: true,
  needsReferenceVideo: true,
  formats: null,
  build: (c) => ({
    video_url: c.videoUrl,
    image_urls: [c.imageUrl],
    ...(c.resolution ? { resolution: c.resolution } : {}),
  }),
};

/** Le modèle (chemin tel que stocké dans GenerationProduct.providerModel), ou undefined s'il n'est pas géré. */
export function modelSpecOf(providerModel: string): ModelSpec | undefined {
  if (/^higgsfield\/genjutsu(-light)?\/motion-transfer\//.test(providerModel))
    return MOTION_TRANSFER;
  return undefined;
}
