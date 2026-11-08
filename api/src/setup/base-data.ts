import type { Prisma, PrismaClient } from '../generated/prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Données de base nécessaires au fonctionnement de la plateforme (devise, packs, produits, presets, paramètres, textes légaux).
 * Partagées par le seed (développement, tests) et par le Setup Wizard (production). Idempotent : ne modifie jamais
 * une ligne existante, donc ne touche pas aux tarifs ajustés par l'administrateur.
 */
// Packs : prix tout compris (frais Mobile Money inclus). `credits` = crédits de base, hors bonus de premier achat
// (réglage firstPurchaseBonusDefaultPercent, surchargeable par pack). Le bonus d'un pack n'est jamais figé ici.
const PACKS = [
  {
    name: 'Starter',
    price: 5000,
    credits: 500,
    bonusPercent: 0,
    featured: false,
    publicVisible: true,
  },
  {
    name: 'Pro',
    price: 10000,
    credits: 1000,
    bonusPercent: 0,
    featured: true,
    publicVisible: true,
  },
  {
    name: 'Business',
    price: 25000,
    credits: 2500,
    bonusPercent: 0,
    featured: false,
    publicVisible: true,
  },
];

/**
 * Modèle vidéo par défaut (suivi des coûts dans l'administration) : Wan 3.0 Standard, image → vidéo,
 * 0,05 $ par seconde en 480p (prix vérifié par estimation officielle et essai réel, 5 nov. 2026).
 */
const DEFAULT_MODEL = {
  code: 'DEFAULT_VIDEO',
  name: 'Wan 3.0 · image → vidéo',
  providerModel: 'alibaba/wan-3.0/image-to-video',
  resolution: null,
  usdPerSecond: '0.05',
  usdPerSecondWithAudio: null,
  minSeconds: 2,
  maxSeconds: 30,
  isDefault: true,
  active: true,
  sortOrder: 0,
} as const;

/**
 * Produits vidéo : un par résolution. 1 crédit = 10 FCFA ; 4 / 8 / 16 crédits par seconde ; coût Higgsfield
 * 0,05 / 0,10 / 0,20 $ par seconde. Les tarifs se modifient dans l'administration (Offre > Produits).
 * Genjutsu est abandonné : ses produits, s'ils existent déjà, sont désactivés par la migration (jamais recréés ici).
 */
const WAN_PRODUCT = {
  providerModel: 'alibaba/wan-3.0/image-to-video',
  billingUnit: 'SECOND',
  billableMultiplier: 1,
  minSeconds: 2,
  maxSeconds: 30,
  phase: 'MVP',
  active: true,
} as const;
const PRODUCTS = [
  {
    ...WAN_PRODUCT,
    code: 'WAN_I2V_480',
    name: 'Vidéo Wan 3.0 · Standard (480p)',
    resolution: '480p',
    creditsPerUnit: 4,
    providerCostUsdPerUnit: '0.05',
  },
  {
    ...WAN_PRODUCT,
    code: 'WAN_I2V_720',
    name: 'Vidéo Wan 3.0 · HD (720p)',
    resolution: '720p',
    creditsPerUnit: 8,
    providerCostUsdPerUnit: '0.10',
  },
  {
    ...WAN_PRODUCT,
    code: 'WAN_I2V_1080',
    name: 'Vidéo Wan 3.0 · Full HD (1080p)',
    resolution: '1080p',
    creditsPerUnit: 16,
    providerCostUsdPerUnit: '0.20',
  },
] as const;

const DEFAULTS_BUSINESS = {
  format: '9:16',
  resolution: '480p',
  durationSeconds: 5,
};
const IDEAS = [
  {
    name: 'Le produit tourne',
    category: 'produit',
    audience: 'business',
    description: 'La caméra tourne autour de ton produit.',
    defaultPrompt:
      'La caméra tourne lentement autour du produit, éclairage de studio, le produit est mis en valeur.',
    photoHint: 'Photo nette, bien éclairée, produit au centre sur fond simple.',
    defaults: DEFAULTS_BUSINESS,
  },
  {
    name: 'Zoom sur le produit',
    category: 'produit',
    audience: 'business',
    description: 'Un zoom lent qui attire le regard.',
    defaultPrompt:
      'Zoom lent sur le produit, mise au point nette sur les détails.',
    photoHint: 'Photo nette, produit bien visible et centré.',
    defaults: DEFAULTS_BUSINESS,
  },
  {
    name: 'Annonce de promo',
    category: 'promo',
    audience: 'business',
    description: 'Ton produit en vedette pour une promotion.',
    defaultPrompt:
      'Le produit est mis en vedette avec un mouvement de caméra dynamique, ambiance festive de promotion.',
    photoHint: 'Photo du produit seul, bien éclairée.',
    defaults: DEFAULTS_BUSINESS,
  },
  {
    name: 'Ouverture ou nouveauté',
    category: 'nouveauté',
    audience: 'business',
    description: 'Présente ta boutique ou ta nouveauté.',
    defaultPrompt:
      'Révélation du produit nouveau, mouvement de caméra élégant, ambiance chaleureuse.',
    photoHint: 'Photo de la boutique ou du produit, nette et lumineuse.',
    defaults: DEFAULTS_BUSINESS,
  },
  {
    name: 'Sourire et coucou',
    category: 'moi',
    audience: 'perso',
    description: 'Tu souris et tu fais coucou.',
    defaultPrompt: 'La personne sourit et fait coucou à la caméra.',
    photoHint: 'Photo de face, visage bien visible et éclairé.',
    defaults: DEFAULTS_BUSINESS,
  },
  {
    name: 'Anniversaire et fête',
    category: 'fête',
    audience: 'perso',
    description: 'Une vidéo de fête personnalisée.',
    defaultPrompt:
      'La personne sourit, des ballons et des confettis tombent autour d’elle, ambiance de fête.',
    photoHint: 'Photo de face, visage bien visible et éclairé.',
    defaults: DEFAULTS_BUSINESS,
  },
] as const;

