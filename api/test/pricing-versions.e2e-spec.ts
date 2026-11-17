import './isolate-pricing-db';
import { INestApplication } from '@nestjs/common';
import { PricingService } from '../src/pricing/pricing.service';
import { createApp, prismaOf } from './helpers';
import { resetDatabase } from './reset-database';

/**
 * Paramètres et tarifs versionnés : un changement ajoute une ligne datée, et le calcul d'une ancienne
 * génération reste celui de son époque. C'est la garantie « rien ne se recalcule après coup ».
 */
describe('Tarifs et paramètres versionnés (e2e)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof prismaOf>;
  let pricing: PricingService;
  const MODEL = 'alibaba/wan-3.0/image-to-video';

  beforeAll(async () => {
    await resetDatabase(process.env.DATABASE_URL!);
    app = await createApp();
    prisma = prismaOf(app);
    pricing = app.get(PricingService);
  }, 120_000);
  afterAll(async () => {
    await app.close();
  });

  describe('Reprise initiale (migration)', () => {
    it('part des réglages existants, marqués provisoires', async () => {
      const config = await pricing.config();
      expect(config.provisional).toBe(true);
      expect(config.marginPercent).toBe('10.0000');
      expect(config.cardFcfaPerUsd).toBe('620.0000');
      expect(config.circuitLossPercent).toBe('9.0000');
      expect(config.minWithdrawalXaf).toBe(2500);
      // Plafonds prudents, relevés par la migration suivante pour laisser passer une 1080p de 30 s (6 $).
      expect(config.dailyCapMicroUsd).toBe(40_000_000n);
      expect(config.dailyUserCapMicroUsd).toBe(12_000_000n);
      // La première version reste lisible : l'historique montre la correction.
      const first = await prisma.pricingConfig.findFirstOrThrow({
        orderBy: { effectiveFrom: 'asc' },
      });
      expect(first.dailyUserCapMicroUsd).toBe(5_000_000n);
      expect(config.safetyMarginMicroUsd).toBe(2_000_000n);
    });

    it('reprend le tarif de chaque résolution active', async () => {
      const p480 = await pricing.modelPrice({
        providerModel: MODEL,
        resolution: '480p',
      });
      expect(p480.microUsdPerUnit).toBe(50_000n); // 0,05 $/s, mesuré le 5 nov.
      expect(p480.source).toBe('MANUAL');
      const p1080 = await pricing.modelPrice({
        providerModel: MODEL,
        resolution: '1080p',
      });
      expect(p1080.microUsdPerUnit).toBe(200_000n);
    });

    it('calcule le coût fournisseur d’une vidéo et refuse une durée hors bornes', () => {
      const price = {
        id: 'x',
        providerModel: MODEL,
        resolution: '480p',
        billingUnit: 'SECOND' as const,
        microUsdPerUnit: 50_000n,
        billableMultiplier: 1,
        minSeconds: 2,
        maxSeconds: 30,
        source: 'MANUAL' as const,
        effectiveFrom: new Date(),
      };
      // 10 s × 0,05 $ = 0,50 $.
      expect(pricing.providerCostMicroUsd(price, { durationSeconds: 10 })).toBe(
        500_000n,
      );
      expect(() =>
        pricing.providerCostMicroUsd(price, { durationSeconds: 1 }),
      ).toThrow(/au moins 2 secondes/);
      expect(() =>
        pricing.providerCostMicroUsd(price, { durationSeconds: 31 }),
      ).toThrow(/ne doit pas dépasser 30/);
    });
  });

  describe('Nouvelle version des paramètres', () => {
    it('ajoute une ligne sans toucher à l’ancienne', async () => {
      const before = await pricing.config();
      const admin = await prisma.user.findFirstOrThrow({
        where: { role: 'ADMIN' },
      });
      const after = await pricing.updateConfig(
        { marginPercent: 15, provisional: false },
        { adminId: admin.id, note: 'Marge relevée après mesure' },
      );
      expect(after.marginPercent).toBe('15.0000');
      expect(after.provisional).toBe(false);
      // Les valeurs non précisées sont reprises telles quelles.
      expect(after.cardFcfaPerUsd).toBe(before.cardFcfaPerUsd);
      expect(after.id).not.toBe(before.id);

      // L'ancienne version est toujours là, intacte, et c'est elle qui vaut pour une date antérieure.
      const old = await pricing.config(
        new Date(after.effectiveFrom.getTime() - 1000),
      );
      expect(old.id).toBe(before.id);
      expect(old.marginPercent).toBe(before.marginPercent);
      expect(await prisma.pricingConfig.count()).toBeGreaterThanOrEqual(2);
    });

    it('refuse une modification sur place, même en SQL direct', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "PricingConfig" SET "marginPercent" = 0`,
        ),
      ).rejects.toThrow(/ajout seul/);
      await expect(
        prisma.$executeRawUnsafe('DELETE FROM "PricingConfig"'),
      ).rejects.toThrow(/ajout seul/);
    });

    it('refuse des valeurs incohérentes', async () => {
      const admin = await prisma.user.findFirstOrThrow({
        where: { role: 'ADMIN' },
      });
      // Plafond par utilisateur supérieur au plafond global : contrainte de base.
      await expect(
        pricing.updateConfig(
          { dailyUserCapUsd: 100, dailyCapUsd: 10 },
          { adminId: admin.id },
        ),
      ).rejects.toThrow();
    });
  });

  describe('Nouveau tarif de modèle', () => {
    it('garde l’ancien tarif pour les dates antérieures', async () => {
      const t0 = new Date();
      await new Promise((r) => setTimeout(r, 10));
      await pricing.addModelPrice({
        providerModel: MODEL,
        resolution: '480p',
        usdPerUnit: '0.08',
        source: 'ESTIMATE',
        minSeconds: 2,
        maxSeconds: 30,
        note: 'Estimation du fournisseur',
      });

      const now = await pricing.modelPrice({
        providerModel: MODEL,
        resolution: '480p',
      });
      expect(now.microUsdPerUnit).toBe(80_000n);
      expect(now.source).toBe('ESTIMATE');

      // Une génération d'avant le changement garde le tarif de son époque.
      const past = await pricing.modelPrice({
        providerModel: MODEL,
        resolution: '480p',
        at: t0,
      });
      expect(past.microUsdPerUnit).toBe(50_000n);
    });

    it('n’affecte pas les autres résolutions', async () => {
      const p720 = await pricing.modelPrice({
        providerModel: MODEL,
        resolution: '720p',
      });
      expect(p720.microUsdPerUnit).toBe(100_000n);
    });

    it('mesure l’écart entre un tarif observé et le tarif en vigueur', () => {
      // 0,05 $ attendu, 0,08 $ observé = +60 %, bien au-delà du seuil d'alerte de 5 %.
      expect(pricing.deviationPercent(50_000n, 80_000n)).toBe(60);
      // L'écart est symétrique et arrondi au-dessus (2,5 % → 3).
      expect(pricing.deviationPercent(80_000n, 50_000n)).toBe(38);
      expect(pricing.deviationPercent(40_000n, 41_000n)).toBe(3);
      expect(pricing.deviationPercent(50_000n, 50_000n)).toBe(0);
    });

    it('refuse un tarif nul ou négatif', async () => {
      await expect(
        pricing.addModelPrice({
          providerModel: MODEL,
          resolution: '480p',
          usdPerUnit: '0',
          source: 'MANUAL',
        }),
      ).rejects.toThrow(/supérieur à zéro/);
    });

    it('expose l’historique du plus récent au plus ancien', async () => {
      const history = await pricing.priceHistory({ providerModel: MODEL });
      expect(history.length).toBeGreaterThanOrEqual(4);
      for (let i = 1; i < history.length; i++) {
        expect(
          history[i - 1].effectiveFrom.getTime() >=
            history[i].effectiveFrom.getTime(),
        ).toBe(true);
      }
    });
  });
});
