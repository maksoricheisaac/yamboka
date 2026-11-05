/**
 * Registre des modèles Higgsfield utilisés par Yamboka : ce que chacun accepte RÉELLEMENT.
 *
 * Higgsfield accepte sans erreur les champs qu'un modèle ne connaît pas, et son point d'estimation ne valide que les
 * bornes (durée), pas les champs inconnus. Une requête « acceptée » ne prouve donc rien : c'est ce registre, vérifié
 * contre la documentation officielle et par essai réel, qui dit quels paramètres envoyer.
 *
 * Un modèle absent du registre n'est jamais appelé « au hasard » : la création est refusée avant tout débit.
 */

/** Modèle unique du catalogue : Wan 3.0 image → vidéo (les produits actifs qui le désignent donnent les tarifs). */
export const WAN_MODEL = 'alibaba/wan-3.0/image-to-video';

export interface BuildContext {
  /** Texte final envoyé au modèle (description du client complétée par le gabarit du serveur). */
  prompt: string;
  /** URL publique de la photo du client chez le fournisseur : elle devient la première image de la vidéo. */
  imageUrl: string;
  /** Format demandé : 9:16, 3:4, 1:1, 4:3 ou 16:9. */
  format: string;
  resolution: string;
  durationSeconds: number;
  /** Générer aussi une piste sonore. */
  audio: boolean;
}

export interface ModelSpec {
  /** Paramètres exacts à envoyer, et seulement ceux-là. */
  build(ctx: BuildContext): Record<string, unknown>;
}

/**
 * Wan 3.0 (Standard), image → vidéo : UNE photo (première image) + UN texte. Vérifié par essais réels le 5 nov. 2026
 * (480p, 9:16, 5 s : MP4 480×854 de 5,0 s avec piste AAC). Le fournisseur met 1080p par défaut : on envoie TOUJOURS la
 * résolution. `end_image_url`, `seed` et `enable_thinking` existent mais ne sont pas utilisés.
 */
const WAN_3_IMAGE_TO_VIDEO: ModelSpec = {
  build: (c) => ({
    prompt: c.prompt,
    image_url: c.imageUrl,
    duration: c.durationSeconds,
    resolution: c.resolution,
    aspect_ratio: c.format,
    generate_audio: c.audio,
  }),
};

/**
 * Registre : chemin du modèle (tel que stocké dans GenerationProduct.providerModel) → paramètres. Pour ajouter plus tard
 * Wan 3.0 Prime ou référence → vidéo : une entrée ici + un produit en base ; rien n'est exposé au client tant qu'aucun
 * produit actif ne le désigne.
 */
const MODELS: Record<string, ModelSpec> = {
  [WAN_MODEL]: WAN_3_IMAGE_TO_VIDEO,
};

/** Le modèle, ou undefined s'il n'est pas géré (la création est alors refusée avant tout débit). */
export function modelSpecOf(providerModel: string): ModelSpec | undefined {
  return MODELS[providerModel];
}