const SETTINGS: Record<string, unknown> = {
  usdToXafRate: 620,
  creditValueFcfa: 10,
  paymentEnabledCountries: 'CG,CM',
  generationConfirmCredits: 100,
  generationConfirmBalancePercent: 50,
  fxFeePercent: 0,
  openpayCommissionPercent: 5,
  regenOverheadPercent: 0,
  minMarginPercent: 15,
  circuitLossPercent: 9,
  hfCostFcfaPerCredit: 2.5,
  firstPurchaseBonusEnabled: true,
  firstPurchaseBonusDefaultPercent: 20,
  purchasedCreditsExpiryMonths: 12,
  maxConcurrentGenerationsPerUser: 2,
  maxConcurrentGenerationsGlobal: 20,
  inputRetentionDays: 7,
  outputRetentionDays: 90,
  deletionReminderDays: 7,
  providerBalanceAlertUsd: 10,
  failureRateAlertPercent: 20,
  maintenanceMode: false,
  loginOtpMode: 'off',
  maintenanceMessage:
    'Yamboka est en maintenance. Les nouvelles créations reprendront très bientôt.',
};

const LEGAL = [
  {
    type: 'CGU',
    content:
      "Conditions générales d'utilisation de Yamboka. TEXTE DE BASE À FAIRE RELIRE PAR UN JURISTE avant publication.",
  },
  {
    type: 'CHARTE',
    content:
      "Charte d'utilisation responsable : sont interdits les contenus sexuels, impliquant des mineurs, l'usurpation d'identité, les contenus politiques trompeurs, le harcèlement, l'incitation à la haine ou à la violence et les arnaques. TEXTE DE BASE À FAIRE RELIRE.",
  },
  {
    type: 'CONFIDENTIALITE',
    content:
      'Politique de confidentialité : fichiers envoyés conservés 7 jours, vidéos générées 90 jours, stockage Cloudflare R2, envoi des fichiers au fournisseur de génération. TEXTE DE BASE À FAIRE RELIRE.',
  },
] as const;

export async function seedBaseData(db: Db): Promise<{
  settings: number;
  packs: number;
  products: number;
  legalDocuments: number;
}> {
  await db.currencySetting.upsert({
    where: { currency: 'XAF' },
    update: {},
    // Valeur indicative d'un crédit : prix du pack d'entrée ÷ ses crédits (5 000 ÷ 1 250).
    create: { currency: 'XAF', creditValue: 10 },
  });

  for (const [i, p] of PACKS.entries()) {
    await db.creditPack.upsert({
      where: { country_name: { country: 'CG', name: p.name } },
      update: {},
      create: { ...p, country: 'CG', currency: 'XAF', sortOrder: i },
    });
  }

  await db.modelPricing.upsert({
    where: { code: DEFAULT_MODEL.code },
    update: {},
    create: DEFAULT_MODEL,
  });

  for (const p of PRODUCTS) {
    await db.generationProduct.upsert({
      where: { code: p.code },
      update: {},
      create: p,
    });
  }

  // Idées proposées au client : un texte et des réglages par défaut, tous modifiables. Aucune vidéo de référence.
  for (const [i, idea] of IDEAS.entries()) {
    const exists = await db.preset.findFirst({ where: { name: idea.name } });
    if (!exists)
      await db.preset.create({
        data: { ...idea, type: 'LOOK', sortOrder: i, visible: true },
      });
  }

  for (const [key, value] of Object.entries(SETTINGS)) {
    await db.setting.upsert({
      where: { key },
      update: {},
      create: { key, value: value as never },
    });
  }

  for (const doc of LEGAL) {
    await db.legalDocument.upsert({
      where: { type_version: { type: doc.type, version: 1 } },
      update: {},
      create: { ...doc, version: 1, major: true },
    });
  }
  return {
    settings: Object.keys(SETTINGS).length,
    packs: PACKS.length,
    products: PRODUCTS.length,
    legalDocuments: LEGAL.length,
  };
}
