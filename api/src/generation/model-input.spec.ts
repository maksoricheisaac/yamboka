import { BadRequestException } from '@nestjs/common';
import {
  buildModelInput,
  pricedCombinations,
  type CatalogModel,
  type CatalogParam,
} from './model-input';

/**
 * Le catalogue remplace le registre de modèles écrit en dur : ces tests vérifient qu'un modèle décrit en
 * base produit exactement l'appel attendu, qu'un second modèle aux paramètres différents fonctionne SANS
 * toucher au code, et que rien d'absent du catalogue ne passe.
 */

const param = (p: Partial<CatalogParam> & { key: string }): CatalogParam => ({
  label: null,
  type: 'STRING',
  role: 'OPTION',
  exposure: 'CLIENT',
  allowedValues: null,
  defaultValue: null,
  affectsPrice: false,
  sortOrder: 0,
  ...p,
});

/** Le modèle seedé par la migration, décrit exactement comme en base. */
const WAN: CatalogModel = {
  id: 'm1',
  slug: 'alibaba/wan-3.0/image-to-video',
  name: 'Wan 3.0 · image → vidéo',
  description: null,
  mode: 'IMAGE_TO_VIDEO',
  active: true,
  isDefault: true,
  sortOrder: 0,
  params: [
    param({ key: 'prompt', role: 'PROMPT', type: 'STRING', sortOrder: 0 }),
    param({
      key: 'image_url',
      role: 'IMAGE_URL',
      type: 'STRING',
      exposure: 'HIDDEN_DEFAULT',
      sortOrder: 1,
    }),
    param({
      key: 'duration',
      role: 'DURATION',
      type: 'INTEGER',
      allowedValues: { min: 2, max: 30 },
      defaultValue: 5,
      affectsPrice: true,
      sortOrder: 2,
    }),
    param({
      key: 'resolution',
      role: 'RESOLUTION',
      type: 'ENUM',
      allowedValues: ['480p', '720p', '1080p'],
      defaultValue: '480p',
      affectsPrice: true,
      sortOrder: 3,
    }),
    param({
      key: 'aspect_ratio',
      role: 'ASPECT_RATIO',
      type: 'ENUM',
      allowedValues: ['9:16', '3:4', '1:1', '4:3', '16:9'],
      defaultValue: '9:16',
      sortOrder: 4,
    }),
    param({
      key: 'generate_audio',
      role: 'OPTION',
      type: 'BOOLEAN',
      exposure: 'FIXED',
      defaultValue: true,
      sortOrder: 5,
    }),
  ],
};

/** Un second modèle, texte → vidéo, aux paramètres entièrement différents : aucune ligne de code à écrire. */
const SEEDANCE: CatalogModel = {
  id: 'm2',
  slug: 'bytedance/seedance-2.5/text-to-video',
  name: 'Seedance 2.5',
  description: null,
  mode: 'TEXT_TO_VIDEO',
  active: true,
  isDefault: false,
  sortOrder: 1,
  params: [
    param({ key: 'prompt', role: 'PROMPT', type: 'STRING', sortOrder: 0 }),
    param({
      key: 'draft',
      role: 'OPTION',
      type: 'BOOLEAN',
      defaultValue: false,
      affectsPrice: true,
      sortOrder: 1,
    }),
    param({
      key: 'duration',
      role: 'DURATION',
      type: 'INTEGER',
      allowedValues: { min: 4, max: 12 },
      defaultValue: 4,
      affectsPrice: true,
      sortOrder: 2,
    }),
    param({
      key: 'resolution',
      role: 'RESOLUTION',
      type: 'ENUM',
      allowedValues: ['720p', '1080p'],
      defaultValue: '720p',
      affectsPrice: true,
      sortOrder: 3,
    }),
    param({
      key: 'bitrate_mode',
      role: 'OPTION',
      type: 'ENUM',
      allowedValues: ['standard', 'high'],
      defaultValue: 'standard',
      affectsPrice: true,
      sortOrder: 4,
    }),
    param({
      key: 'output_format',
      role: 'OPTION',
      type: 'ENUM',
      allowedValues: ['mp4'],
      exposure: 'HIDDEN_DEFAULT',
      defaultValue: 'mp4',
      sortOrder: 5,
    }),
  ],
};

