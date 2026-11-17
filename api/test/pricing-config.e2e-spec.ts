import './isolate-pricing-config-db';
import { INestApplication } from '@nestjs/common';
import type {
  CreationQuoteView,
  PricingPreview,
  PricingSections,
} from '@yamboka/shared';
import { APP_ORIGIN, Client, createApp, prismaOf } from './helpers';
import { addLot, verifiedClient } from './finance-helpers';
import { resetDatabase } from './reset-database';
import { TEST_ENV } from './test-env';

/**
 * Page « Configuration des calculs » : aucun paramètre de calcul ne passe plus par le code, et une
 * nouvelle version prend effet SANS redéploiement.
 *
 * Ce qui est vérifié ici : un brouillon appliqué change les devis suivants tout de suite, un devis déjà
 * affiché reste honoré, le retour à une version précédente fonctionne, et une configuration qui vendrait
 * sous le coût est refusée sans confirmation renforcée.
 */
describe('Configuration des calculs (e2e)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof prismaOf>;
  let admin: Client;

  const sections = async (): Promise<PricingSections> =>
    (await admin.get('/api/admin/pricing').expect(200)).body as PricingSections;

  const preview = async (
    draft: Record<string, unknown>,
  ): Promise<PricingPreview> =>
    (await admin.post('/api/admin/pricing/preview', draft).expect(200))
      .body as PricingPreview;

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

  it('exige le rôle administrateur', async () => {
    await new Client(app).get('/api/admin/pricing').expect(401);
  });

  it('expose la version en vigueur, le catalogue et ce qui contraint le plancher', async () => {
    const s = await sections();
    expect(s.current.provisional).toBe(true);
    expect(Number(s.current.marginPercent)).toBeGreaterThan(0);
    expect(s.models.length).toBeGreaterThan(0);
    // Le modèle en service est actif et son tarif est complet ; les modèles à calibrer ne le sont pas.
    const active = s.models.filter((m) => m.active);
    expect(active).toHaveLength(1);
    expect(active[0].missingPrices).toBe(0);
    expect(s.packs.length).toBeGreaterThan(0);
    expect(Number(s.creditFloorFcfa)).toBeGreaterThan(0);
    expect(s.pessimisticApplied).toBe(true);
  });

  it('l’aperçu chiffre l’avant / après sans rien enregistrer', async () => {
    const before = await prisma.pricingConfig.count();
    const p = await preview({ marginPercent: '30', note: 'Essai de marge' });
    expect(p.rows.length).toBeGreaterThan(0);
    expect(p.after.marginPercent).toBe('30');
    expect(p.before.marginPercent).not.toBe('30');
    // Plus de marge : le prix équivalent monte sur chaque ligne.
    for (const row of p.rows) {
      expect(row.after.credits).toBeGreaterThanOrEqual(row.before.credits);
    }
    expect(p.rows.some((r) => r.after.credits > r.before.credits)).toBe(true);
    expect(await prisma.pricingConfig.count()).toBe(before);
  });

  it('refuse une variation de prix de plus de 20 % sans confirmation, puis l’accepte', async () => {
    const refused = await admin
      .post('/api/admin/pricing/apply', {
        marginPercent: '80',
        note: 'Marge volontairement très haute',
      })
      .expect(422);
    expect(refused.body.code).toBe('BIG_PRICE_CHANGE');

    const accepted = await admin
      .post('/api/admin/pricing/apply', {
        marginPercent: '80',
        note: 'Marge volontairement très haute',
        confirmBigChange: true,
      })
      .expect(201);
    expect(accepted.body.versionId).toBeTruthy();
  });

  it('refuse une configuration qui vendrait sous le coût, sauf confirmation renforcée', async () => {
    // Taux de change effondré et aucune perte de circuit : la grille deviendrait moins chère que la
    // réalité la plus défavorable. C'est exactement ce que le garde-fou doit attraper.
    const draft = {
      cardFcfaPerUsd: '200',
      circuitLossPercent: '0',
      fxBufferPercent: '0',
      marginPercent: '0',
      provisional: false,
      note: 'Configuration volontairement trop optimiste',
      confirmBigChange: true,
    };
    const p = await preview(draft);
    expect(p.sellsBelowCost).toBe(true);
    expect(p.belowCostLabels.length).toBeGreaterThan(0);

    const refused = await admin
      .post('/api/admin/pricing/apply', draft)
      .expect(422);
    expect(refused.body.code).toBe('SELLS_BELOW_COST');

    await admin
      .post('/api/admin/pricing/apply', { ...draft, confirmBelowCost: true })
      .expect(201);
  });

  it('un brouillon appliqué change les NOUVEAUX devis tout de suite, et laisse les devis déjà affichés intacts', async () => {
    // On repart d'une configuration saine avant de mesurer l'effet.
    await admin
      .post('/api/admin/pricing/apply', {
        cardFcfaPerUsd: '620',
        circuitLossPercent: '9',
        fxBufferPercent: '2',
        marginPercent: '10',
        provisional: true,
        note: 'Retour aux valeurs de référence',
        confirmBigChange: true,
        confirmBelowCost: true,
      })
      .expect(201);

    const { client, userId } = await verifiedClient(app);
    await addLot(app, userId, 5000);

    const first = (
      await client
        .post('/api/creations/quote', {
          resolution: '480p',
          durationSeconds: 5,
          format: '9:16',
        })
        .expect(201)
    ).body as CreationQuoteView;
    expect(first.credits).toBeGreaterThan(0);

    // Hausse franche de la marge : prise en compte immédiate, sans redéploiement.
    await admin
      .post('/api/admin/pricing/apply', {
        marginPercent: '100',
        note: 'Hausse de marge pour vérifier la prise d’effet immédiate',
        confirmBigChange: true,
      })
      .expect(201);

    const second = (
      await client
        .post('/api/creations/quote', {
          resolution: '480p',
          durationSeconds: 5,
          format: '9:16',
        })
        .expect(201)
    ).body as CreationQuoteView;
    expect(second.credits).toBeGreaterThan(first.credits);

    // Le PREMIER devis reste honoré : il couvre encore le coût, donc c'est son prix qui est débité.
    const res = await client.agent
      .post('/api/creations')
      .set('Origin', APP_ORIGIN)
      .set('X-Forwarded-For', client.ip)
      .field('prompt', 'Une vidéo de test')
      .field('format', '9:16')
      .field('resolution', '480p')
      .field('durationSeconds', '5')
      .field('consent', 'true')
      .field('quoteId', first.quoteId)
      .attach('photo', PNG, 'photo.png')
      .expect(201);
    expect(res.body.creation.credits).toBe(first.credits);

    // Et il ne sert qu'une fois.
    const quote = await prisma.creationQuote.findUniqueOrThrow({
      where: { id: first.quoteId },
    });
    expect(quote.usedAt).not.toBeNull();
  }, 60_000);

  it('revient à une version précédente en créant une nouvelle version, sans rien supprimer', async () => {
    const s = await sections();
    const target = s.history.find((h) => h.id !== s.current.id);
    expect(target).toBeDefined();
    const countBefore = await prisma.pricingConfig.count();

    const res = await admin
      .post('/api/admin/pricing/rollback', {
        versionId: target!.id,
        note: 'Retour à la version précédente',
      })
      .expect(201);
    expect(res.body.versionId).toBeTruthy();

    const after = await sections();
    expect(after.current.marginPercent).toBe(target!.marginPercent);
    expect(after.current.revertedFromId).toBe(target!.id);
    // Rien n'est supprimé : l'historique s'allonge.
    expect(await prisma.pricingConfig.count()).toBe(countBefore + 1);
  });

  describe('Catalogue : ajouter un modèle sans toucher au code ni au seed', () => {
    const SLUG = 'bytedance/seedance-2.5/text-to-video';

    /** Schéma d'un modèle texte → vidéo avec une option payante, tel que le formulaire l'envoie. */
    const schema = (over: Record<string, unknown> = {}) => ({
      slug: SLUG,
      name: 'Seedance 2.5 · texte → vidéo',
      description: 'Ajouté depuis l’administration.',
      mode: 'TEXT_TO_VIDEO',
      sortOrder: 5,
      params: [
        {
          key: 'prompt',
          label: 'Description',
          type: 'STRING',
          role: 'PROMPT',
          exposure: 'CLIENT',
          allowedValues: { maxLength: 600 },
          affectsPrice: false,
        },
        {
          key: 'duration',
          label: 'Durée',
          type: 'INTEGER',
          role: 'DURATION',
          exposure: 'CLIENT',
          allowedValues: { min: 4, max: 12 },
          defaultValue: 4,
          affectsPrice: true,
        },
        {
          key: 'resolution',
          label: 'Qualité',
          type: 'ENUM',
          role: 'RESOLUTION',
          exposure: 'CLIENT',
          allowedValues: ['720p', '1080p'],
          defaultValue: '720p',
          affectsPrice: true,
        },
        {
          key: 'draft',
          label: 'Aperçu rapide',
          type: 'BOOLEAN',
          role: 'OPTION',
          exposure: 'CLIENT',
          defaultValue: false,
          affectsPrice: true,
        },
        {
          key: 'output_format',
          label: 'Format de fichier',
          type: 'ENUM',
          role: 'OPTION',
          exposure: 'HIDDEN_DEFAULT',
          allowedValues: ['mp4'],
          defaultValue: 'mp4',
          affectsPrice: false,
        },
      ],
      ...over,
    });

    const price = (resolution: string, usdPerUnit: string) =>
      admin.post(`/api/admin/models/prices?slug=${encodeURIComponent(SLUG)}`, {
        resolution,
        usdPerUnit,
        billingUnit: 'SECOND',
        billableMultiplier: 1,
        minSeconds: 4,
        maxSeconds: 12,
      });

    it('crée le modèle, inactif, avec son schéma', async () => {
      const res = await admin.post('/api/admin/models', schema()).expect(201);
      expect(res.body).toEqual({ slug: SLUG, active: false });

      const detail = (
        await admin
          .get(`/api/admin/models/detail?slug=${encodeURIComponent(SLUG)}`)
          .expect(200)
      ).body;
      expect(detail.mode).toBe('TEXT_TO_VIDEO');
      expect(detail.params.map((p: { key: string }) => p.key)).toEqual([
        'prompt',
        'duration',
        'resolution',
        'draft',
        'output_format',
      ]);
      // 2 qualités × 2 valeurs de draft = 4 combinaisons payantes, aucune tarifée.
      expect(detail.prices).toEqual([]);
      expect(detail.missingPrices).toHaveLength(4);
    });

    it('refuse un paramètre imposé sans valeur par défaut', async () => {
      const bad = schema({
        params: [
          ...schema().params.slice(0, 4),
          {
            key: 'bitrate_mode',
            type: 'ENUM',
            role: 'OPTION',
            exposure: 'FIXED',
            allowedValues: ['standard', 'high'],
            affectsPrice: false,
          },
        ],
      });
      const res = await admin.post('/api/admin/models', bad).expect(400);
      expect(res.body.code).toBe('PARAM_DEFAULT_REQUIRED');
    });

    it('refuse l’activation tant qu’une combinaison autorisée n’a pas de tarif', async () => {
      const res = await admin
        .post(`/api/admin/models/active?slug=${encodeURIComponent(SLUG)}`, {
          active: true,
        })
        .expect(400);
      expect(res.body.code).toBe('MODEL_PRICE_INCOMPLETE');
    });

    it('accepte les tarifs et la règle d’option, puis l’activation', async () => {
      await price('720p', '0.08').expect(201);
      await price('1080p', '0.16').expect(201);
      // L'aperçu rapide coûte moitié prix : un multiplicateur, pas un supplément.
      await admin
        .post(
          `/api/admin/models/option-prices?slug=${encodeURIComponent(SLUG)}`,
          {
            paramKey: 'draft',
            triggerValue: true,
            kind: 'MULTIPLIER',
            multiplier: '0.5',
          },
        )
        .expect(201);

      const detail = (
        await admin
          .get(`/api/admin/models/detail?slug=${encodeURIComponent(SLUG)}`)
          .expect(200)
      ).body;
      expect(detail.prices).toHaveLength(2);
      expect(detail.optionPrices).toHaveLength(1);
      expect(detail.optionPrices[0].multiplier).toBe('0.5000');
      expect(detail.missingPrices).toEqual([]);

      const activated = await admin
        .post(`/api/admin/models/active?slug=${encodeURIComponent(SLUG)}`, {
          active: true,
        })
        .expect(200);
      expect(activated.body).toEqual({ slug: SLUG, active: true });
    });

    it('le nouveau modèle est tarifé comme les autres, sans une ligne de code', async () => {
      const s = await sections();
      const added = s.models.find((m) => m.slug === SLUG);
      expect(added).toBeDefined();
      expect(added!.active).toBe(true);
      expect(added!.missingPrices).toBe(0);

      // Il apparaît dans l'aperçu, avec ses propres qualités et son option à moitié prix.
      const p = await preview({ note: 'Vérification du nouveau modèle' });
      const rows = p.rows.filter((r) => r.modelSlug === SLUG);
      expect(rows.length).toBeGreaterThan(0);
      expect(new Set(rows.map((r) => r.resolution))).toEqual(
        new Set(['720p', '1080p']),
      );
      // Aucune ligne du nouveau modèle ne se vend sous son coût.
      expect(rows.filter((r) => r.afterWorstMarginFcfa < 0)).toEqual([]);
    });

    it('un refus de tarif négatif ne crée aucune version', async () => {
      const before = await prisma.modelPrice.count({
        where: { providerModel: SLUG },
      });
      await price('720p', '-1').expect(400);
      expect(
        await prisma.modelPrice.count({ where: { providerModel: SLUG } }),
      ).toBe(before);
    });

    it('modifier le schéma ne touche ni aux tarifs ni à l’activation', async () => {
      await admin
        .post('/api/admin/models', schema({ name: 'Seedance 2.5 (révisé)' }))
        .expect(201);
      const detail = (
        await admin
          .get(`/api/admin/models/detail?slug=${encodeURIComponent(SLUG)}`)
          .expect(200)
      ).body;
      expect(detail.name).toBe('Seedance 2.5 (révisé)');
      expect(detail.active).toBe(true);
      expect(detail.prices).toHaveLength(2);
      expect(detail.optionPrices).toHaveLength(1);
    });
  });

  it('écrit une trace d’audit à chaque application', async () => {
    const logs = await prisma.auditLog.findMany({
      where: { action: { in: ['pricing.apply', 'pricing.rollback'] } },
    });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l) => l.actorId !== null)).toBe(true);
    expect(logs.every((l) => (l.reason ?? '').length > 0)).toBe(true);
  });
});

/** Le plus petit PNG valide : la photo n'a aucune importance ici, seul le prix compte. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);
