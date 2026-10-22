import { INestApplication } from '@nestjs/common';
import { CreditsService } from '../src/credits/credits.service';
import { createApp, prismaOf } from './helpers';
import {
  addLot,
  ledgerOf,
  makeGeneration,
  userWithBalance,
} from './finance-helpers';

/** Le registre est la partie la plus sensible du projet : ces tests tournent sur un vrai PostgreSQL. */
describe('Registre de crédits (e2e)', () => {
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

  /** Réserve comme le fera le service de génération : dans une transaction qui crée la génération. */
  const reserve = (userId: string, generationId: string, amount: number) =>
    prisma.$transaction((tx) =>
      credits.reserve(tx, { userId, generationId, amount }),
    );

  const codeOf = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      return (
        (e as { getResponse?: () => { code?: string } }).getResponse?.()
          ?.code ?? 'ERREUR_INCONNUE'
      );
    }
    return undefined;
  };

  describe('Solde et immuabilité', () => {
    it('le solde est la somme des mouvements', async () => {
      const user = await userWithBalance(app, 30);
      await addLot(app, user.id, 12);
      expect(await credits.getBalance(user.id)).toBe(42);
    });

    it('un mouvement ne peut jamais être modifié, supprimé ni le registre vidé, même en SQL direct', async () => {
      const user = await userWithBalance(app, 10);
      const [row] = await ledgerOf(app, user.id);
      await expect(
        prisma.$executeRaw`UPDATE "CreditLedger" SET amount = 999 WHERE id = ${row.id}::uuid`,
      ).rejects.toThrow(/ajout seul/);
      await expect(
        prisma.$executeRaw`DELETE FROM "CreditLedger" WHERE id = ${row.id}::uuid`,
      ).rejects.toThrow(/ajout seul/);
      await expect(prisma.$executeRaw`TRUNCATE "CreditLedger"`).rejects.toThrow(
        /ajout seul/,
      );
      expect(await credits.getBalance(user.id)).toBe(10);
    });

    it('refuse un mouvement dont le signe ne correspond pas à son type', async () => {
      const user = await userWithBalance(app);
      await expect(
        prisma.creditLedger.create({
          data: {
            userId: user.id,
            amount: -5,
            type: 'PURCHASE',
            reference: 'x:signe',
          },
        }),
      ).rejects.toThrow();
    });

    it('refuse deux mouvements avec la même référence', async () => {
      const user = await userWithBalance(app);
      const data = {
        userId: user.id,
        amount: 5,
        type: 'BONUS' as const,
        reference: `dup:${user.id}`,
      };
      await prisma.creditLedger.create({ data });
      await expect(prisma.creditLedger.create({ data })).rejects.toThrow();
    });
  });

  describe('Réservation', () => {
    it('réserve : le solde baisse immédiatement', async () => {
      const user = await userWithBalance(app, 100);
      const gen = await makeGeneration(app, user.id, 40);
      expect(await reserve(user.id, gen.id, 40)).toEqual({ created: true });
      expect(await credits.getBalance(user.id)).toBe(60);
      const row = (await ledgerOf(app, user.id)).find(
        (r) => r.type === 'RESERVE',
      )!;
      expect(row).toMatchObject({
        amount: -40,
        reference: `reserve:${gen.id}`,
        generationId: gen.id,
      });
    });

    it('refuse quand le solde est insuffisant, avec le détail, sans rien écrire', async () => {
      const user = await userWithBalance(app, 30);
      const gen = await makeGeneration(app, user.id, 40);
      await expect(reserve(user.id, gen.id, 40)).rejects.toMatchObject({
        status: 402,
        response: {
          code: 'INSUFFICIENT_CREDITS',
          required: 40,
          available: 30,
          missing: 10,
        },
      });
      expect(await credits.getBalance(user.id)).toBe(30);
      expect(
        await prisma.creditLedger.count({ where: { generationId: gen.id } }),
      ).toBe(0);
    });

    it('est idempotente : réserver deux fois la même génération ne débite qu’une fois', async () => {
      const user = await userWithBalance(app, 100);
      const gen = await makeGeneration(app, user.id, 40);
      expect((await reserve(user.id, gen.id, 40)).created).toBe(true);
      expect((await reserve(user.id, gen.id, 40)).created).toBe(false);
      expect(await credits.getBalance(user.id)).toBe(60);
    });

    it('refuse un montant invalide', async () => {
      const user = await userWithBalance(app, 100);
      const gen = await makeGeneration(app, user.id);
      expect(await codeOf(reserve(user.id, gen.id, 0))).toBe('INVALID_AMOUNT');
      expect(await codeOf(reserve(user.id, gen.id, -5))).toBe('INVALID_AMOUNT');
      expect(await codeOf(reserve(user.id, gen.id, 2.5))).toBe(
        'INVALID_AMOUNT',
      );
    });

    it('deux réservations simultanées avec un solde pour une seule : une seule est acceptée (recette)', async () => {
      const user = await userWithBalance(app, 40);
      const [g1, g2] = await Promise.all([
        makeGeneration(app, user.id),
        makeGeneration(app, user.id),
      ]);
      const results = await Promise.allSettled([
        reserve(user.id, g1.id, 40),
        reserve(user.id, g2.id, 40),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(await credits.getBalance(user.id)).toBe(0);
    });

    it('cinq réservations simultanées de 40 avec 100 crédits : deux passent, le solde ne devient jamais négatif', async () => {
      const user = await userWithBalance(app, 100);
      const gens = await Promise.all(
        Array.from({ length: 5 }, () => makeGeneration(app, user.id)),
      );
      const results = await Promise.allSettled(
        gens.map((g) => reserve(user.id, g.id, 40)),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
      for (const r of results.filter((x) => x.status === 'rejected')) {
        expect(r.reason).toMatchObject({
          status: 402,
        });
      }
      expect(await credits.getBalance(user.id)).toBe(20);
    });

    it('vingt petites réservations simultanées : le total réservé ne dépasse jamais le solde', async () => {
      const user = await userWithBalance(app, 100);
      const gens = await Promise.all(
        Array.from({ length: 20 }, () => makeGeneration(app, user.id)),
      );
      const results = await Promise.allSettled(
        gens.map((g) => reserve(user.id, g.id, 10)),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
      expect(await credits.getBalance(user.id)).toBe(0);
    });

    it('la même génération réservée dix fois en parallèle ne débite qu’une fois', async () => {
      const user = await userWithBalance(app, 100);
      const gen = await makeGeneration(app, user.id);
      await Promise.all(
        Array.from({ length: 10 }, () => reserve(user.id, gen.id, 40)),
      );
      expect(await credits.getBalance(user.id)).toBe(60);
      expect(
        await prisma.creditLedger.count({
          where: { reference: `reserve:${gen.id}` },
        }),
      ).toBe(1);
    });
  });

  describe('Capture et remboursement', () => {
    async function reserved(amount = 40) {
      const user = await userWithBalance(app, 100);
      const gen = await makeGeneration(app, user.id, amount);
      await reserve(user.id, gen.id, amount);
      return { user, gen };
    }

    it('capture : mouvement de montant 0, le solde ne bouge plus, idempotent', async () => {
      const { user, gen } = await reserved();
      expect(await credits.capture(gen.id)).toEqual({ created: true });
      expect(await credits.capture(gen.id)).toEqual({ created: false });
      expect(await credits.getBalance(user.id)).toBe(60);
      const row = await prisma.creditLedger.findUniqueOrThrow({
        where: { reference: `capture:${gen.id}` },
      });
      expect(row.amount).toBe(0);
    });

    it('remboursement : les crédits réservés sont rendus, une seule fois', async () => {
      const { user, gen } = await reserved();
      expect(await credits.refund(gen.id)).toEqual({ created: true });
      expect(await credits.refund(gen.id)).toEqual({ created: false });
      expect(await credits.getBalance(user.id)).toBe(100);
    });

    it('rembourse même si l’utilisateur a dépensé le reste entre-temps', async () => {
      const { user, gen } = await reserved(40);
      const other = await makeGeneration(app, user.id);
      await reserve(user.id, other.id, 60); // solde 0
      await credits.refund(gen.id);
      expect(await credits.getBalance(user.id)).toBe(40);
    });

    it('refuse de capturer après un remboursement, et de rembourser après une capture', async () => {
      const a = await reserved();
      await credits.refund(a.gen.id);
      expect(await codeOf(credits.capture(a.gen.id))).toBe('ALREADY_REFUNDED');

      const b = await reserved();
      await credits.capture(b.gen.id);
      expect(await codeOf(credits.refund(b.gen.id))).toBe('ALREADY_CAPTURED');
      expect(await credits.getBalance(b.user.id)).toBe(60);
    });

    it('une capture et un remboursement simultanés : un seul gagne', async () => {
      const { user, gen } = await reserved();
      const results = await Promise.allSettled([
        credits.capture(gen.id),
        credits.refund(gen.id),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const balance = await credits.getBalance(user.id);
      expect([60, 100]).toContain(balance); // soit débité, soit rendu, jamais les deux
      const settled = await prisma.creditLedger.count({
        where: { generationId: gen.id, type: { in: ['CAPTURE', 'REFUND'] } },
      });
      expect(settled).toBe(1);
    });

    it('plusieurs remboursements simultanés : un seul est écrit', async () => {
      const { user, gen } = await reserved();
      await Promise.all(
        Array.from({ length: 8 }, () => credits.refund(gen.id)),
      );
      expect(await credits.getBalance(user.id)).toBe(100);
      expect(
        await prisma.creditLedger.count({
          where: { reference: `refund:${gen.id}` },
        }),
      ).toBe(1);
    });

    it('ne clôt pas une génération qui n’a jamais été réservée', async () => {
      const user = await userWithBalance(app, 10);
      const gen = await makeGeneration(app, user.id);
      expect(await codeOf(credits.capture(gen.id))).toBe('NO_RESERVATION');
      expect(await codeOf(credits.refund(gen.id))).toBe('NO_RESERVATION');
    });
  });

  describe('Achats', () => {
    it('crédite un achat en deux mouvements (crédits de base + bonus), une seule fois', async () => {
      const user = await userWithBalance(app);
      const payment = await prisma.payment.create({
        data: {
          userId: user.id,
          packId: (
            await prisma.creditPack.findFirstOrThrow({
              where: { name: 'Créateur' },
            })
          ).id,
          country: 'CG',
          currency: 'XAF',
          amount: 2500,
          credits: 103,
          bonusCredits: 3,
          gateway: 'mock',
          operator: 'MTN',
          payerPhone: '242061234567',
        },
      });
      const grant = () =>
        prisma.$transaction((tx) =>
          credits.grantPurchase(tx, {
            userId: user.id,
            paymentId: payment.id,
            reference: 'REF-1',
            baseCredits: 100,
            bonusCredits: 3,
            expiresAt: new Date(Date.now() + 365 * 86_400_000),
          }),
        );
      await Promise.all([grant(), grant(), grant()]);
      expect(await credits.getBalance(user.id)).toBe(103);
      const rows = await ledgerOf(app, user.id);
      expect(rows.map((r) => [r.type, r.amount, r.reference]).sort()).toEqual([
        ['BONUS', 3, 'bonus:REF-1'],
        ['PURCHASE', 100, 'pay:REF-1'],
      ]);
    });
  });

  describe('Ajustement administratif', () => {
    it('ajoute ou retire des crédits avec un motif, tracé par l’administrateur', async () => {
      const user = await userWithBalance(app, 10);
      const admin = await userWithBalance(app);
      const up = await credits.adjust({
        userId: user.id,
        amount: 20,
        reason: 'Geste commercial',
        adminId: admin.id,
      });
      expect(up.balance).toBe(30);
      const down = await credits.adjust({
        userId: user.id,
        amount: -5,
        reason: 'Correction',
        adminId: admin.id,
      });
      expect(down.balance).toBe(25);
      const row = await prisma.creditLedger.findUniqueOrThrow({
        where: { reference: up.reference },
      });
      expect(row).toMatchObject({
        type: 'ADJUSTMENT',
        amount: 20,
        note: 'Geste commercial',
        createdById: admin.id,
      });
    });

    it('exige un motif, refuse un montant nul et un solde négatif', async () => {
      const user = await userWithBalance(app, 10);
      const admin = await userWithBalance(app);
      expect(
        await codeOf(
          credits.adjust({
            userId: user.id,
            amount: 5,
            reason: '  ',
            adminId: admin.id,
          }),
        ),
      ).toBe('REASON_REQUIRED');
      expect(
        await codeOf(
          credits.adjust({
            userId: user.id,
            amount: 0,
            reason: 'x y z',
            adminId: admin.id,
          }),
        ),
      ).toBe('INVALID_AMOUNT');
      expect(
        await codeOf(
          credits.adjust({
            userId: user.id,
            amount: -11,
            reason: 'Trop',
            adminId: admin.id,
          }),
        ),
      ).toBe('INSUFFICIENT_CREDITS');
      expect(await credits.getBalance(user.id)).toBe(10);
    });

    it('un ajustement négatif simultané à une réservation ne crée pas de solde négatif', async () => {
      const user = await userWithBalance(app, 50);
      const admin = await userWithBalance(app);
      const gen = await makeGeneration(app, user.id);
      await Promise.allSettled([
        credits.adjust({
          userId: user.id,
          amount: -40,
          reason: 'Correction',
          adminId: admin.id,
        }),
        reserve(user.id, gen.id, 40),
      ]);
      expect(await credits.getBalance(user.id)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Expiration', () => {
    it('expire un lot échu, une seule fois', async () => {
      const user = await userWithBalance(app);
      await addLot(app, user.id, 4, { expiresInDays: -1, type: 'WELCOME' });
      expect(await credits.getBalance(user.id)).toBe(4);

      await credits.runExpiry();
      expect(await credits.getBalance(user.id)).toBe(0);
      const before = (await ledgerOf(app, user.id)).length;
      await credits.runExpiry();
      await credits.runExpiry();
      expect((await ledgerOf(app, user.id)).length).toBe(before);
    });

    it('n’expire pas un lot dont l’échéance n’est pas atteinte', async () => {
      const user = await userWithBalance(app, 50);
      await credits.runExpiry();
      expect(await credits.getBalance(user.id)).toBe(50);
    });

    it('n’expire que le reste d’un lot partiellement consommé', async () => {
      const user = await userWithBalance(app);
      const lot = await addLot(app, user.id, 10, { expiresInDays: 1 });
      const gen = await makeGeneration(app, user.id);
      await reserve(user.id, gen.id, 4);
      await credits.capture(gen.id);
      // Le lot arrive à échéance (on avance « l'horloge » du job).
      await credits.runExpiry(new Date(Date.now() + 2 * 86_400_000));
      const expire = await prisma.creditLedger.findUniqueOrThrow({
        where: { reference: `expire:${lot.id}` },
      });
      expect(expire.amount).toBe(-6);
      expect(await credits.getBalance(user.id)).toBe(0);
    });

    it('consomme d’abord les crédits qui expirent le plus tôt (bienvenue avant achat)', async () => {
      const user = await userWithBalance(app);
      await addLot(app, user.id, 4, { expiresInDays: 30, type: 'WELCOME' });
      await addLot(app, user.id, 100, { expiresInDays: 365 });
      const gen = await makeGeneration(app, user.id);
      await reserve(user.id, gen.id, 4); // les 4 crédits de bienvenue sont censés partir en premier
      await credits.capture(gen.id);
      await credits.runExpiry(new Date(Date.now() + 40 * 86_400_000));
      // Rien n'a expiré : les 4 crédits de bienvenue ont été consommés avant leur échéance.
      expect(await credits.getBalance(user.id)).toBe(100);
    });

    it('ne rend jamais le solde négatif quand on dépense après l’expiration d’un lot antérieur', async () => {
      const user = await userWithBalance(app);
      const day = 86_400_000;
      await addLot(app, user.id, 10, { expiresInDays: 30 }); // A
      await addLot(app, user.id, 10, { expiresInDays: 60 }); // B
      const g1 = await makeGeneration(app, user.id);
      await reserve(user.id, g1.id, 5);
      await credits.capture(g1.id);
      await credits.runExpiry(new Date(Date.now() + 31 * day)); // A expire : −5
      expect(await credits.getBalance(user.id)).toBe(10);
      const g2 = await makeGeneration(app, user.id);
      await reserve(user.id, g2.id, 10);
      await credits.capture(g2.id);
      await credits.runExpiry(new Date(Date.now() + 61 * day)); // B est entièrement consommé : rien à expirer
      expect(await credits.getBalance(user.id)).toBe(0);
    });

    it('un remboursement rend des crédits qui peuvent encore expirer', async () => {
      const user = await userWithBalance(app);
      await addLot(app, user.id, 10, { expiresInDays: 1 });
      const gen = await makeGeneration(app, user.id);
      await reserve(user.id, gen.id, 10);
      await credits.refund(gen.id);
      await credits.runExpiry(new Date(Date.now() + 2 * 86_400_000));
      expect(await credits.getBalance(user.id)).toBe(0);
    });

    it('deux exécutions simultanées du job n’expirent qu’une fois', async () => {
      const user = await userWithBalance(app);
      await addLot(app, user.id, 20, { expiresInDays: -1 });
      await Promise.all([
        credits.runExpiry(),
        credits.runExpiry(),
        credits.runExpiry(),
      ]);
      expect(await credits.getBalance(user.id)).toBe(0);
      expect(
        await prisma.creditLedger.count({
          where: { userId: user.id, type: 'EXPIRE' },
        }),
      ).toBe(1);
    });
  });

  describe('Historique', () => {
    it('liste les mouvements du plus récent au plus ancien, paginés par curseur', async () => {
      const user = await userWithBalance(app);
      for (let i = 1; i <= 5; i++) await addLot(app, user.id, i);
      const first = await credits.listLedger(user.id, { limit: 2 });
      expect(first.items).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();
      const second = await credits.listLedger(user.id, {
        limit: 2,
        cursor: first.nextCursor!,
      });
      const third = await credits.listLedger(user.id, {
        limit: 2,
        cursor: second.nextCursor!,
      });
      const all = [...first.items, ...second.items, ...third.items];
      expect(all.map((i) => i.amount)).toEqual([5, 4, 3, 2, 1]);
      expect(third.nextCursor).toBeNull();
    });
  });
});
