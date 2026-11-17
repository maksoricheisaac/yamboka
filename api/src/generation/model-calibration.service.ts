import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ceilDiv } from '../billing/decimal';
import { formatMicroUsd } from '../billing/usd';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { parseEstimateUsd } from './estimate';
import { DEVIATION_ALERT_PERCENT } from './estimate-threshold';
import { GenerationProvider } from './generation-provider';
import { ModelCatalogService } from './model-catalog.service';
import { pricedCombinations, type CatalogModel } from './model-input';

export { DEVIATION_ALERT_PERCENT } from './estimate-threshold';

/** Durées utilisées pour le calibrage : la plus courte autorisée, l'usuelle, la plus longue. */
const CALIBRATION_DURATIONS = [2, 5, 10];

export interface GridRow {
  resolution: string | null;
  /** Options exactes de la combinaison (celles qui changent le prix). */
  options: Record<string, unknown>;
  durationSeconds: number;
  /** Tarif configuré par unité facturée, en micro-dollars (0 si aucun tarif n'est enregistré). */
  configuredMicroUsdPerUnit: bigint;
  /** Tarif observé par unité facturée, ou null si /estimate n'est pas lisible. */
  observedMicroUsdPerUnit: bigint | null;
  deviationPercent: number | null;
  /** Message d'erreur quand l'estimation a échoué pour cette combinaison. */
  error: string | null;
}

/**
 * Calibrage des tarifs d'un modèle par le point d'estimation du fournisseur, et contrôle périodique de la
 * configuration.
 *
 * `/estimate` est GRATUIT et n'est JAMAIS sur le chemin du client : il sert ici, à la demande d'un
 * administrateur ou par une tâche périodique. Rien ne s'applique automatiquement — l'assistant PROPOSE un
 * tableau de prix, l'administrateur l'applique après l'aperçu.
 */
@Injectable()
export class ModelCalibrationService {
  private readonly logger = new Logger(ModelCalibrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: GenerationProvider,
    private readonly catalog: ModelCatalogService,
    private readonly pricing: PricingService,
  ) {}

  /** Vrai si le fournisseur sait estimer (le simulé ne sait pas : rien à comparer). */
  get available(): boolean {
    return typeof this.provider.estimate === 'function';
  }

  private assertAvailable(): void {
    if (!this.available) {
      throw new ServiceUnavailableException({
        code: 'ESTIMATE_UNAVAILABLE',
        message:
          'Le fournisseur en service ne sait pas estimer un prix (fournisseur simulé) : rien à calibrer.',
      });
    }
  }

  /**
   * Essai d'un modèle, SANS générer : construit un `input` d'exemple depuis le catalogue (ce qui vérifie
   * déjà le schéma), puis demande le prix au fournisseur. Gratuit.
   */
  async testModel(slug: string): Promise<{
    slug: string;
    input: Record<string, unknown>;
    schemaOk: true;
    estimateAvailable: boolean;
    observedUsd: string | null;
    configuredUsd: string | null;
    deviationPercent: number | null;
    providerStatus: number | null;
    error: string | null;
  }> {
    const model = await this.catalog.bySlug(slug, { requireActive: false });
    // Un input d'exemple : valeurs par défaut du catalogue, plus un texte et une image factices là où le
    // modèle en attend. Si la construction échoue, c'est le schéma du catalogue qui est faux.
    const built = this.catalog.build(
      model,
      {},
      {
        prompt: 'Essai de configuration, aucune vidéo ne sera produite.',
        imageUrl: 'https://example.invalid/essai.jpg',
      },
    );
    if (!this.available) {
      return {
        slug,
        input: built.input,
        schemaOk: true,
        estimateAvailable: false,
        observedUsd: null,
        configuredUsd: null,
        deviationPercent: null,
        providerStatus: null,
        error: null,
      };
    }
    const unit = await this.catalog
      .costPerUnit(model, {
        priced: built.priced,
        resolution: built.resolution,
      })
      .catch(() => null);
    const units = Math.max(1, Math.ceil(built.durationSeconds ?? 1));
    const configured = unit
      ? unit.microUsdPerUnit * BigInt(unit.price.billableMultiplier)
      : null;

    let observed: bigint | null = null;
    let status: number | null = null;
    let error: string | null = null;
    try {
      const res = await this.provider.estimate!(model.slug, built.input);
      status = res.status;
      if (res.status >= 400) {
        error = `Le fournisseur a refusé la demande (HTTP ${res.status}) : ${JSON.stringify(res.body).slice(0, 300)}`;
      } else {
        const parsed = parseEstimateUsd(res.body);
        if (!parsed) {
          error = 'Réponse du fournisseur non lisible : aucun prix identifié.';
        } else {
          observed = ceilDiv(parsed.microUsd, BigInt(units));
        }
      }
    } catch (e) {
      error = (e as Error).message;
    }

    return {
      slug,
      input: built.input,
      schemaOk: true,
      estimateAvailable: true,
      observedUsd: observed === null ? null : formatMicroUsd(observed, 6),
      configuredUsd:
        configured === null
          ? null
          : formatMicroUsd(ceilDiv(configured, BigInt(units)), 6),
      deviationPercent:
        observed !== null && configured !== null
          ? this.signedDeviation(ceilDiv(configured, BigInt(units)), observed)
          : null,
      providerStatus: status,
      error,
    };
  }

