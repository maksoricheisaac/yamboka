import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ceilDiv } from '../billing/decimal';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PricingService,
  type ModelPriceView,
} from '../pricing/pricing.service';
import { DEVIATION_ALERT_PERCENT } from './estimate-threshold';
import {
  buildModelInput,
  enumValues,
  pricedCombinations,
  type CatalogModel,
  type CatalogParam,
  type ServerValues,
} from './model-input';

type Db = PrismaService | Prisma.TransactionClient;

/** Multiplicateur en points de base : 10000 = ×1. */
const BP = 10_000n;

/**
 * Durée du cache du catalogue. Court volontairement : l'administration l'invalide explicitement à chaque
 * application, le délai n'est qu'un filet si une écriture passe par un autre chemin.
 */
const CACHE_MS = 30_000;

export interface ModelCostInput {
  /** Valeurs des paramètres qui changent le prix, telles qu'elles seront RÉELLEMENT envoyées. */
  priced: Record<string, unknown>;
  resolution: string | null;
  durationSeconds: number | null;
  at?: Date;
}

export interface ModelCost {
  microUsd: bigint;
  /** Unités facturées (secondes arrondies au-dessus, ou 1). */
  units: number;
  /** Prix unitaire après application des options, en micro-dollars. */
  microUsdPerUnit: bigint;
  modelPriceId: string;
  /** Règles d'option appliquées, pour expliquer le prix. */
  optionPriceIds: string[];
  source: 'MANUAL' | 'ESTIMATE';
}

interface OptionRule {
  id: string;
  paramKey: string;
  triggerValue: unknown;
  kind: 'SURCHARGE' | 'MULTIPLIER';
  microUsdPerUnit: bigint | null;
  multiplierBp: number | null;
}

/**
 * Catalogue de modèles : la seule source de vérité sur ce qu'on appelle chez le fournisseur et sur ce que
 * ça coûte. Aucun slug, aucun paramètre et aucun tarif n'est écrit dans le code.
 *
 * Trois responsabilités, et rien d'autre :
 *   — lire le catalogue (modèles actifs, schéma de chaque modèle) ;
 *   — reconstruire et valider l'`input` d'un appel (model-input.ts) ;
 *   — calculer le coût fournisseur d'un appel à partir des options RÉELLEMENT envoyées.
 *
 * Les identifiants d'API ne passent jamais par ici : ils viennent de l'environnement, dans le fournisseur.
 */
@Injectable()
export class ModelCatalogService {
  private readonly logger = new Logger(ModelCatalogService.name);
  private cache: { at: number; models: CatalogModel[] } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  /** À appeler dès qu'une version de configuration ou de catalogue est appliquée : prise d'effet immédiate. */
  invalidate(): void {
    this.cache = null;
  }

  // ───────────── Lecture ─────────────

