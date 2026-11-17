import { BadRequestException } from '@nestjs/common';

/**
 * Construction et validation de l'`input` envoyé au fournisseur, À PARTIR DU CATALOGUE SEUL.
 *
 * Un appel fournisseur, c'est toujours (slug, input). Le slug vient du catalogue ; l'`input` est reconstruit
 * ici, clé par clé, depuis les lignes ModelParam. Le serveur ne relaie JAMAIS ce que le client a envoyé : il
 * part des paramètres déclarés, prend la valeur du client seulement là où le catalogue l'autorise, et refuse
 * toute clé ou toute valeur absente du catalogue. Ajouter un modèle aux paramètres différents est donc une
 * opération de données, pas de code.
 *
 * Fonctions pures : aucune base, aucun réseau. Les mêmes règles servent au devis, au débit et à l'envoi.
 */

export type ParamType = 'STRING' | 'INTEGER' | 'BOOLEAN' | 'ENUM';
export type ParamRole =
  | 'PROMPT'
  | 'DURATION'
  | 'RESOLUTION'
  | 'ASPECT_RATIO'
  | 'IMAGE_URL'
  | 'OPTION';
export type ParamExposure = 'CLIENT' | 'FIXED' | 'HIDDEN_DEFAULT';
export type GenerationModeName = 'TEXT_TO_VIDEO' | 'IMAGE_TO_VIDEO';

export interface CatalogParam {
  key: string;
  label: string | null;
  type: ParamType;
  role: ParamRole;
  exposure: ParamExposure;
  /** Liste pour ENUM, { min, max } pour INTEGER, { maxLength } pour STRING, ou null. */
  allowedValues: unknown;
  defaultValue: unknown;
  affectsPrice: boolean;
  sortOrder: number;
}

export interface CatalogModel {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  mode: GenerationModeName;
  active: boolean;
  isDefault: boolean;
  sortOrder: number;
  params: CatalogParam[];
}

export interface BuiltInput {
  /** L'`input` exact à envoyer au fournisseur. */
  input: Record<string, unknown>;
  /** Valeurs des paramètres qui entrent dans le prix, par clé : entrée du calcul du coût. */
  priced: Record<string, unknown>;
  /** Valeurs retenues pour les rôles que la facturation doit connaître. */
  durationSeconds: number | null;
  resolution: string | null;
  aspectRatio: string | null;
}

/** Valeurs fournies par le SERVEUR, jamais par le client. */
export interface ServerValues {
  /** Texte final (description du client passée dans le gabarit du serveur). */
  prompt?: string;
  /** URL publique de la photo chez le fournisseur (modes image → vidéo). */
  imageUrl?: string;
}

function bad(code: string, message: string): never {
  throw new BadRequestException({ code, message });
}

/** Bornes d'un paramètre entier, telles que déclarées dans le catalogue. */
export function integerBounds(allowed: unknown): {
  min: number | null;
  max: number | null;
} {
  if (allowed && typeof allowed === 'object' && !Array.isArray(allowed)) {
    const o = allowed as { min?: unknown; max?: unknown };
    return {
      min: typeof o.min === 'number' ? o.min : null,
      max: typeof o.max === 'number' ? o.max : null,
    };
  }
  return { min: null, max: null };
}

/** Valeurs autorisées d'un paramètre ENUM, ou liste vide si le catalogue n'en déclare pas. */
export function enumValues(allowed: unknown): string[] {
  return Array.isArray(allowed) ? allowed.map((v) => String(v)) : [];
}

function maxLengthOf(allowed: unknown): number | null {
  if (allowed && typeof allowed === 'object' && !Array.isArray(allowed)) {
    const o = allowed as { maxLength?: unknown };
    if (typeof o.maxLength === 'number') return o.maxLength;
  }
  return null;
}

/**
 * Valide UNE valeur contre la déclaration d'un paramètre, et la convertit au type attendu.
 * Les valeurs venant d'un formulaire arrivent en texte : on les convertit, mais on ne devine rien
 * (« 5.5 » n'est pas un entier valide, « oui » n'est pas un booléen).
 */
