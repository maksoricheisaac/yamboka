import './isolate-provider-db';
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { formatRate, toRate } from '../src/billing/usd';
import {
  ProviderBalanceExhaustedException,
  ProviderLedgerService,
} from '../src/provider-balance/provider-ledger.service';
import { prismaOf, createApp } from './helpers';
import { resetDatabase } from './reset-database';
import { TEST_ENV } from './test-env';

/**
 * Comptabilité du solde prépayé du fournisseur : le solde est la somme des mouvements, `r_out` est mesuré sur
 * les recharges réelles, et deux générations ne peuvent pas engager le même dollar.
 */
describe('Solde fournisseur (e2e)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof prismaOf>;
  let ledger: ProviderLedgerService;
  let adminId: string;

  /** Génération minimale : le journal USD référence une génération réelle. */
  async function generation(costCredits = 1) {
    const user = await prisma.user.create({
      data: {
        firstName: 'Test',
        lastName: 'Solde',
        email: `solde.${randomUUID().slice(0, 8)}@example.com`,
        emailVerifiedAt: new Date(),
      },
    });
    const product = await prisma.generationProduct.findFirstOrThrow({
      where: { active: true },
    });
    return prisma.generation.create({
      data: {
        userId: user.id,
        productId: product.id,
        creditsCost: costCredits,
        consentAt: new Date(),
      },
    });
  }

  beforeAll(async () => {
    await resetDatabase(process.env.DATABASE_URL!);
    app = await createApp();
    prisma = prismaOf(app);
    ledger = app.get(ProviderLedgerService);
    const admin = await prisma.user.findFirstOrThrow({
      where: { email: TEST_ENV.ADMIN_EMAIL },
    });
    adminId = admin.id;
  }, 120_000);
  afterAll(async () => {
    await app.close();
  });

  /** Le journal est en ajout seul : on vide les mouvements en neutralisant le trigger, comme une restauration. */
  async function clearLedger() {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "ProviderLedger" DISABLE TRIGGER provider_ledger_no_update_delete',
    );
    await prisma.$executeRawUnsafe('DELETE FROM "ProviderLedger"');
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "ProviderLedger" ENABLE TRIGGER provider_ledger_no_update_delete',
    );
    await prisma.providerBalanceCalibration.deleteMany();
    await prisma.providerTopUp.deleteMany();
  }

  beforeEach(clearLedger);

  describe('Journal en ajout seul', () => {
    it('refuse toute modification ou suppression d’un mouvement, même en SQL direct', async () => {
      await ledger.adjust({
        microUsd: 1_000_000n,
        reason: 'Mise en place',
        adminId,
      });
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "ProviderLedger" SET note = 'reecrit'`,
        ),
      ).rejects.toThrow(/ajout seul/);
      await expect(
        prisma.$executeRawUnsafe('DELETE FROM "ProviderLedger"'),
      ).rejects.toThrow(/ajout seul/);
    });

    it('refuse un mouvement dont le signe contredit son type', async () => {
      await expect(
        prisma.providerLedger.create({
          data: {
            type: 'TOPUP',
            amountMicroUsd: -1n,
            reference: `bad:${randomUUID()}`,
            topUpId: randomUUID(),
          },
        }),
      ).rejects.toThrow();
    });

    it('calcule le solde comme la somme des mouvements', async () => {
      await ledger.adjust({
        microUsd: 2_500_000n,
        reason: 'Dotation initiale',
        adminId,
      });
      await ledger.adjust({
        microUsd: -500_000n,
        reason: 'Correction',
        adminId,
      });
      expect(await ledger.balanceMicroUsd()).toBe(2_000_000n);
    });
  });

  describe('Recharges et taux sortant', () => {
    it('fige r_out à la saisie et crédite le solde', async () => {
      // 15 000 F nets retirés de SasPay pour 20 $ arrivés = 750 F/$.
      const { rOut } = await ledger.recordTopUp({
        netWithdrawnXaf: 15_000,
        receivedUsd: '20.00',
        cardAmountXaf: 15_200,
        steps: [
          { step: 'saspay_withdrawal', amountXaf: 15_150, feeXaf: 150 },
          { step: 'card_payment', amountXaf: 15_000, feeXaf: 200 },
        ],
        adminId,
      });
      expect(rOut).toBe('750.0000');
      expect(await ledger.balanceMicroUsd()).toBe(20_000_000n);

      const movement = await prisma.providerLedger.findFirstOrThrow({
        where: { type: 'TOPUP' },
      });
      expect(movement.amountMicroUsd).toBe(20_000_000n);
      expect(movement.fcfaPerUsd?.toString()).toBe('750');
      const topUp = await prisma.providerTopUp.findFirstOrThrow();
      expect(topUp.measured).toBe(true);
      expect(topUp.netWithdrawnXaf).toBe(15_000);
    });

    it('ne tarife PAS sur un taux mesuré tant qu’il n’est pas appliqué', async () => {
      await ledger.recordTopUp({
        netWithdrawnXaf: 8_000,
        receivedUsd: '10.00',
        cardAmountXaf: 8_100,
        adminId,
      }); // 800 F/$ mesurés, mais pas encore appliqués à la grille
      const rate = await ledger.pricingRate();
      expect(rate.measured).toBe(false);
      // Toujours le provisoire : saisir une recharge ne change aucun prix sans confirmation.
      expect(formatRate(rate.rate)).toBe('694.9451');
      const awaiting = await ledger.topUpsAwaitingRate();
      expect(awaiting).toHaveLength(1);
      expect(Number(awaiting[0].rOut)).toBe(800);
    });

    it('tarife sur le taux le plus défavorable une fois les recharges appliquées', async () => {
      const first = await ledger.recordTopUp({
        netWithdrawnXaf: 7_000,
        receivedUsd: '10.00',
        cardAmountXaf: 7_100,
        adminId,
      }); // 700 F/$
      const second = await ledger.recordTopUp({
        netWithdrawnXaf: 8_000,
        receivedUsd: '10.00',
        cardAmountXaf: 8_100,
        adminId,
      }); // 800 F/$
      await ledger.applyRateToPricing(first.id);
      await ledger.applyRateToPricing(second.id);

      const rate = await ledger.pricingRate();
      expect(rate.measured).toBe(true);
      // Rien n'a été consommé : moyenne pondérée 750, dernière recharge 800 → 800 × 1,02 (fxBufferPercent).
      expect(formatRate(rate.rate)).toBe('816.0000');
      expect(rate.rate >= toRate(800)).toBe(true);
    });

    it('annonce un taux provisoire tant qu’aucune recharge n’est mesurée', async () => {
      const rate = await ledger.pricingRate();
      expect(rate.measured).toBe(false);
      // 620 ÷ (1 − 9 %) = 681,3187 puis × 1,02 : le repli ne prétend pas être une mesure.
      expect(formatRate(rate.rate)).toBe('694.9451');
    });
  });

  describe('Calibrage sur la console du fournisseur', () => {
    it('enregistre l’écart et aligne le solde sur la lecture', async () => {
      await ledger.recordTopUp({
        netWithdrawnXaf: 15_000,
        receivedUsd: '20.00',
        cardAmountXaf: 15_200,
        adminId,
      });
      // La console annonce 18,40 $ : 1,60 $ ont été dépensés sans que le journal le sache.
      const out = await ledger.calibrate({
        readUsd: '18.40',
        note: 'Relevé console',
        adminId,
      });
      expect(out.estimatedUsd).toBe('20.00');
      expect(out.deltaUsd).toBe('-1.60');
      expect(await ledger.balanceMicroUsd()).toBe(18_400_000n);

      const row = await prisma.providerBalanceCalibration.findFirstOrThrow();
      expect(row.deltaMicroUsd).toBe(-1_600_000n);
      const movement = await prisma.providerLedger.findFirstOrThrow({
        where: { type: 'CALIBRATION' },
      });
      expect(movement.amountMicroUsd).toBe(-1_600_000n);
    });

    it('conserve la lecture sans écrire de mouvement quand l’écart est nul', async () => {
      await ledger.adjust({
        microUsd: 5_000_000n,
        reason: 'Dotation',
        adminId,
      });
      const out = await ledger.calibrate({ readUsd: '5.00', adminId });
      expect(out.deltaUsd).toBe('0.00');
      expect(
        await prisma.providerLedger.count({ where: { type: 'CALIBRATION' } }),
      ).toBe(0);
      expect(
        await prisma.providerBalanceCalibration.count(),
      ).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Engagement d’une génération', () => {
    beforeEach(async () => {
      await ledger.recordTopUp({
        netWithdrawnXaf: 7_500,
        receivedUsd: '10.00',
        cardAmountXaf: 7_600,
        adminId,
      });
    });

    it('réserve une seule fois, même rejoué', async () => {
      const g = await generation();
      const first = await prisma.$transaction((tx) =>
        ledger.reserve(tx, { generationId: g.id, costMicroUsd: 250_000n }),
      );
      const second = await prisma.$transaction((tx) =>
        ledger.reserve(tx, { generationId: g.id, costMicroUsd: 250_000n }),
      );
      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(await ledger.balanceMicroUsd()).toBe(9_750_000n);
      expect(await ledger.reservedMicroUsd()).toBe(250_000n);
    });

    it('refuse quand le solde, marge de sécurité déduite, ne couvre pas le coût', async () => {
      const g = await generation();
      await expect(
        prisma.$transaction((tx) =>
          ledger.reserve(tx, {
            generationId: g.id,
            costMicroUsd: 9_000_000n,
            safetyMarginMicroUsd: 2_000_000n,
          }),
        ),
      ).rejects.toBeInstanceOf(ProviderBalanceExhaustedException);
      expect(await ledger.balanceMicroUsd()).toBe(10_000_000n);
    });

    it('laisse passer UNE SEULE de deux générations simultanées quand le solde n’en couvre qu’une', async () => {
      const [a, b] = [await generation(), await generation()];
      const engage = (id: string) =>
        prisma.$transaction((tx) =>
          ledger.reserve(tx, { generationId: id, costMicroUsd: 6_000_000n }),
        );
      const results = await Promise.allSettled([engage(a.id), engage(b.id)]);
      const accepted = results.filter((r) => r.status === 'fulfilled');
      const refused = results.filter((r) => r.status === 'rejected');
      expect(accepted).toHaveLength(1);
      expect(refused).toHaveLength(1);
      expect(refused[0].reason).toBeInstanceOf(
        ProviderBalanceExhaustedException,
      );
      // Le solde n'a bougé que d'un seul engagement : aucun dollar n'a été dépensé deux fois.
      expect(await ledger.balanceMicroUsd()).toBe(4_000_000n);
    });

    it('restitue les dollars d’une génération échouée, une seule fois', async () => {
      const g = await generation();
      await prisma.$transaction((tx) =>
        ledger.reserve(tx, { generationId: g.id, costMicroUsd: 500_000n }),
      );
      expect(await ledger.release(g.id)).toEqual({ created: true });
      expect(await ledger.release(g.id)).toEqual({ created: false });
      expect(await ledger.balanceMicroUsd()).toBe(10_000_000n);
      expect(await ledger.reservedMicroUsd()).toBe(0n);
    });

    it('ne capture jamais ce qui a été restitué, et inversement', async () => {
      const g = await generation();
      await prisma.$transaction((tx) =>
        ledger.reserve(tx, { generationId: g.id, costMicroUsd: 500_000n }),
      );
      await ledger.release(g.id);
      await expect(ledger.capture(g.id)).rejects.toThrow(/restitués/);

      const other = await generation();
      await prisma.$transaction((tx) =>
        ledger.reserve(tx, { generationId: other.id, costMicroUsd: 500_000n }),
      );
      await ledger.capture(other.id);
      await expect(ledger.release(other.id)).rejects.toThrow(/dépensés/);
      // Une capture ne change pas le solde : la dépense a eu lieu à la réservation.
      expect(await ledger.balanceMicroUsd()).toBe(9_500_000n);
      expect(await ledger.reservedMicroUsd()).toBe(0n);
    });

    it('compte la dépense du jour sans les générations restituées', async () => {
      const kept = await generation();
      const failed = await generation();
      for (const [id, cost] of [
        [kept.id, 400_000n],
        [failed.id, 600_000n],
      ] as const) {
        await prisma.$transaction((tx) =>
          ledger.reserve(tx, { generationId: id, costMicroUsd: cost }),
        );
      }
      await ledger.release(failed.id);
      const since = new Date(Date.now() - 3600_000);
      expect(await ledger.spentSince(since)).toBe(400_000n);
    });
  });
});