  /**
   * Lance `/estimate` sur la grille complète (résolutions × durées × options payantes) et renvoie le
   * tableau de prix proposé. Chaque relevé est enregistré (en ajout seul), ce qui sert aussi d'historique
   * pour le contrôle périodique. Rien n'est appliqué.
   */
  async estimateGrid(
    slug: string,
    opts: { durations?: number[]; adminId?: string } = {},
  ): Promise<{ slug: string; rows: GridRow[]; maxDeviationPercent: number }> {
    this.assertAvailable();
    const model = await this.catalog.bySlug(slug, { requireActive: false });
    const durations = opts.durations?.length
      ? opts.durations
      : this.defaultDurations(model);
    const rows: GridRow[] = [];
    let maxDeviation = 0;

    for (const combo of pricedCombinations(model)) {
      const resolutionKey = this.catalog.keyOfRole(model, 'RESOLUTION');
      const resolution = resolutionKey
        ? ((combo[resolutionKey] as string | undefined) ?? null)
        : null;
      const durationKey = this.catalog.keyOfRole(model, 'DURATION');
      for (const seconds of durations) {
        const clientValues: Record<string, unknown> = { ...combo };
        if (durationKey) clientValues[durationKey] = seconds;
        // Les valeurs imposées ne passent pas par le client : on ne garde que celles qu'il peut choisir.
        for (const key of Object.keys(clientValues)) {
          const param = model.params.find((x) => x.key === key);
          if (!param || param.exposure !== 'CLIENT') delete clientValues[key];
        }
        let row: GridRow;
        try {
          const built = this.catalog.build(model, clientValues, {
            prompt: 'Calibrage des tarifs, aucune vidéo ne sera produite.',
            imageUrl: 'https://example.invalid/essai.jpg',
          });
          const unit = await this.catalog
            .costPerUnit(model, {
              priced: built.priced,
              resolution: built.resolution,
            })
            .catch(() => null);
          const configuredPerUnit = unit
            ? unit.microUsdPerUnit * BigInt(unit.price.billableMultiplier)
            : 0n;
          const units = Math.max(1, Math.ceil(built.durationSeconds ?? 1));
          const res = await this.provider.estimate!(model.slug, built.input);
          if (res.status >= 400) {
            row = {
              resolution,
              options: combo,
              durationSeconds: seconds,
              configuredMicroUsdPerUnit: configuredPerUnit,
              observedMicroUsdPerUnit: null,
              deviationPercent: null,
              error: `HTTP ${res.status} : ${JSON.stringify(res.body).slice(0, 200)}`,
            };
          } else {
            const parsed = parseEstimateUsd(res.body);
            if (!parsed) {
              row = {
                resolution,
                options: combo,
                durationSeconds: seconds,
                configuredMicroUsdPerUnit: configuredPerUnit,
                observedMicroUsdPerUnit: null,
                deviationPercent: null,
                error: 'Réponse non lisible : aucun prix identifié.',
              };
            } else {
              const observedPerUnit = ceilDiv(parsed.microUsd, BigInt(units));
              const deviation = this.signedDeviation(
                configuredPerUnit,
                observedPerUnit,
              );
              if (deviation > maxDeviation) maxDeviation = deviation;
              await this.record({
                slug: model.slug,
                resolution,
                options: combo,
                configuredPerUnit,
                observedPerUnit,
                deviation,
                units,
                raw: res.body,
                adminId: opts.adminId,
              });
              row = {
                resolution,
                options: combo,
                durationSeconds: seconds,
                configuredMicroUsdPerUnit: configuredPerUnit,
                observedMicroUsdPerUnit: observedPerUnit,
                deviationPercent: deviation,
                error: null,
              };
            }
          }
        } catch (e) {
          row = {
            resolution,
            options: combo,
            durationSeconds: seconds,
            configuredMicroUsdPerUnit: 0n,
            observedMicroUsdPerUnit: null,
            deviationPercent: null,
            error: (e as Error).message,
          };
        }
        rows.push(row);
      }
    }
    if (maxDeviation > DEVIATION_ALERT_PERCENT) {
      this.logger.error(
        `Tarif ${model.slug} en retard sur le fournisseur : écart maximal ${maxDeviation} % (seuil ${DEVIATION_ALERT_PERCENT} %). Les nouveaux devis utilisent le plus élevé des deux.`,
      );
    }
    return { slug: model.slug, rows, maxDeviationPercent: maxDeviation };
  }

