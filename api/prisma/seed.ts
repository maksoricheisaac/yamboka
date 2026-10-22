import 'dotenv/config';
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Packs : `credits` = crédits de base ; total = base × (1 + bonus %).
// Totaux attendus (docs 01/03) : 20, 40, 103, 210, 432, 1100.
const PACKS = [
  { name: 'Mini', price: 500, credits: 20, bonusPercent: 0, featured: false },
  { name: 'Découverte', price: 1000, credits: 40, bonusPercent: 0, featured: false },
  { name: 'Créateur', price: 2500, credits: 100, bonusPercent: 3, featured: true },
  { name: 'Pro', price: 5000, credits: 200, bonusPercent: 5, featured: false },
  { name: 'Business', price: 10000, credits: 400, bonusPercent: 8, featured: false },
  { name: 'Agence', price: 25000, credits: 1000, bonusPercent: 10, featured: false },
];

const PRODUCTS = [
  { code: 'VIDEO_LIGHT_480', name: 'Vidéo Light 480p', providerModel: 'higgsfield/genjutsu-light/motion-transfer/v1.0', resolution: '480p', billingUnit: 'SECOND', creditsPerUnit: 4, providerCostUsdPerUnit: '0.05', billableMultiplier: 2, minSeconds: 4, maxSeconds: 15, phase: 'MVP', active: true },
  { code: 'IMAGE_SOUL2', name: 'Image portrait (Soul 2)', providerModel: 'higgsfield-ai/soul/v2/standard', resolution: null, billingUnit: 'IMAGE', creditsPerUnit: 2, providerCostUsdPerUnit: '0.0057', billableMultiplier: 1, minSeconds: null, maxSeconds: null, phase: 'MVP', active: true },
  { code: 'VIDEO_LIGHT_720', name: 'Vidéo Light 720p', providerModel: 'higgsfield/genjutsu-light/motion-transfer/v1.0', resolution: '720p', billingUnit: 'SECOND', creditsPerUnit: 8, providerCostUsdPerUnit: '0.10', billableMultiplier: 2, minSeconds: 4, maxSeconds: 15, phase: 'PHASE_2', active: false },
  { code: 'VIDEO_PRO_480', name: 'Vidéo Pro 480p', providerModel: 'higgsfield/genjutsu/motion-transfer/v1.0', resolution: '480p', billingUnit: 'SECOND', creditsPerUnit: 13, providerCostUsdPerUnit: '0.318', billableMultiplier: 1, minSeconds: 1, maxSeconds: 30, phase: 'PHASE_2', active: false },
  { code: 'VIDEO_PRO_720', name: 'Vidéo Pro 720p', providerModel: 'higgsfield/genjutsu/motion-transfer/v1.0', resolution: '720p', billingUnit: 'SECOND', creditsPerUnit: 28, providerCostUsdPerUnit: '0.681', billableMultiplier: 1, minSeconds: 1, maxSeconds: 30, phase: 'PHASE_2', active: false },
  { code: 'POSTER_IDEOGRAM', name: 'Affiche avec texte', providerModel: 'ideogram', resolution: null, billingUnit: 'IMAGE', creditsPerUnit: 4, providerCostUsdPerUnit: '0.03', billableMultiplier: 1, minSeconds: null, maxSeconds: null, phase: 'PHASE_2', active: false },
] as const;

const SETTINGS: Record<string, unknown> = {
  usdToXafRate: 575,
  fxFeePercent: 6,
  openpayCommissionPercent: 5,
  regenOverheadPercent: 15,
  minMarginPercent: 15,
  welcomeCredits: 4,
  welcomeExpiryDays: 30,
  purchasedCreditsExpiryMonths: 12,
  maxConcurrentGenerationsPerUser: 2,
  maxConcurrentGenerationsGlobal: 20,
  inputRetentionDays: 7,
  outputRetentionDays: 90,
  deletionReminderDays: 7,
  providerBalanceAlertUsd: 10,
  failureRateAlertPercent: 20,
  maintenanceMode: false,
  maintenanceMessage: 'Yamboka est en maintenance. Les nouvelles créations reprendront très bientôt.',
};

const LEGAL = [
  { type: 'CGU', content: "Conditions générales d'utilisation de Yamboka. TEXTE DE BASE À FAIRE RELIRE PAR UN JURISTE avant publication." },
  { type: 'CHARTE', content: "Charte d'utilisation responsable : sont interdits les contenus sexuels, impliquant des mineurs, l'usurpation d'identité, les contenus politiques trompeurs, le harcèlement, l'incitation à la haine ou à la violence et les arnaques. TEXTE DE BASE À FAIRE RELIRE." },
  { type: 'CONFIDENTIALITE', content: "Politique de confidentialité : fichiers envoyés conservés 7 jours, vidéos générées 90 jours, stockage Cloudflare R2, envoi des fichiers au fournisseur de génération. TEXTE DE BASE À FAIRE RELIRE." },
] as const;

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error('ADMIN_EMAIL et ADMIN_PASSWORD sont requis pour le seed.');

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      firstName: 'Admin',
      lastName: 'Yamboka',
      role: 'ADMIN',
      emailVerifiedAt: new Date(),
      passwordHash: await hash(password),
    },
  });

  await prisma.currencySetting.upsert({ where: { currency: 'XAF' }, update: {}, create: { currency: 'XAF', creditValue: 25 } });

  for (const [i, p] of PACKS.entries()) {
    await prisma.creditPack.upsert({
      where: { country_name: { country: 'CG', name: p.name } },
      update: {},
      create: { ...p, country: 'CG', currency: 'XAF', sortOrder: i },
    });
  }

  const products = new Map<string, string>();
  for (const p of PRODUCTS) {
    const row = await prisma.generationProduct.upsert({ where: { code: p.code }, update: {}, create: p });
    products.set(p.code, row.id);
  }

  const videoId = products.get('VIDEO_LIGHT_480')!;
  const presets = [
    { name: 'Danse afro', category: 'danse', type: 'MOTION', description: 'Fais danser ton personnage sur le mouvement de ta vidéo.' },
    { name: 'Pub de boutique', category: 'pub', type: 'LOOK', description: 'Une courte publicité pour ta boutique à partir de ta vidéo.' },
    { name: 'Anniversaire', category: 'anniversaire', type: 'MOTION', description: "Une vidéo d'anniversaire personnalisée." },
  ] as const;
  for (const [i, pr] of presets.entries()) {
    const exists = await prisma.preset.findFirst({ where: { name: pr.name } });
    // Invisibles tant que leurs vignettes et vidéos d'exemple n'existent pas (lot 6).
    if (!exists) await prisma.preset.create({ data: { ...pr, productId: videoId, sortOrder: i, visible: false } });
  }

  for (const [key, value] of Object.entries(SETTINGS)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value: value as never } });
  }

  for (const doc of LEGAL) {
    await prisma.legalDocument.upsert({
      where: { type_version: { type: doc.type, version: 1 } },
      update: {},
      create: { ...doc, version: 1, major: true },
    });
  }
  console.log('Seed terminé.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
