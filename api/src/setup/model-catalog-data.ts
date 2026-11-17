import type { Prisma, PrismaClient } from '../generated/prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Catalogue de modèles seedé. Remplace le registre écrit en dur dans le code : ajouter ou changer un modèle
 * est désormais une opération de DONNÉES, faite ici (installation) ou dans l'administration (exploitation).
 *
 * Un appel fournisseur est toujours `(slug, input)`. Chaque paramètre déclare sa clé EXACTE, son type, son
 * rôle, qui en décide, les valeurs autorisées et s'il change le prix. Le serveur reconstruit l'`input` à
 * partir de ces lignes et refuse tout ce qui n'y figure pas. Les identifiants d'API ne sont JAMAIS ici :
 * ils viennent de l'environnement (voir le fournisseur Higgsfield).
 *
 * Idempotent : un modèle déjà présent n'est jamais modifié, pour ne pas écraser un réglage d'administrateur.
 */

type ParamSeed = {
  key: string;
  label?: string;
  type: 'STRING' | 'INTEGER' | 'BOOLEAN' | 'ENUM';
  role:
    | 'PROMPT'
    | 'DURATION'
    | 'RESOLUTION'
    | 'ASPECT_RATIO'
    | 'IMAGE_URL'
    | 'OPTION';
  exposure?: 'CLIENT' | 'FIXED' | 'HIDDEN_DEFAULT';
  allowedValues?: unknown;
  defaultValue?: unknown;
  affectsPrice?: boolean;
};

type ModelSeed = {
  slug: string;
  name: string;
  description: string;
  mode: 'TEXT_TO_VIDEO' | 'IMAGE_TO_VIDEO';
  active: boolean;
  isDefault: boolean;
  sortOrder: number;
  params: ParamSeed[];
};

const ASPECTS = ['9:16', '3:4', '1:1', '4:3', '16:9'];
const PROMPT: ParamSeed = {
  key: 'prompt',
  label: 'Description',
  type: 'STRING',
  role: 'PROMPT',
  allowedValues: { maxLength: 600 },
};