  /** Tous les modèles du catalogue, actifs ou non, avec leurs paramètres. */
  async all(db: Db = this.prisma): Promise<CatalogModel[]> {
    if (
      db === this.prisma &&
      this.cache &&
      Date.now() - this.cache.at < CACHE_MS
    ) {
      return this.cache.models;
    }
    const rows = await db.generationModel.findMany({
      include: { params: { orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const models = rows.map(toCatalogModel);
    if (db === this.prisma) this.cache = { at: Date.now(), models };
    return models;
  }

  async active(db: Db = this.prisma): Promise<CatalogModel[]> {
    return (await this.all(db)).filter((m) => m.active);
  }

  /** Modèle par slug. Lève si absent ; `requireActive` lève aussi s'il est désactivé (refus immédiat). */
  async bySlug(
    slug: string,
    opts: { requireActive?: boolean } = {},
  ): Promise<CatalogModel> {
    const model = (await this.all()).find((m) => m.slug === slug);
    if (!model) {
      throw new NotFoundException({
        code: 'MODEL_UNKNOWN',
        message: 'Ce modèle de création n’existe pas.',
      });
    }
    if (opts.requireActive !== false && !model.active) {
      throw new BadRequestException({
        code: 'MODEL_UNAVAILABLE',
        message: 'Ce modèle de création n’est pas disponible pour le moment.',
      });
    }
    return model;
  }

  /**
   * Modèle retenu quand le client n'en choisit pas : celui marqué par défaut, sinon le premier actif.
   * Lève si le catalogue n'a aucun modèle actif (la création est alors refusée avant tout débit).
   */
  async defaultModel(): Promise<CatalogModel> {
    const active = await this.active();
    const chosen = active.find((m) => m.isDefault) ?? active[0];
    if (!chosen) {
      throw new NotFoundException({
        code: 'NO_ACTIVE_MODEL',
        message: 'Aucun modèle de création n’est actif.',
      });
    }
    return chosen;
  }

  /** Modèle demandé s'il est fourni, sinon le modèle par défaut. Un modèle désactivé est refusé ici. */
  async resolve(slug?: string | null): Promise<CatalogModel> {
    return slug ? this.bySlug(slug) : this.defaultModel();
  }

  // ───────────── Construction de l'appel ─────────────

  /** Reconstruit l'`input` du modèle et valide tout ce que le client a envoyé. */
  build(
    model: CatalogModel,
    clientValues: Record<string, unknown> = {},
    server: ServerValues = {},
  ) {
    return buildModelInput(model, clientValues, server);
  }

  // ───────────── Coût ─────────────

  /** Règles d'option en vigueur à `at` pour un modèle : la plus récente par (paramKey, valeur). */
  private async optionRules(slug: string, at: Date): Promise<OptionRule[]> {
    const rows = await this.prisma.modelOptionPrice.findMany({
      where: { providerModel: slug, effectiveFrom: { lte: at } },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
    const seen = new Set<string>();
    const kept: OptionRule[] = [];
    for (const r of rows) {
      const key = `${r.paramKey}=${JSON.stringify(r.triggerValue)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push({
        id: r.id,
        paramKey: r.paramKey,
        triggerValue: r.triggerValue,
        kind: r.kind,
        microUsdPerUnit: r.microUsdPerUnit,
        multiplierBp: r.multiplierBp,
      });
    }
    return kept;
  }

  /**
   * Coût fournisseur d'un appel, en micro-dollars : tarif de base de la résolution, puis suppléments puis
   * multiplicateurs des options RÉELLEMENT envoyées, le tout multiplié par les unités facturées.
   *
   * Tous les arrondis sont AU-DESSUS : on ne sous-estime jamais ce qu'on va payer.
   */
  async cost(model: CatalogModel, p: ModelCostInput): Promise<ModelCost> {
    const at = p.at ?? new Date();
    const unit = await this.costPerUnit(model, {
      priced: p.priced,
      resolution: p.resolution,
      at,
    });
    const units = unitsOf(unit.price, p.durationSeconds);
    return {
      microUsd:
        unit.microUsdPerUnit *
        BigInt(units) *
        BigInt(unit.price.billableMultiplier),
      units,
      microUsdPerUnit: unit.microUsdPerUnit,
      modelPriceId: unit.price.id,
      optionPriceIds: unit.optionPriceIds,
      source: unit.price.source,
    };
  }

  /**
   * Prix d'UNE unité facturée (une seconde de vidéo), options comprises, sans contrôle de durée. C'est la
   * brique du tarif affiché : les crédits par seconde en découlent, et la durée les multiplie.
   */
  async costPerUnit(
    model: CatalogModel,
    p: {
      priced: Record<string, unknown>;
      resolution: string | null;
      at?: Date;
    },
  ): Promise<{
    microUsdPerUnit: bigint;
    price: ModelPriceView;
    optionPriceIds: string[];
  }> {
    const at = p.at ?? new Date();
    const price = await this.pricing.modelPrice({
      providerModel: model.slug,
      resolution: p.resolution,
      at,
    });
    const rules = await this.optionRules(model.slug, at);

    let perUnit = price.microUsdPerUnit;
    const applied: string[] = [];
    // Les suppléments s'ajoutent d'abord, les multiplicateurs s'appliquent ensuite : l'ordre inverse
    // sous-facturerait une option à supplément combinée à un multiplicateur inférieur à 1.
    for (const rule of rules) {
      if (rule.kind !== 'SURCHARGE' || !matches(p.priced, rule)) continue;
      perUnit += rule.microUsdPerUnit ?? 0n;
      applied.push(rule.id);
    }
    for (const rule of rules) {
      if (rule.kind !== 'MULTIPLIER' || !matches(p.priced, rule)) continue;
      perUnit = ceilDiv(perUnit * BigInt(rule.multiplierBp ?? 10_000), BP);
      applied.push(rule.id);
    }
    // Contrôle /estimate : si le fournisseur s'est révélé plus cher que la configuration de plus de 5 %,
    // les NOUVEAUX devis retiennent le plus élevé des deux. On ne vend pas au tarif d'hier quand on sait
    // déjà qu'il est faux ; la correction du tarif lui-même reste une décision d'administrateur.
    const observed = await this.observedOverride(
      model.slug,
      p.resolution,
      p.priced,
      at,
    );
    if (observed !== null) {
      const perUnitFromObserved = ceilDiv(
        observed,
        BigInt(price.billableMultiplier),
      );
      if (perUnitFromObserved > perUnit) perUnit = perUnitFromObserved;
    }
    return { microUsdPerUnit: perUnit, price, optionPriceIds: applied };
  }

  /**
   * Dernier prix OBSERVÉ par /estimate pour cette combinaison, s'il dépasse le tarif configuré de plus de
   * DEVIATION_ALERT_PERCENT. null sinon (y compris quand le fournisseur est moins cher : on ne baisse
   * jamais un prix sur une seule observation).
   */
  private async observedOverride(
    slug: string,
    resolution: string | null,
    priced: Record<string, unknown>,
    at: Date,
  ): Promise<bigint | null> {
    const row = await this.prisma.modelEstimateCheck.findFirst({
      where: { providerModel: slug, resolution, checkedAt: { lte: at } },
      orderBy: { checkedAt: 'desc' },
    });
    if (!row) return null;
    if (row.deviationPercent <= DEVIATION_ALERT_PERCENT) return null;
    if (row.observedMicroUsdPerUnit <= row.configuredMicroUsdPerUnit) {
      return null;
    }
    // L'observation ne vaut que pour les options exactement identiques.
    const observedOptions = row.options as Record<string, unknown>;
    for (const [key, value] of Object.entries(observedOptions)) {
      if (JSON.stringify(priced[key]) !== JSON.stringify(value)) return null;
    }
    return row.observedMicroUsdPerUnit;
  }

  /**
   * Valeurs par défaut des paramètres qui changent le prix, éventuellement remplacées. Sert à tarifer une
   * combinaison sans construire un appel complet (grille affichée, simulateur, calibrage).
   */
  defaultPriced(
    model: CatalogModel,
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const priced: Record<string, unknown> = {};
    for (const param of model.params) {
      if (!param.affectsPrice) continue;
      priced[param.key] = param.defaultValue;
    }
    return { ...priced, ...overrides };
  }

  /** Clé exacte du paramètre portant un rôle donné, ou null si le modèle n'en déclare pas. */
  keyOfRole(model: CatalogModel, role: CatalogParam['role']): string | null {
    return model.params.find((p) => p.role === role)?.key ?? null;
  }

  // ───────────── Complétude du tarif ─────────────

  /**
   * Un modèle ne s'active que si son tarif couvre TOUTES les combinaisons autorisées : sans cela, une
   * combinaison sans prix se vendrait à l'aveugle. Renvoie la liste des combinaisons sans tarif.
   */
  async missingPrices(
    model: CatalogModel,
    at: Date = new Date(),
  ): Promise<Record<string, unknown>[]> {
    const missing: Record<string, unknown>[] = [];
    const resolutionKey = this.keyOfRole(model, 'RESOLUTION');
    const rules = await this.optionRules(model.slug, at);
    // Les paramètres payants autres que la résolution : la résolution est tarifée par ModelPrice, les
    // autres par une règle d'option. Une valeur payante sans règle serait facturée comme la valeur par
    // défaut, c'est-à-dire offerte : c'est exactement ce qu'il faut refuser avant d'activer un modèle.
    const optionParams = model.params.filter(
      (x) => x.affectsPrice && x.key !== resolutionKey && x.type !== 'INTEGER',
    );
    for (const combo of pricedCombinations(model)) {
      const resolution = resolutionKey
        ? ((combo[resolutionKey] as string | undefined) ?? null)
        : null;
      let ok = true;
      try {
        await this.pricing.modelPrice({
          providerModel: model.slug,
          resolution,
          at,
        });
      } catch {
        ok = false;
      }
      for (const param of optionParams) {
        const value = combo[param.key];
        // La valeur par défaut est celle du tarif de base : elle n'a pas besoin de règle.
        if (JSON.stringify(value) === JSON.stringify(param.defaultValue)) {
          continue;
        }
        if (!rules.some((r) => matches(combo, r) && r.paramKey === param.key)) {
          ok = false;
        }
      }
      if (!ok) missing.push(combo);
    }
    return missing;
  }

  /** Active ou désactive un modèle. L'activation est refusée si un tarif manque. */
  async setActive(
    slug: string,
    active: boolean,
    adminId: string,
  ): Promise<CatalogModel> {
    const model = await this.bySlug(slug, { requireActive: false });
    if (active) {
      const missing = await this.missingPrices(model);
      if (missing.length > 0) {
        throw new BadRequestException({
          code: 'MODEL_PRICE_INCOMPLETE',
          message: `Tarif incomplet : ${missing.length} combinaison(s) sans prix. Lancez le calibrage avant d’activer ce modèle.`,
        });
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.generationModel.update({
        where: { id: model.id },
        data: { active },
      });
      await tx.auditLog.create({
        data: {
          actorId: adminId,
          action: active ? 'catalog.model.activate' : 'catalog.model.disable',
          entityType: 'GenerationModel',
          entityId: model.id,
          after: { slug: model.slug, active },
        },
      });
    });
    this.invalidate();
    this.logger.log(
      `Modèle ${model.slug} ${active ? 'activé' : 'désactivé'} par ${adminId}.`,
    );
    return this.bySlug(slug, { requireActive: false });
  }

  /**
   * Crée ou remplace un modèle et ses paramètres. Un modèle EXISTANT garde son activation : changer son
   * schéma ne l'allume ni ne l'éteint. Les paramètres sont remplacés en bloc (c'est un schéma, pas un
   * historique), tandis que les TARIFS restent en ajout seul dans leurs propres tables.
   */
  async upsert(
    input: {
      slug: string;
      name: string;
      description?: string;
      mode: 'TEXT_TO_VIDEO' | 'IMAGE_TO_VIDEO';
      sortOrder: number;
      isDefault?: boolean;
      params: {
        key: string;
        label?: string;
        type: CatalogParam['type'];
        role: CatalogParam['role'];
        exposure: CatalogParam['exposure'];
        allowedValues?: unknown;
        defaultValue?: unknown;
        affectsPrice: boolean;
      }[];
    },
    adminId: string,
  ): Promise<CatalogModel> {
    // Un paramètre imposé ou caché doit porter une valeur : sinon l'appel partirait incomplet.
    for (const param of input.params) {
      if (
        param.exposure !== 'CLIENT' &&
        param.role !== 'IMAGE_URL' &&
        (param.defaultValue === undefined || param.defaultValue === null)
      ) {
        throw new BadRequestException({
          code: 'PARAM_DEFAULT_REQUIRED',
          message: `« ${param.label ?? param.key} » est imposé par la configuration : il lui faut une valeur.`,
        });
      }
    }
    const keys = input.params.map((p) => p.key);
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException({
        code: 'PARAM_DUPLICATE',
        message: 'Deux paramètres portent la même clé.',
      });
    }

    const existing = await this.prisma.generationModel.findUnique({
      where: { slug: input.slug },
    });
    await this.prisma.$transaction(async (tx) => {
      // Un seul modèle par défaut à la fois (un index unique partiel le garantit aussi en base).
      if (input.isDefault) {
        await tx.generationModel.updateMany({
          where: { isDefault: true, slug: { not: input.slug } },
          data: { isDefault: false },
        });
      }
      const data = {
        name: input.name,
        description: input.description ?? null,
        mode: input.mode,
        sortOrder: input.sortOrder,
        isDefault: input.isDefault ?? existing?.isDefault ?? false,
      };
      const model = existing
        ? await tx.generationModel.update({
            where: { id: existing.id },
            data,
          })
        : await tx.generationModel.create({
            data: { ...data, slug: input.slug, active: false },
          });
      await tx.modelParam.deleteMany({ where: { modelId: model.id } });
      await tx.modelParam.createMany({
        data: input.params.map((p, i) => ({
          modelId: model.id,
          key: p.key,
          label: p.label ?? null,
          type: p.type,
          role: p.role,
          exposure: p.exposure,
          allowedValues: (p.allowedValues ?? null) as Prisma.InputJsonValue,
          defaultValue: (p.defaultValue ?? null) as Prisma.InputJsonValue,
          affectsPrice: p.affectsPrice,
          sortOrder: i,
        })),
      });
      await tx.auditLog.create({
        data: {
          actorId: adminId,
          action: existing ? 'catalog.model.update' : 'catalog.model.create',
          entityType: 'GenerationModel',
          entityId: model.id,
          after: {
            slug: input.slug,
            mode: input.mode,
            params: keys,
          },
        },
      });
    });
    this.invalidate();
    return this.bySlug(input.slug, { requireActive: false });
  }

  /** Toutes les résolutions proposées par un modèle, dans l'ordre du catalogue. */
  resolutionsOf(model: CatalogModel): string[] {
    const param = model.params.find((p) => p.role === 'RESOLUTION');
    return param ? enumValues(param.allowedValues) : [];
  }
}

/** Unités facturées d'un appel, avec les bornes de durée du tarif. */
function unitsOf(
  price: ModelPriceView,
  durationSeconds: number | null,
): number {
  if (price.billingUnit !== 'SECOND') return 1;
  if (durationSeconds === null || !Number.isFinite(durationSeconds)) {
    throw new BadRequestException({
      code: 'DURATION_REQUIRED',
      message: 'La durée de la vidéo est requise.',
    });
  }
  const units = Math.ceil(durationSeconds);
  if (price.minSeconds !== null && units < price.minSeconds) {
    throw new BadRequestException({
      code: 'DURATION_TOO_SHORT',
      message: `La vidéo doit durer au moins ${price.minSeconds} secondes.`,
    });
  }
  if (price.maxSeconds !== null && units > price.maxSeconds) {
    throw new BadRequestException({
      code: 'DURATION_TOO_LONG',
      message: `La vidéo ne doit pas dépasser ${price.maxSeconds} secondes.`,
    });
  }
  return units;
}

/** Une règle s'applique si la valeur envoyée pour son paramètre est exactement celle qui la déclenche. */
function matches(
  priced: Record<string, unknown>,
  rule: { paramKey: string; triggerValue: unknown },
): boolean {
  if (!(rule.paramKey in priced)) return false;
  return (
    JSON.stringify(priced[rule.paramKey]) === JSON.stringify(rule.triggerValue)
  );
}

function toCatalogModel(row: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  mode: 'TEXT_TO_VIDEO' | 'IMAGE_TO_VIDEO';
  active: boolean;
  isDefault: boolean;
  sortOrder: number;
  params: {
    key: string;
    label: string | null;
    type: CatalogParam['type'];
    role: CatalogParam['role'];
    exposure: CatalogParam['exposure'];
    allowedValues: unknown;
    defaultValue: unknown;
    affectsPrice: boolean;
    sortOrder: number;
  }[];
}): CatalogModel {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    mode: row.mode,
    active: row.active,
    isDefault: row.isDefault,
    sortOrder: row.sortOrder,
    params: row.params.map((p) => ({
      key: p.key,
      label: p.label,
      type: p.type,
      role: p.role,
      exposure: p.exposure,
      allowedValues: p.allowedValues ?? null,
      defaultValue: p.defaultValue ?? null,
      affectsPrice: p.affectsPrice,
      sortOrder: p.sortOrder,
    })),
  };
}