export function coerceParamValue(param: CatalogParam, raw: unknown): unknown {
  const label = param.label ?? param.key;
  switch (param.type) {
    case 'INTEGER': {
      const n = typeof raw === 'string' ? Number(raw) : raw;
      if (typeof n !== 'number' || !Number.isInteger(n)) {
        bad('PARAM_INVALID', `« ${label} » doit être un nombre entier.`);
      }
      const { min, max } = integerBounds(param.allowedValues);
      if (min !== null && n < min) {
        bad('PARAM_INVALID', `« ${label} » doit valoir au moins ${min}.`);
      }
      if (max !== null && n > max) {
        bad('PARAM_INVALID', `« ${label} » ne peut pas dépasser ${max}.`);
      }
      return n;
    }
    case 'BOOLEAN': {
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      return bad('PARAM_INVALID', `« ${label} » doit valoir vrai ou faux.`);
    }
    case 'ENUM': {
      const allowed = enumValues(param.allowedValues);
      const v = String(raw);
      if (allowed.length === 0) {
        bad(
          'PARAM_INVALID',
          `« ${label} » n’a aucune valeur autorisée dans le catalogue.`,
        );
      }
      if (!allowed.includes(v)) {
        bad(
          'PARAM_INVALID',
          `« ${label} » : valeur non autorisée (${allowed.join(', ')}).`,
        );
      }
      return v;
    }
    case 'STRING': {
      if (typeof raw !== 'string') {
        bad('PARAM_INVALID', `« ${label} » doit être un texte.`);
      }
      const max = maxLengthOf(param.allowedValues);
      if (max !== null && raw.length > max) {
        bad('PARAM_INVALID', `« ${label} » : ${max} caractères au maximum.`);
      }
      return raw;
    }
  }
}

/**
 * Reconstruit l'`input` du modèle. `clientValues` ne sert qu'à renseigner les paramètres exposés au client :
 * toute autre clé est refusée, y compris une clé que le fournisseur accepterait (Higgsfield ignore
 * silencieusement les champs inconnus, donc c'est ici — et seulement ici — que ça se refuse).
 */
export function buildModelInput(
  model: CatalogModel,
  clientValues: Record<string, unknown> = {},
  server: ServerValues = {},
): BuiltInput {
  if (!model.active) {
    bad(
      'MODEL_UNAVAILABLE',
      'Ce modèle de création n’est pas disponible pour le moment.',
    );
  }
  const byKey = new Map(model.params.map((p) => [p.key, p]));
  for (const key of Object.keys(clientValues)) {
    if (clientValues[key] === undefined) continue;
    const param = byKey.get(key);
    if (!param) {
      bad('PARAM_UNKNOWN', `Paramètre inconnu pour ce modèle : « ${key} ».`);
    }
    if (param.exposure !== 'CLIENT') {
      bad(
        'PARAM_NOT_ALLOWED',
        `Le paramètre « ${param.label ?? key} » n’est pas modifiable.`,
      );
    }
  }

  const input: Record<string, unknown> = {};
  const priced: Record<string, unknown> = {};
  let durationSeconds: number | null = null;
  let resolution: string | null = null;
  let aspectRatio: string | null = null;

  for (const param of [...model.params].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )) {
    let value: unknown;
    if (param.role === 'IMAGE_URL') {
      // Déposée par le serveur après l'envoi du fichier : absente au moment du devis.
      value = server.imageUrl;
    } else if (param.role === 'PROMPT' && server.prompt !== undefined) {
      value = server.prompt;
    } else if (param.exposure === 'CLIENT') {
      const raw = clientValues[param.key];
      value =
        raw === undefined ? param.defaultValue : coerceParamValue(param, raw);
    } else {
      value = param.defaultValue;
    }

    if (value === undefined || value === null) {
      if (param.role === 'IMAGE_URL') continue; // renseignée plus tard, à la soumission
      bad(
        'PARAM_REQUIRED',
        `« ${param.label ?? param.key} » est requis pour ce modèle.`,
      );
    }
    // Les valeurs par défaut du catalogue passent aussi par la validation : une configuration
    // incohérente se voit au premier devis, pas au premier appel payant.
    const checked =
      param.role === 'IMAGE_URL' || param.role === 'PROMPT'
        ? value
        : coerceParamValue(param, value);
    input[param.key] = checked;
    if (param.affectsPrice) priced[param.key] = checked;
    if (param.role === 'DURATION') durationSeconds = Number(checked);
    if (param.role === 'RESOLUTION') resolution = String(checked);
    if (param.role === 'ASPECT_RATIO') aspectRatio = String(checked);
  }

  return { input, priced, durationSeconds, resolution, aspectRatio };
}

/** Toutes les combinaisons de valeurs qui changent le prix : sert au calibrage et au contrôle d'activation. */
export function pricedCombinations(
  model: CatalogModel,
): Record<string, unknown>[] {
  const priced = model.params
    .filter((p) => p.affectsPrice)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  let combos: Record<string, unknown>[] = [{}];
  for (const param of priced) {
    const values: unknown[] =
      param.type === 'ENUM'
        ? enumValues(param.allowedValues)
        : param.type === 'BOOLEAN'
          ? [false, true]
          : // Un entier (la durée) ne multiplie pas les tarifs : le prix est par unité.
            [param.defaultValue];
    const next: Record<string, unknown>[] = [];
    for (const combo of combos) {
      for (const v of values) next.push({ ...combo, [param.key]: v });
    }
    combos = next;
  }
  return combos;
}
