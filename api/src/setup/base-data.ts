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
    credits: 1250,
    bonusPercent: 0,
    featured: false,
    publicVisible: true,
  },
  {
    name: 'Pro',
    price: 10000,
    credits: 2600,
    bonusPercent: 0,
    featured: true,
    publicVisible: true,
  },
  {
    name: 'Business',
    price: 25000,
    credits: 6800,
    bonusPercent: 0,
    featured: false,
    publicVisible: true,
  },
];

/**
 * Modèle de référence des équivalences (« ≈ 12 vidéos de 10 s ») : 1 vidéo de 10 s = 100 crédits, donc 10 crédits/s.
 * Le modèle Higgsfield n'est pas encore choisi : 0,04 $/s est un prix provisoire qui donne ⌈0,04 × 575 ÷ 2,5⌉ = 10
 * crédits/s. À remplacer par le prix réel du modèle retenu (administration : coût par modèle).
 */
const DEFAULT_MODEL = {
  code: 'DEFAULT_VIDEO',
  name: 'Modèle vidéo par défaut (prix provisoire)',
  providerModel: 'a-definir',
  resolution: null,
  usdPerSecond: '0.04',
  usdPerSecondWithAudio: null,
  minSeconds: 5,
  maxSeconds: 10,
  isDefault: true,
  active: true,
  sortOrder: 0,
} as const;

const PRODUCTS = [
  {
    code: 'VIDEO_LIGHT_480',
    name: 'Vidéo Light 480p',
    providerModel: 'higgsfield/genjutsu-light/motion-transfer/v1.0',
    resolution: '480p',
    billingUnit: 'SECOND',
    creditsPerUnit: 10,
    providerCostUsdPerUnit: '0.04',
    billableMultiplier: 1,
    minSeconds: 4,
    maxSeconds: 15,
    phase: 'MVP',
    active: true,
  },
  {
    code: 'IMAGE_SOUL2',
    name: 'Image portrait (Soul 2)',
    providerModel: 'higgsfield-ai/soul/v2/standard',
    resolution: null,
    billingUnit: 'IMAGE',
    creditsPerUnit: 2,
    providerCostUsdPerUnit: '0.0057',
    billableMultiplier: 1,
    minSeconds: null,
    maxSeconds: null,
    phase: 'MVP',
    active: true,
  },
  {
    code: 'VIDEO_LIGHT_720',
    name: 'Vidéo Light 720p',
    providerModel: 'higgsfield/genjutsu-light/motion-transfer/v1.0',
    resolution: '720p',
    billingUnit: 'SECOND',
    creditsPerUnit: 8,
    providerCostUsdPerUnit: '0.10',
    billableMultiplier: 2,
    minSeconds: 4,
    maxSeconds: 15,
    phase: 'PHASE_2',
    active: false,
  },
  {
    code: 'VIDEO_PRO_480',
    name: 'Vidéo Pro 480p',
    providerModel: 'higgsfield/genjutsu/motion-transfer/v1.0',
    resolution: '480p',
    billingUnit: 'SECOND',
    creditsPerUnit: 13,
    providerCostUsdPerUnit: '0.318',
    billableMultiplier: 1,
    minSeconds: 1,
    maxSeconds: 30,
    phase: 'PHASE_2',
    active: false,
  },
  {
    code: 'VIDEO_PRO_720',
    name: 'Vidéo Pro 720p',
    providerModel: 'higgsfield/genjutsu/motion-transfer/v1.0',
    resolution: '720p',
    billingUnit: 'SECOND',
    creditsPerUnit: 28,
    providerCostUsdPerUnit: '0.681',
    billableMultiplier: 1,
    minSeconds: 1,
    maxSeconds: 30,
    phase: 'PHASE_2',
    active: false,
  },
  {
    code: 'POSTER_IDEOGRAM',
    name: 'Affiche avec texte',
    providerModel: 'ideogram',
    resolution: null,
    billingUnit: 'IMAGE',
    creditsPerUnit: 4,
    providerCostUsdPerUnit: '0.03',
    billableMultiplier: 1,
    minSeconds: null,
    maxSeconds: null,
    phase: 'PHASE_2',
    active: false,
  },
] as const;

const SETTINGS: Record<string, unknown> = {
  usdToXafRate: 575,
  fxFeePercent: 6,
  openpayCommissionPercent: 5,
  regenOverheadPercent: 15,
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
    create: { currency: 'XAF', creditValue: 4 },
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

  const products = new Map<string, string>();
  for (const p of PRODUCTS) {
    const row = await db.generationProduct.upsert({
      where: { code: p.code },
      update: {},
      create: p,
    });
    products.set(p.code, row.id);
  }

  const videoId = products.get('VIDEO_LIGHT_480')!;
  const presets = [
    {
      name: 'Danse afro',
      category: 'danse',
      type: 'MOTION',
      description: 'Fais danser ton personnage sur le mouvement de ta vidéo.',
    },
    {
      name: 'Pub de boutique',
      category: 'pub',
      type: 'LOOK',
      description:
        'Une courte publicité pour ta boutique à partir de ta vidéo.',
    },
    {
      name: 'Anniversaire',
      category: 'anniversaire',
      type: 'MOTION',
      description: "Une vidéo d'anniversaire personnalisée.",
    },
  ] as const;
  for (const [i, pr] of presets.entries()) {
    const exists = await db.preset.findFirst({ where: { name: pr.name } });
    // Invisibles tant que leurs vignettes et vidéos d'exemple n'existent pas (lot 6).
    if (!exists)
      await db.preset.create({
        data: { ...pr, productId: videoId, sortOrder: i, visible: false },
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