export const MODEL_CATALOG: ModelSeed[] = [
  /**
   * Modèle en service, repris À L'IDENTIQUE de l'ancien registre : mêmes paramètres, mêmes valeurs par
   * défaut, même résultat d'appel. Vérifié par essais réels (480p, 9:16, 5 s) le 5 nov. 2026.
   */
  {
    slug: 'alibaba/wan-3.0/image-to-video',
    name: 'Wan 3.0 · image → vidéo',
    description:
      'Une photo (première image) et un texte produisent la vidéo. Modèle en service.',
    mode: 'IMAGE_TO_VIDEO',
    active: true,
    isDefault: true,
    sortOrder: 0,
    params: [
      PROMPT,
      {
        key: 'image_url',
        label: 'Photo',
        type: 'STRING',
        role: 'IMAGE_URL',
        exposure: 'HIDDEN_DEFAULT',
      },
      {
        key: 'duration',
        label: 'Durée',
        type: 'INTEGER',
        role: 'DURATION',
        allowedValues: { min: 2, max: 30 },
        defaultValue: 5,
        affectsPrice: true,
      },
      {
        key: 'resolution',
        label: 'Qualité',
        type: 'ENUM',
        role: 'RESOLUTION',
        allowedValues: ['480p', '720p', '1080p'],
        defaultValue: '480p',
        affectsPrice: true,
      },
      {
        key: 'aspect_ratio',
        label: 'Format',
        type: 'ENUM',
        role: 'ASPECT_RATIO',
        allowedValues: ASPECTS,
        defaultValue: '9:16',
      },
      {
        key: 'generate_audio',
        label: 'Son',
        type: 'BOOLEAN',
        role: 'OPTION',
        exposure: 'FIXED',
        defaultValue: true,
      },
    ],
  },

  /**
   * Trois modèles texte → vidéo prêts à l'emploi, INACTIFS : leurs tarifs ne sont pas encore mesurés, et un
   * modèle ne s'active que si son tarif couvre toutes les combinaisons autorisées (contrôle au moment de
   * l'activation). Les bornes de durée et les résolutions sont à confirmer par l'assistant de calibrage
   * (`/estimate`) avant activation : c'est exactement ce que cet assistant sert à faire.
   */
  {
    slug: 'alibaba/wan-3.0-prime/text-to-video',
    name: 'Wan 3.0 Prime · texte → vidéo',
    description:
      'Un texte seul produit la vidéo. Tarifs et bornes à confirmer par calibrage avant activation.',
    mode: 'TEXT_TO_VIDEO',
    active: false,
    isDefault: false,
    sortOrder: 1,
    params: [
      PROMPT,
      {
        key: 'duration',
        label: 'Durée',
        type: 'INTEGER',
        role: 'DURATION',
        allowedValues: { min: 2, max: 30 },
        defaultValue: 5,
        affectsPrice: true,
      },
      {
        key: 'resolution',
        label: 'Qualité',
        type: 'ENUM',
        role: 'RESOLUTION',
        allowedValues: ['480p', '720p', '1080p'],
        defaultValue: '480p',
        affectsPrice: true,
      },
      {
        key: 'aspect_ratio',
        label: 'Format',
        type: 'ENUM',
        role: 'ASPECT_RATIO',
        allowedValues: ASPECTS,
        defaultValue: '9:16',
      },
      {
        key: 'generate_audio',
        label: 'Son',
        type: 'BOOLEAN',
        role: 'OPTION',
        exposure: 'FIXED',
        defaultValue: true,
      },
      {
        key: 'enable_thinking',
        label: 'Réflexion du modèle',
        type: 'BOOLEAN',
        role: 'OPTION',
        exposure: 'FIXED',
        defaultValue: false,
      },
    ],
  },
  {
    slug: 'bytedance/seedance-2.5/text-to-video',
    name: 'Seedance 2.5 · texte → vidéo',
    description:
      'Un texte seul produit la vidéo. Option « draft » moins chère, débit réglable. Tarifs à calibrer.',
    mode: 'TEXT_TO_VIDEO',
    active: false,
    isDefault: false,
    sortOrder: 2,
    params: [
      PROMPT,
      {
        key: 'draft',
        label: 'Aperçu rapide',
        type: 'BOOLEAN',
        role: 'OPTION',
        defaultValue: false,
        affectsPrice: true,
      },
      {
        key: 'duration',
        label: 'Durée',
        type: 'INTEGER',
        role: 'DURATION',
        allowedValues: { min: 2, max: 30 },
        defaultValue: 5,
        affectsPrice: true,
      },
      {
        key: 'resolution',
        label: 'Qualité',
        type: 'ENUM',
        role: 'RESOLUTION',
        allowedValues: ['480p', '720p', '1080p'],
        defaultValue: '480p',
        affectsPrice: true,
      },
      {
        key: 'aspect_ratio',
        label: 'Format',
        type: 'ENUM',
        role: 'ASPECT_RATIO',
        allowedValues: ASPECTS,
        defaultValue: '9:16',
      },
      {
        key: 'bitrate_mode',
        label: 'Débit',
        type: 'ENUM',
        role: 'OPTION',
        exposure: 'FIXED',
        allowedValues: ['standard', 'high'],
        defaultValue: 'standard',
        affectsPrice: true,
      },
      {
        key: 'output_format',
        label: 'Format de fichier',
        type: 'ENUM',
        role: 'OPTION',
        exposure: 'HIDDEN_DEFAULT',
        allowedValues: ['mp4'],
        defaultValue: 'mp4',
      },
      {
        key: 'generate_audio',
        label: 'Son',
        type: 'BOOLEAN',
        role: 'OPTION',
        exposure: 'FIXED',
        defaultValue: true,
      },
    ],
  },
  {
    slug: 'kling-video/v4.0/text-to-video',
    name: 'Kling v4.0 · texte → vidéo',
    description:
      'Un texte seul produit la vidéo, sans option payante. Tarifs à calibrer avant activation.',
    mode: 'TEXT_TO_VIDEO',
    active: false,
    isDefault: false,
    sortOrder: 3,
    params: [
      PROMPT,
      {
        key: 'duration',
        label: 'Durée',
        type: 'INTEGER',
        role: 'DURATION',
        allowedValues: { min: 2, max: 30 },
        defaultValue: 5,
        affectsPrice: true,
      },
      {
        key: 'resolution',
        label: 'Qualité',
        type: 'ENUM',
        role: 'RESOLUTION',
        allowedValues: ['480p', '720p', '1080p'],
        defaultValue: '480p',
        affectsPrice: true,
      },
      {
        key: 'aspect_ratio',
        label: 'Format',
        type: 'ENUM',
        role: 'ASPECT_RATIO',
        allowedValues: ASPECTS,
        defaultValue: '9:16',
      },
    ],
  },
];

/** Crée les modèles manquants et leurs paramètres. Ne modifie jamais un modèle déjà présent. */
export async function seedModelCatalog(db: Db): Promise<number> {
  let created = 0;
  for (const seed of MODEL_CATALOG) {
    const existing = await db.generationModel.findUnique({
      where: { slug: seed.slug },
    });
    if (existing) continue;
    // Un seul modèle par défaut : si un autre l'est déjà, celui-ci ne le devient pas.
    const hasDefault = await db.generationModel.findFirst({
      where: { isDefault: true },
    });
    await db.generationModel.create({
      data: {
        slug: seed.slug,
        name: seed.name,
        description: seed.description,
        mode: seed.mode,
        active: seed.active,
        isDefault: seed.isDefault && !hasDefault,
        sortOrder: seed.sortOrder,
        params: {
          create: seed.params.map((p, i) => ({
            key: p.key,
            label: p.label ?? null,
            type: p.type,
            role: p.role,
            exposure: p.exposure ?? 'CLIENT',
            allowedValues: (p.allowedValues ?? null) as Prisma.InputJsonValue,
            defaultValue: (p.defaultValue ?? null) as Prisma.InputJsonValue,
            affectsPrice: p.affectsPrice ?? false,
            sortOrder: i,
          })),
        },
      },
    });
    created += 1;
  }
  return created;
}
