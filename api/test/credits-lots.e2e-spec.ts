import { INestApplication } from '@nestjs/common';
import { CreditsService } from '../src/credits/credits.service';
import { createApp, prismaOf } from './helpers';
import {
  addLot,
  ledgerOf,
  lotsMatchLedger,
  makeGeneration,
  userWithBalance,
} from './finance-helpers';

/** Lots de crédits : achat, bonus de premier achat, consommation FIFO et restitution. PostgreSQL réel. */
describe('Lots de crédits (e2e)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof prismaOf>;
  let credits: CreditsService;

  beforeAll(async () => {
    app = await createApp();
    prisma = prismaOf(app);
    credits = app.get(CreditsService);
  });
  afterAll(async () => {
    await app.close();
  });

  const reserve = (userId: string, generationId: string, amount: number) =>
    prisma.$transaction((tx) =>
      credits.reserve(tx, { userId, generationId, amount }),
    );
  const lotRemaining = async (id: string) =>
    (await prisma.creditLot.findUniqueOrThrow({ where: { id } })).remaining;

  describe('Achat et bonus de premier achat', () => {
    const inOneYear = () => new Date(Date.now() + 365 * 86_400_000);

    /** Un paiement déjà confirmé (statut SUCCESS), comme au moment où verify() crédite. */
    async function successfulPayment(userId: string, credits = 1000) {
      const pack = await prisma.creditPack.findFirstOrThrow();
      return prisma.payment.create({
        data: {
          userId,
          packId: pack.id,
          country: 'CG',
          currency: 'XAF',
          amount: 5000,
          credits,
          gateway: 'mock',
          operator: 'MTN',
          payerPhone: '242061234567',
          status: 'SUCCESS',
          creditedAt: new Date(),
        },
      });
    }
    const grant = (
      userId: string,
      paymentId: string,
      reference: string,
      bonusPercent: number,
      base = 1000,
    ) =>
      prisma.$transaction((tx) =>
        credits.grantPurchase(tx, {
          userId,
          paymentId,
          reference: `${userId.slice(0, 8)}-${reference}`,
          baseCredits: base,
          expiresAt: inOneYear(),
          bonusPercent,
        }),
      );

    it('premier achat : un lot d’achat et un lot de bonus distinct, de même validité', async () => {
      const user = await userWithBalance(app);
      const pay = await successfulPayment(user.id, 2600);
      expect(await grant(user.id, pay.id, 'REF-1', 20, 2600)).toEqual({
        created: true,
        bonusCredits: 520,
      });
      expect(await credits.getBalance(user.id)).toBe(3120);
      const lots = await prisma.creditLot.findMany({
        where: { userId: user.id },
        orderBy: { initialAmount: 'desc' },
      });
      expect(lots.map((l) => [l.kind, l.initialAmount])).toEqual([
        ['PURCHASE', 2600],
        ['FIRST_PURCHASE_BONUS', 520],
      ]);
      expect(lots[0].expiresAt.getTime()).toBe(lots[1].expiresAt.getTime());
      expect(await lotsMatchLedger(app, user.id)).toEqual({
        ledger: 3120,
        lots: 3120,
      });
    });

    it('un second achat ne reçoit jamais de bonus', async () => {
      const user = await userWithBalance(app);
      const first = await successfulPayment(user.id);
      await grant(user.id, first.id, 'REF-A', 20);
      const second = await successfulPayment(user.id);
      expect(await grant(user.id, second.id, 'REF-B', 20)).toEqual({
        created: true,
        bonusCredits: 0,
      });
      expect(await credits.getBalance(user.id)).toBe(1000 + 200 + 1000);
      expect(
        await prisma.creditLedger.count({
          where: { userId: user.id, type: 'FIRST_PURCHASE_BONUS' },
        }),
      ).toBe(1);
    });

    it('le même paiement crédité trois fois en parallèle : un seul achat, un seul bonus', async () => {
      const user = await userWithBalance(app);
      const pay = await successfulPayment(user.id);
      await Promise.all([
        grant(user.id, pay.id, 'REF-1', 20),
        grant(user.id, pay.id, 'REF-1', 20),
        grant(user.id, pay.id, 'REF-1', 20),
      ]);
      expect(await credits.getBalance(user.id)).toBe(1200);
      const rows = await ledgerOf(app, user.id);
      expect(rows.map((r) => [r.type, r.amount, r.reference]).sort()).toEqual([
        [
          'FIRST_PURCHASE_BONUS',
          200,
          `firstbonus:${user.id.slice(0, 8)}-REF-1`,
        ],
        ['PURCHASE', 1000, `pay:${user.id.slice(0, 8)}-REF-1`],
      ]);
      expect(await lotsMatchLedger(app, user.id)).toEqual({
        ledger: 1200,
        lots: 1200,
      });
    });

    it('pourcentage nul (pack sans bonus ou bonus désactivé) : aucun bonus', async () => {
      const user = await userWithBalance(app);
      const pay = await successfulPayment(user.id);
      expect(await grant(user.id, pay.id, 'REF-1', 0)).toMatchObject({
        bonusCredits: 0,
      });
      expect(await credits.getBalance(user.id)).toBe(1000);
    });

    it('le pourcentage propre au pack est appliqué, arrondi à l’inférieur', async () => {
      const user = await userWithBalance(app);
      const pay = await successfulPayment(user.id, 1255);
      expect(await grant(user.id, pay.id, 'REF-1', 10, 1255)).toMatchObject({
        bonusCredits: 125,
      });
    });

    it('un paiement en attente ne crée ni crédit ni lot', async () => {
      const user = await userWithBalance(app);
      const pack = await prisma.creditPack.findFirstOrThrow();
      await prisma.payment.create({
        data: {
          userId: user.id,
          packId: pack.id,
          country: 'CG',
          currency: 'XAF',
          amount: 5000,
          credits: 1000,
          gateway: 'mock',
          operator: 'MTN',
          payerPhone: '242061234567',
          status: 'PENDING',
          firstPurchaseBonusPercent: 20,
        },
      });
      expect(await credits.getBalance(user.id)).toBe(0);
      expect(await prisma.creditLot.count({ where: { userId: user.id } })).toBe(
        0,
      );
    });

    it('la base refuse un second bonus de premier achat pour le même compte, même en contournant le service', async () => {
      const user = await userWithBalance(app);
      const make = (ref: string) =>
        prisma.creditLedger.create({
          data: {
            userId: user.id,
            amount: 5,
            type: 'FIRST_PURCHASE_BONUS',
            reference: `firstbonus:${ref}`,
          },
        });
      await make('A');
      await expect(make('B')).rejects.toThrow();
    });
  });

  describe('Consommation FIFO et restitution', () => {
    it('une réservation prélève d’abord le lot qui expire le plus tôt, puis le suivant', async () => {
      const user = await userWithBalance(app);
      const late = await addLot(app, user.id, 100, { expiresInDays: 300 });
      const soon = await addLot(app, user.id, 30, { expiresInDays: 10 });
      const gen = await makeGeneration(app, user.id);
      await reserve(user.id, gen.id, 50);
      expect(await lotRemaining(soon.id)).toBe(0);
      expect(await lotRemaining(late.id)).toBe(80);
      const allocations = await prisma.lotAllocation.findMany({
        where: { generationId: gen.id },
      });
      expect(allocations.map((a) => [a.lotId, a.amount]).sort()).toEqual(
        [
          [soon.id, 30],
          [late.id, 20],
        ].sort(),
      );
      expect(await lotsMatchLedger(app, user.id)).toEqual({
        ledger: 80,
        lots: 80,
      });
    });

    it('à échéance égale, le lot le plus ancien part en premier', async () => {
      const user = await userWithBalance(app);
      const newer = await addLot(app, user.id, 10, {
        createdAt: new Date(Date.now() - 1000),
      });
      const older = await addLot(app, user.id, 10, {
        createdAt: new Date(Date.now() - 5000),
      });
      await prisma.creditLot.update({
        where: { id: older.id },
        data: { expiresAt: newer.expiresAt },
      });
      const gen = await makeGeneration(app, user.id);
      await reserve(user.id, gen.id, 4);
      expect(await lotRemaining(older.id)).toBe(6);
      expect(await lotRemaining(newer.id)).toBe(10);
    });

    it('la libération restitue chaque lot pour ce qui lui a été pris', async () => {
      const user = await userWithBalance(app);
      const soon = await addLot(app, user.id, 30, { expiresInDays: 10 });
      const late = await addLot(app, user.id, 100, { expiresInDays: 300 });
      const gen = await makeGeneration(app, user.id);
      await reserve(user.id, gen.id, 50);
      await credits.release(gen.id);
      expect(await lotRemaining(soon.id)).toBe(30);
      expect(await lotRemaining(late.id)).toBe(100);
      expect(await credits.getBalance(user.id)).toBe(130);
      expect(await lotsMatchLedger(app, user.id)).toEqual({
        ledger: 130,
        lots: 130,
      });
    });

    it('une libération répétée ou concurrente ne restitue qu’une fois', async () => {
      const user = await userWithBalance(app, 100);
      const gen = await makeGeneration(app, user.id);
      await reserve(user.id, gen.id, 40);
      await Promise.all(
        Array.from({ length: 5 }, () => credits.release(gen.id)),
      );
      expect(await credits.getBalance(user.id)).toBe(100);
      expect(await lotsMatchLedger(app, user.id)).toEqual({
        ledger: 100,
        lots: 100,
      });
    });

    it('un lot échu n’est jamais dépensé : seul le solde utilisable compte', async () => {
      const user = await userWithBalance(app);
      const expired = await addLot(app, user.id, 50, { expiresInDays: -1 });
      await addLot(app, user.id, 20, { expiresInDays: 30 });
      const gen = await makeGeneration(app, user.id);
      await expect(reserve(user.id, gen.id, 30)).rejects.toMatchObject({
        status: 402,
        response: { required: 30, available: 20 },
      });
      await credits.runExpiry();
      expect(await lotRemaining(expired.id)).toBe(0);
      expect(await credits.getBalance(user.id)).toBe(20);
      expect(await lotsMatchLedger(app, user.id)).toEqual({
        ledger: 20,
        lots: 20,
      });
    });

    it('des crédits libérés dans un lot devenu échu expirent aussitôt, sans être réécrits par le job', async () => {
      const user = await userWithBalance(app);
      const lot = await addLot(app, user.id, 10, { expiresInDays: 1 });
      const gen = await makeGeneration(app, user.id);
      await reserve(user.id, gen.id, 10);
      // Le lot arrive à échéance pendant que la création est en cours.
      await prisma.creditLot.update({
        where: { id: lot.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await credits.release(gen.id);
      expect(await lotRemaining(lot.id)).toBe(0);
      expect(await credits.getBalance(user.id)).toBe(0);
      expect(await lotsMatchLedger(app, user.id)).toEqual({
        ledger: 0,
        lots: 0,
      });
      const before = (await ledgerOf(app, user.id)).length;
      await credits.runExpiry();
      expect((await ledgerOf(app, user.id)).length).toBe(before);
    });

    it('une réservation antérieure aux lots (sans détail) est restituée dans un lot neuf', async () => {
      const user = await userWithBalance(app, 100);
      const gen = await makeGeneration(app, user.id);
      // RESERVE écrit directement, sans allocation : cas des données antérieures aux lots.
      await prisma.creditLedger.create({
        data: {
          userId: user.id,
          amount: -25,
          type: 'RESERVE',
          reference: `reserve:${gen.id}`,
          generationId: gen.id,
        },
      });
      await prisma.creditLot.updateMany({
        where: { userId: user.id },
        data: { remaining: 75 },
      });
      await credits.release(gen.id);
      expect(await credits.getBalance(user.id)).toBe(100);
      expect(await lotsMatchLedger(app, user.id)).toEqual({
        ledger: 100,
        lots: 100,
      });
    });

    it('la base refuse un lot surconsommé ou rechargé au-delà de son montant initial', async () => {
      const user = await userWithBalance(app, 10);
      const lot = await prisma.creditLot.findFirstOrThrow({
        where: { userId: user.id },
      });
      await expect(
        prisma.creditLot.update({
          where: { id: lot.id },
          data: { remaining: -1 },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.creditLot.update({
          where: { id: lot.id },
          data: { remaining: 11 },
        }),
      ).rejects.toThrow();
    });

    it('un retrait administratif est pris sur les lots qui expirent le plus tôt', async () => {
      const user = await userWithBalance(app);
      const admin = await userWithBalance(app);
      const soon = await addLot(app, user.id, 10, { expiresInDays: 5 });
      const late = await addLot(app, user.id, 50, { expiresInDays: 200 });
      await credits.adjust({
        userId: user.id,
        amount: -15,
        reason: 'Correction',
        adminId: admin.id,
      });
      expect(await lotRemaining(soon.id)).toBe(0);
      expect(await lotRemaining(late.id)).toBe(45);
      expect(await lotsMatchLedger(app, user.id)).toEqual({
        ledger: 45,
        lots: 45,
      });
    });

    it('un ajout administratif crée un lot qui expire (12 mois par défaut)', async () => {
      const user = await userWithBalance(app);
      const admin = await userWithBalance(app);
      const { reference } = await credits.adjust({
        userId: user.id,
        amount: 20,
        reason: 'Geste commercial',
        adminId: admin.id,
      });
      const ledger = await prisma.creditLedger.findUniqueOrThrow({
        where: { reference },
      });
      const lot = await prisma.creditLot.findUniqueOrThrow({
        where: { ledgerId: ledger.id },
      });
      expect(lot.kind).toBe('ADMIN_ADJUST');
      const days = (lot.expiresAt.getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(360);
      expect(days).toBeLessThan(367);
    });

    it('après une rafale de réservations, libérations et captures, la somme des lots égale le journal', async () => {
      const user = await userWithBalance(app);
      await addLot(app, user.id, 60, { expiresInDays: 20 });
      await addLot(app, user.id, 90, { expiresInDays: 90 });
      const gens = await Promise.all(
        Array.from({ length: 12 }, () => makeGeneration(app, user.id)),
      );
      const outcomes = await Promise.allSettled(
        gens.map((g) => reserve(user.id, g.id, 20)),
      );
      const reserved = gens.filter(
        (_, i) => outcomes[i].status === 'fulfilled',
      );
      expect(reserved).toHaveLength(7); // 150 crédits : sept réservations de 20
      await Promise.all(
        reserved.map((g, i) =>
          i % 2 === 0 ? credits.release(g.id) : credits.capture(g.id),
        ),
      );
      const { ledger, lots } = await lotsMatchLedger(app, user.id);
      expect(lots).toBe(ledger);
      // 4 libérées (rendues) et 3 capturées (60 consommés) : 150 − 60.
      expect(ledger).toBe(90);
    });
  });
});