describe('buildModelInput', () => {
  it('reproduit à l’identique l’appel du modèle seedé', () => {
    const built = buildModelInput(
      WAN,
      {
        prompt: 'une voiture',
        duration: 5,
        resolution: '480p',
        aspect_ratio: '9:16',
      },
      {
        prompt: 'une voiture. Mouvement naturel',
        imageUrl: 'https://x/img.jpg',
      },
    );
    expect(built.input).toEqual({
      prompt: 'une voiture. Mouvement naturel',
      image_url: 'https://x/img.jpg',
      duration: 5,
      resolution: '480p',
      aspect_ratio: '9:16',
      generate_audio: true,
    });
    expect(built.durationSeconds).toBe(5);
    expect(built.resolution).toBe('480p');
    expect(built.priced).toEqual({ duration: 5, resolution: '480p' });
  });

  it('accepte un second modèle aux paramètres différents sans changer le code', () => {
    const built = buildModelInput(
      SEEDANCE,
      {
        prompt: 'un marché',
        duration: 8,
        resolution: '1080p',
        bitrate_mode: 'high',
        draft: true,
      },
      { prompt: 'un marché' },
    );
    expect(built.input).toEqual({
      prompt: 'un marché',
      draft: true,
      duration: 8,
      resolution: '1080p',
      bitrate_mode: 'high',
      output_format: 'mp4',
    });
    // Aucune photo : ce modèle ne déclare pas de paramètre d'image.
    expect(built.input.image_url).toBeUndefined();
  });

  it('refuse une clé absente du catalogue', () => {
    expect(() =>
      buildModelInput(WAN, { prompt: 'x', seed: 42 }, { prompt: 'x' }),
    ).toThrow(BadRequestException);
  });

  it('refuse une valeur hors des valeurs autorisées', () => {
    expect(() =>
      buildModelInput(WAN, { prompt: 'x', resolution: '4k' }, { prompt: 'x' }),
    ).toThrow(/non autorisée/);
  });

  it('refuse une durée hors des bornes du modèle', () => {
    expect(() =>
      buildModelInput(SEEDANCE, { prompt: 'x', duration: 20 }, { prompt: 'x' }),
    ).toThrow(/ne peut pas dépasser 12/);
  });

  it('refuse que le client impose un paramètre fixé par la configuration', () => {
    expect(() =>
      buildModelInput(
        WAN,
        { prompt: 'x', generate_audio: false },
        { prompt: 'x' },
      ),
    ).toThrow(/n’est pas modifiable/);
  });

  it('refuse un modèle désactivé, immédiatement', () => {
    expect(() =>
      buildModelInput({ ...WAN, active: false }, {}, { prompt: 'x' }),
    ).toThrow(/pas disponible/);
  });

  it('applique les valeurs par défaut du catalogue quand le client n’envoie rien', () => {
    const built = buildModelInput(SEEDANCE, {}, { prompt: 'x' });
    expect(built.input).toEqual({
      prompt: 'x',
      draft: false,
      duration: 4,
      resolution: '720p',
      bitrate_mode: 'standard',
      output_format: 'mp4',
    });
  });

  it('convertit les valeurs reçues en texte depuis un formulaire', () => {
    const built = buildModelInput(
      WAN,
      { prompt: 'x', duration: '7', resolution: '720p' },
      { prompt: 'x', imageUrl: 'https://x/i.jpg' },
    );
    expect(built.input.duration).toBe(7);
    expect(built.durationSeconds).toBe(7);
  });
});

describe('pricedCombinations', () => {
  it('énumère toutes les combinaisons qui changent le prix', () => {
    // 3 résolutions × la durée (une seule valeur : le prix est par seconde).
    expect(pricedCombinations(WAN)).toHaveLength(3);
    // 2 valeurs de draft × 2 résolutions × 2 modes de débit.
    expect(pricedCombinations(SEEDANCE)).toHaveLength(8);
  });
});
