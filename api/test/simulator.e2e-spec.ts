import './isolate-simulator-db';
import { INestApplication } from '@nestjs/common';
import type { SimulationView } from '@yamboka/shared';
import { Client, createApp, prismaOf } from './helpers';
import { resetDatabase } from './reset-database';
import { TEST_ENV } from './test-env';

/**
 * Simulateur d'administration : il doit dire, avant toute décision de prix, combien de crédits une vidéo
 * devrait coûter pour ne jamais passer sous son coût — et signaler les cas où la grille est en dessous.
 */
describe('Simulateur de tarification (e2e)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof prismaOf>;
  let admin: Client;

  const simulate = async (query = ''): Promise<SimulationView> => {
    const res = await admin
      .get(`/api/admin/finance/simulate${query}`)
      .expect(200);
    return res.body as SimulationView;
  };

  /** Ligne d'une résolution et d'une durée données (toujours présente dans le catalogue de test). */
  const videoOf = (s: SimulationView, resolution: string, seconds: number) => {
    const row = s.videos.find(
      (v) => v.resolution === resolution && v.durationSeconds === seconds,
    );
    if (!row) throw new Error(`Ligne ${resolution}/${seconds}s absente.`);
    return row;
  };

  beforeAll(async () => {
    await resetDatabase(process.env.DATABASE_URL!);
    app = await createApp();
    prisma = prismaOf(app);
    admin = new Client(app);
    await admin
      .post('/api/auth/login', {
        email: TEST_ENV.ADMIN_EMAIL,
        password: TEST_ENV.ADMIN_PASSWORD,
      })
      .expect(200);
  }, 120_000);
  afterAll(async () => {
    await app.close();
  });

  it('refuse l’accès à un non-administrateur', async () => {
    const client = new Client(app);
    await client.get('/api/admin/finance/simulate').expect(401);
  });

  it('chiffre chaque vidéo et désigne le pack qui contraint le plancher', async () => {
    const s = await simulate();
    // Taux provisoire tant qu'aucune recharge n'est mesurée. Le scénario PESSIMISTE s'applique tant que
    // la configuration est provisoire : perte de circuit plancher de 14 %, soit 620 ÷ 0,86 × 1,02.
    expect(s.rateMeasured).toBe(false);
    expect(s.pricingRate).toBe('735.3490');
    expect(s.configProvisional).toBe(true);
    // Plancher : le pack le moins favorable, bonus compté sur chaque crédit (100 % au lancement).
    expect(s.bonusValuationPercent).toBe('100.0000');
    expect(s.floorFromPack).toBeTruthy();
    expect(Number(s.creditFloorFcfa)).toBeGreaterThan(0);

    const light = videoOf(s, '480p', 5);
    // 5 s × 0,05 $ = 0,25 $ → 184 F au taux retenu, × 1,10 de marge = 203 F à rapporter.
    expect(light.costUsd).toBe('0.2500');
    expect(light.netNeededFcfa).toBe(203);
    // Les crédits facturés sont DÉRIVÉS du coût : la grille ne peut plus être sous le coût.
    expect(light.chargedCredits).toBeGreaterThanOrEqual(light.requiredCredits);
    expect(light.belowCost).toBe(false);
    expect(light.worst.belowCost).toBe(false);
    expect(s.anyBelowCost).toBe(false);
  });

  it('un scénario ne modifie RIEN : les paramètres en vigueur sont intacts après coup', async () => {
    const before = await prisma.pricingConfig.count();
    const worse = await simulate('?circuitLossPercent=20&marginPercent=30');
    expect(worse.circuitLossPercent).toBe('20');
    expect(worse.marginPercent).toBe('30');
    // Plus de perte de circuit et plus de marge : il faut encore plus de crédits.
    const base = await simulate();
    const credits = (s: SimulationView) => s.videos[0].requiredCredits;
    expect(credits(worse)).toBeGreaterThan(credits(base));
    expect(await prisma.pricingConfig.count()).toBe(before);
  });

  it('sans bonus valorisé, le plancher monte et il faut moins de crédits', async () => {
    const withBonus = await simulate('?bonusValuationPercent=100');
    const without = await simulate('?bonusValuationPercent=0');
    expect(Number(without.creditFloorFcfa)).toBeGreaterThan(
      Number(withBonus.creditFloorFcfa),
    );
    expect(without.videos[0].requiredCredits).toBeLessThanOrEqual(
      withBonus.videos[0].requiredCredits,
    );
  });

  it('chiffre le coût du bonus de chaque pack', async () => {
    const s = await simulate();
    const starter = s.packs.find((p) => p.name === 'Starter');
    expect(starter).toBeDefined();
    expect(starter!.bonusCredits).toBeGreaterThan(0);
    expect(starter!.bonusCostFcfa).toBeGreaterThan(0);
    // Le net reçu est inférieur au prix affiché : les frais d'encaissement sont absorbés.
    expect(starter!.netFcfa).toBeLessThanOrEqual(starter!.priceFcfa);
  });

  it('aucune ligne du catalogue ne se vend sous son coût, dans les deux scénarios', async () => {
    const s = await simulate();
    expect(s.videos.length).toBeGreaterThan(0);
    const bad = s.videos.filter(
      (v) => v.marginFcfa < 0 || v.worst.marginFcfa < 0,
    );
    expect(
      bad.map((v) => `${v.modelSlug} ${v.resolution} ${v.durationSeconds}s`),
    ).toEqual([]);
    expect(s.anyBelowCost).toBe(false);
  });

  it('accepte les durées demandées et refuse un scénario mal formé', async () => {
    const s = await simulate('?durations=5,10');
    const seconds = new Set(s.videos.map((v) => v.durationSeconds));
    expect([...seconds].sort((a, b) => a - b)).toEqual([5, 10]);
    await admin
      .get('/api/admin/finance/simulate?marginPercent=beaucoup')
      .expect(400);
  });
});