  /**
   * Applique le tableau proposé : une nouvelle version de tarif par résolution, source ESTIMATE. Rien
   * n'écrase l'ancien tarif (ajout seul), donc les générations passées gardent le leur.
   */
  async applyGrid(
    slug: string,
    rows: { resolution: string | null; usdPerUnit: string }[],
    p: { adminId: string; note?: string },
  ): Promise<{ applied: number }> {
    const model = await this.catalog.bySlug(slug, { requireActive: false });
    if (rows.length === 0) {
      throw new BadRequestException({
        code: 'EMPTY_GRID',
        message: 'Aucun tarif à appliquer.',
      });
    }
    let applied = 0;
    for (const row of rows) {
      await this.pricing.addModelPrice({
        providerModel: model.slug,
        resolution: row.resolution,
        usdPerUnit: row.usdPerUnit,
        source: 'ESTIMATE',
        note: p.note ?? `Calibrage par estimation du fournisseur (${slug}).`,
        adminId: p.adminId,
      });
      applied += 1;
    }
    this.catalog.invalidate();
    return { applied };
  }

  /**
   * Dernier relevé par (modèle, résolution, options) dont l'écart dépasse le seuil VERS LE HAUT : c'est ce
   * que la tarification doit retenir à la place du tarif configuré, et ce que l'administration doit montrer.
   */
  async pendingAlerts(): Promise<
    {
      providerModel: string;
      resolution: string | null;
      options: Record<string, unknown>;
      configuredUsd: string;
      observedUsd: string;
      deviationPercent: number;
      checkedAt: string;
    }[]
  > {
    const rows = await this.prisma.modelEstimateCheck.findMany({
      orderBy: { checkedAt: 'desc' },
      take: 200,
    });
    const seen = new Set<string>();
    const out: {
      providerModel: string;
      resolution: string | null;
      options: Record<string, unknown>;
      configuredUsd: string;
      observedUsd: string;
      deviationPercent: number;
      checkedAt: string;
    }[] = [];
    for (const r of rows) {
      const key = `${r.providerModel}|${r.resolution ?? ''}|${JSON.stringify(r.options)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (r.deviationPercent <= DEVIATION_ALERT_PERCENT) continue;
      if (r.observedMicroUsdPerUnit <= r.configuredMicroUsdPerUnit) continue;
      out.push({
        providerModel: r.providerModel,
        resolution: r.resolution,
        options: r.options as Record<string, unknown>,
        configuredUsd: formatMicroUsd(r.configuredMicroUsdPerUnit, 6),
        observedUsd: formatMicroUsd(r.observedMicroUsdPerUnit, 6),
        deviationPercent: r.deviationPercent,
        checkedAt: r.checkedAt.toISOString(),
      });
    }
    return out;
  }

  /** Durées de calibrage, bornées par ce que le modèle autorise. */
  private defaultDurations(model: CatalogModel): number[] {
    const param = model.params.find((p) => p.role === 'DURATION');
    const bounds =
      param && param.allowedValues && typeof param.allowedValues === 'object'
        ? (param.allowedValues as { min?: number; max?: number })
        : {};
    const min = bounds.min ?? 1;
    const max = bounds.max ?? 30;
    const wanted = [...CALIBRATION_DURATIONS, max];
    return [...new Set(wanted.map((d) => Math.min(max, Math.max(min, d))))];
  }

  /** Écart relatif signé en % (positif = le fournisseur est plus cher que la configuration). */
  private signedDeviation(configured: bigint, observed: bigint): number {
    if (configured <= 0n) return observed > 0n ? 100 : 0;
    const diff = observed - configured;
    const abs = diff < 0n ? -diff : diff;
    const pct = Number(ceilDiv(abs * 100n, configured));
    return diff < 0n ? -pct : pct;
  }

  private async record(p: {
    slug: string;
    resolution: string | null;
    options: Record<string, unknown>;
    configuredPerUnit: bigint;
    observedPerUnit: bigint;
    deviation: number;
    units: number;
    raw: unknown;
    adminId?: string;
  }): Promise<void> {
    await this.prisma.modelEstimateCheck.create({
      data: {
        providerModel: p.slug,
        resolution: p.resolution,
        options: p.options as Prisma.InputJsonValue,
        configuredMicroUsdPerUnit: p.configuredPerUnit,
        observedMicroUsdPerUnit: p.observedPerUnit,
        deviationPercent: p.deviation,
        units: p.units,
        raw: (p.raw ?? null) as Prisma.InputJsonValue,
        createdById: p.adminId,
      },
    });
  }
}
