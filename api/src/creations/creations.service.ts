import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  CreateCreationInput,
  CreationConfig,
  CreationModelSchema,
  CreationQuoteInput,
  CreationQuoteView,
  CreationFormat,
  CreationOptions,
  CreationPage,
  CreationStatus,
  CreationView,
  ReportCreationInput,
  StyleView,
  SuggestionAudience,
  VideoResolution,
} from '@yamboka/shared';
import {
  buildPage,
  clampPage,
  CREATION_FORMATS,
  DEFAULT_FORMAT,
  DEFAULT_RESOLUTION,
  VIDEO_DURATION,
  VIDEO_RESOLUTIONS,
  MAX_UPLOAD_BYTES,
  videoCostCredits,
} from '@yamboka/shared';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { netNeededFcfa, formatMicroUsd, formatRate } from '../billing/usd';
import { startOfToday } from '../common/period';
import { CreditsService } from '../credits/credits.service';
import {
  GenerationAuthError,
  GenerationProvider,
  GenerationProviderOutOfCreditsError,
  GenerationRejectedError,
  GenerationUnavailableError,
} from '../generation/generation-provider';
import { ModelCatalogService } from '../generation/model-catalog.service';
import {
  enumValues,
  integerBounds,
  type CatalogModel,
} from '../generation/model-input';
import type { MediaFile, Prisma } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreditPricingService,
  type PricingContext,
} from '../pricing/credit-pricing.service';
import { PricingService } from '../pricing/pricing.service';
import { VideoRatesService } from '../pricing/video-rates.service';
import { ProviderLedgerService } from '../provider-balance/provider-ledger.service';
import { SettingsService } from '../settings/settings.service';
import { StorageDriver } from '../storage/storage-driver';
import { sniffImage } from './image-sniff';
import {
  checkOutput,
  OutputRejectedError,
  type FailureCode,
} from './output-check';

export interface UploadedImage {
  buffer: Buffer;
  size: number;
  originalname: string;
}

/**
 * Gabarit serveur (pas de LLM) : le texte du client est gardé tel quel, complété par une consigne de fidélité à la
 * photo. Sans texte (jamais en pratique : il est obligatoire), l'idée choisie fournit le sien.
 */
const PROMPT_TEMPLATE =
  '{texte}. Mouvement naturel et fluide, rendu réaliste. Le produit et les personnes de la photo restent identiques, sans déformation.';
/**
 * Réglage posé automatiquement quand le fournisseur annonce son solde prépayé épuisé (403 « not_enough_credits ») :
 * tant qu'il porte une date, aucune nouvelle création n'est acceptée. Il se lève seul dès qu'une soumission
 * repasse, et l'administration le signale comme alerte critique.
 */
const PROVIDER_OUT_OF_CREDITS_KEY = 'providerOutOfCreditsAt';
/** Dernier refus de paramètres par le fournisseur (slug, message, date) : alerte de l'administration. */
const MODEL_REJECTION_KEY = 'lastModelRejection';

/** Au-delà, une création sans réponse du fournisseur est annulée et remboursée. */
const GENERATION_TIMEOUT_MS = 60 * 60_000;
/** Un résultat distant plus gros que cela est refusé. */
const MAX_OUTPUT_BYTES = 200 * 1024 * 1024;
const FAILURE_MESSAGE =
  'La création n’a pas abouti. Vos crédits ont été restitués.';

/** Message montré à l'utilisateur selon la raison de l'échec : jamais le texte brut du fournisseur. */
const FAILURE_MESSAGES: Record<FailureCode, string> = {
  MODERATION:
    'Votre photo ou votre description a été refusée par le contrôle de contenu. Vos crédits ont été restitués.',
  TIMEOUT:
    'La création a pris trop de temps. Vos crédits ont été restitués : vous pouvez réessayer.',
  NO_RESULT:
    'Le service n’a pas fourni de résultat. Vos crédits ont été restitués : vous pouvez réessayer.',
  BAD_RESULT:
    'Le résultat reçu n’était pas exploitable. Vos crédits ont été restitués : vous pouvez réessayer.',
  FORMAT:
    'Le résultat ne respectait pas le format demandé. Vos crédits ont été restitués : vous pouvez réessayer.',
  UNSUPPORTED:
    'Ce type de création n’est pas disponible pour le moment. Vos crédits ont été restitués.',
  PROVIDER:
    'Le service de création n’a pas pu terminer votre demande. Vos crédits ont été restitués : vous pouvez réessayer.',
  PROVIDER_CREDIT:
    'La création est momentanément indisponible. Vos crédits ont été restitués : réessayez un peu plus tard.',
  CANCELED: 'La création a été annulée. Vos crédits ont été restitués.',
};

type GenerationRow = Prisma.GenerationGetPayload<{
  include: {
    product: true;
    model: true;
    preset: { include: { media: true } };
    media: true;
  };
}>;

const INCLUDE = {
  product: true,
  model: true,
  preset: { include: { media: true } },
  media: true,
} as const;

const RUNNING = ['PENDING', 'SUBMITTED', 'PROCESSING'] as const;

function statusOf(s: string): CreationStatus {
  if (s === 'COMPLETED') return 'COMPLETED';
  if (s === 'FAILED' || s === 'CANCELLED') return 'FAILED';
  return s === 'PENDING' ? 'PENDING' : 'PROCESSING';
}

/** Description affichée : le prompt, ou, pour une ancienne création, ses anciens champs réunis. */
function promptOf(o: CreationOptions): string | null {
  if (o.prompt) return o.prompt;
  const legacy = [o.text, o.price, o.phone].filter(Boolean).join(' · ');
  return legacy || null;
}

@Injectable()
export class CreationsService {
  private readonly logger = new Logger(CreationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly storage: StorageDriver,
    private readonly provider: GenerationProvider,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly pricing: PricingService,
    private readonly providerLedger: ProviderLedgerService,
    private readonly catalog: ModelCatalogService,
    private readonly creditPricing: CreditPricingService,
    private readonly videoRates: VideoRatesService,
  ) {}

  // ───────────── Idées et réglages ─────────────

  /** Tarifs, valeur du crédit et garde-fou : tout vient du catalogue et de la configuration, jamais du code. */
  async config(): Promise<CreationConfig> {
    const [model, ctx, creditValueFcfa, credits, balancePercent] =
      await Promise.all([
        this.catalog.defaultModel(),
        this.creditPricing.context(),
        this.credits.creditValue(),
        this.settings.get('generationConfirmCredits'),
        this.settings.get('generationConfirmBalancePercent'),
      ]);
    const rates = await this.videoRates.ratesOf(model, ctx);
    return {
      rates,
      creditValueFcfa,
      guard: { credits, balancePercent },
      model: this.modelSchema(model),
    };
  }

  /**
   * Schéma du modèle actif rendu au client : qualités, bornes de durée et formats viennent du CATALOGUE.
   * Le formulaire de création s'en déduit — aucune de ces listes n'est écrite dans l'interface.
   * Les valeurs sont filtrées par ce que le contrat partagé autorise : un modèle qui proposerait une
   * qualité inconnue du parcours ne la verrait pas apparaître, plutôt que de casser la page.
   */
  private modelSchema(model: CatalogModel): CreationModelSchema {
    const resolutionParam = model.params.find((p) => p.role === 'RESOLUTION');
    const durationParam = model.params.find((p) => p.role === 'DURATION');
    const formatParam = model.params.find((p) => p.role === 'ASPECT_RATIO');

    const resolutions = enumValues(resolutionParam?.allowedValues).filter(
      (r): r is VideoResolution =>
        (VIDEO_RESOLUTIONS as readonly string[]).includes(r),
    );
    const formats = enumValues(formatParam?.allowedValues).filter(
      (f): f is CreationFormat =>
        (CREATION_FORMATS as readonly string[]).includes(f),
    );
    const bounds = integerBounds(durationParam?.allowedValues);
    const fallbackDefault = Number(durationParam?.defaultValue);

    return {
      slug: model.slug,
      name: model.name,
      needsPhoto: model.params.some((p) => p.role === 'IMAGE_URL'),
      resolutions:
        resolutions.length > 0 ? resolutions : [...VIDEO_RESOLUTIONS],
      duration: {
        min: bounds.min ?? VIDEO_DURATION.min,
        max: bounds.max ?? VIDEO_DURATION.max,
        default: Number.isInteger(fallbackDefault)
          ? fallbackDefault
          : VIDEO_DURATION.default,
      },
      formats: formats.length > 0 ? formats : [...CREATION_FORMATS],
      defaultFormat: formats[0] ?? DEFAULT_FORMAT,
    };
  }

  /**
   * Devis pour des paramètres donnés, GARDÉ côté serveur pour un temps réglable (`quoteValiditySeconds`,
   * 10 minutes par défaut). Appliquer une nouvelle configuration prend effet tout de suite sur les devis
   * SUIVANTS ; celui-ci reste honoré jusqu'à son échéance, tant qu'il couvre encore le coût fournisseur.
   */
  async quote(
    userId: string,
    input: CreationQuoteInput,
  ): Promise<CreationQuoteView> {
    const model = await this.catalog.defaultModel();
    const ctx = await this.creditPricing.context();
    const built = this.catalog.build(
      model,
      this.clientValuesOf(model, {
        prompt: 'devis',
        durationSeconds: input.durationSeconds,
        resolution: input.resolution,
        format: input.format,
      } as CreateCreationInput),
      { prompt: 'devis' },
    );
    const rates = await this.videoRates.ratesOf(model, ctx);
    const credits = videoCostCredits(
      rates,
      input.resolution,
      input.durationSeconds,
    );
    const unit = await this.catalog.costPerUnit(model, {
      priced: built.priced,
      resolution: built.resolution,
      at: ctx.at,
    });
    const costMicroUsd =
      unit.microUsdPerUnit *
      BigInt(input.durationSeconds) *
      BigInt(unit.price.billableMultiplier);
    const validity = ctx.config.quoteValiditySeconds;
    const row = await this.prisma.creationQuote.create({
      data: {
        userId,
        modelSlug: model.slug,
        resolution: built.resolution,
        durationSeconds: input.durationSeconds,
        options: built.priced as unknown as Prisma.InputJsonValue,
        credits,
        costMicroUsd,
        pricingConfigId: ctx.config.id,
        expiresAt: new Date(Date.now() + validity * 1000),
      },
    });
    return {
      quoteId: row.id,
      credits,
      creditsPerSecond: rates[input.resolution],
      resolution: input.resolution,
      durationSeconds: input.durationSeconds,
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  /**
   * Prix à facturer en tenant compte d'un devis déjà affiché. Le devis l'emporte s'il est encore valable,
   * s'il porte EXACTEMENT les mêmes paramètres, et s'il couvre toujours le coût fournisseur. Cette dernière
   * condition n'est pas négociable : la promesse commerciale ne va jamais jusqu'à vendre à perte.
   */
  private async honouredPrice(
    userId: string,
    quoteId: string | undefined,
    p: {
      modelSlug: string;
      resolution: string | null;
      durationSeconds: number;
      freshCredits: number;
      costMicroUsd: bigint;
      ctx: PricingContext;
    },
  ): Promise<{ credits: number; quoteId: string | null }> {
    if (!quoteId) return { credits: p.freshCredits, quoteId: null };
    const row = await this.prisma.creationQuote.findFirst({
      where: {
        id: quoteId,
        userId,
        usedAt: null,
        expiresAt: { gt: new Date() },
        modelSlug: p.modelSlug,
        resolution: p.resolution,
        durationSeconds: p.durationSeconds,
      },
    });
    if (!row) return { credits: p.freshCredits, quoteId: null };
    if (row.credits >= p.freshCredits) {
      return { credits: row.credits, quoteId: row.id };
    }
    // Le tarif a monté depuis le devis : on l'honore seulement s'il couvre encore le coût.
    const cover = this.creditPricing.coverCredits(p.ctx, p.costMicroUsd);
    if (row.credits >= cover) return { credits: row.credits, quoteId: row.id };
    this.logger.warn(
      `Devis ${row.id} non honoré : ${row.credits} crédits ne couvrent plus le coût (${cover} requis).`,
    );
    return { credits: p.freshCredits, quoteId: null };
  }

  async listStyles(audience?: SuggestionAudience): Promise<StyleView[]> {
    const presets = await this.prisma.preset.findMany({
      where: { visible: true },
      include: {
        media: { where: { role: 'PRESET_THUMBNAIL' } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return presets
      .map((p): StyleView => {
        const d = (p.defaults ?? {}) as Partial<{
          format: CreationFormat;
          resolution: VideoResolution;
          durationSeconds: number;
        }>;
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          category: p.category,
          audience: p.audience === 'perso' ? 'perso' : 'business',
          featured: p.featured,
          prompt: p.defaultPrompt,
          photoHint: p.photoHint,
          format: d.format ?? null,
          resolution: d.resolution ?? null,
          durationSeconds: d.durationSeconds ?? null,
          thumbnailUrl: p.media.some((m) => !m.purgedAt)
            ? `/api/creations/styles/${p.id}/thumbnail`
            : null,
        };
      })
      .filter((s) => !audience || s.audience === audience);
  }

  async styleThumbnail(id: string): Promise<{ body: Buffer; mime: string }> {
    const media = await this.prisma.mediaFile.findFirst({
      where: {
        presetId: id,
        role: 'PRESET_THUMBNAIL',
        purgedAt: null,
        preset: { visible: true },
      },
    });
    if (!media) throw new NotFoundException();
    return { body: await this.storage.get(media.key), mime: media.mimeType };
  }

  // ───────────── Création ─────────────

  async create(
    userId: string,
    ip: string | undefined,
    file: UploadedImage | undefined,
    input: CreateCreationInput,
  ): Promise<CreationView> {
    if (await this.settings.get('maintenanceMode')) {
      throw new ServiceUnavailableException({
        code: 'MAINTENANCE',
        message: 'Yamboka est en maintenance. Réessaie un peu plus tard.',
      });
    }
    // Filet de secours : le fournisseur a déjà annoncé son solde épuisé. On refuse AVANT de réserver des
    // crédits, plutôt que d'encaisser une réservation pour une création qui échouera à coup sûr.
    if (await this.providerOutOfCredits()) {
      throw new ServiceUnavailableException({
        code: 'GENERATION_UNAVAILABLE',
        message:
          'La création est momentanément indisponible. Réessaie un peu plus tard.',
      });
    }
    if (!file || file.size === 0) {
      throw new BadRequestException({
        code: 'PHOTO_REQUIRED',
        message: 'Ajoute une photo.',
      });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException({
        code: 'PHOTO_TOO_LARGE',
        message: 'La photo dépasse 10 Mo.',
      });
    }
    const sniffed = sniffImage(file.buffer);
    if (!sniffed) {
      throw new BadRequestException({
        code: 'PHOTO_INVALID',
        message: 'Le fichier n’est pas une photo JPG, PNG ou WebP.',
      });
    }
    // RG-31 : consentement obligatoire avant chaque génération (droit d'utiliser la photo, respect de la charte).
    if (!input.consent) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Données invalides.',
        details: [
          {
            field: 'consent',
            message:
              'Confirmez que vous avez le droit d’utiliser cette photo et que son contenu respecte la charte de Yamboka.',
          },
        ],
      });
    }

    // Modèle du catalogue : celui par défaut tant qu'il n'y en a qu'un actif. Un modèle désactivé est
    // refusé ici, avant toute réservation.
    const model = await this.catalog.defaultModel();
    const preset = input.styleId ? await this.loadStyle(input.styleId) : null;
    if (input.styleId && !preset) {
      throw new BadRequestException({
        code: 'STYLE_UNAVAILABLE',
        message: 'Cette idée n’est plus disponible.',
      });
    }

    // L'`input` est RECONSTRUIT depuis le catalogue : tout ce que le client a envoyé est validé contre les
    // valeurs autorisées, et une clé hors catalogue est refusée. Rien n'est relayé tel quel.
    const clientValues = this.clientValuesOf(model, input);
    const built = this.catalog.build(model, clientValues);

    // Coût : recalculé ICI avec la MÊME fonction que l'affichage et que le simulateur. Rien ne vient du client.
    const ctx = await this.creditPricing.context();
    const rates = await this.videoRates.ratesOf(model, ctx);
    const freshCost = videoCostCredits(
      rates,
      input.resolution,
      input.durationSeconds,
    );

    const limit = await this.concurrencyLimit();
    const running = await this.prisma.generation.count({
      where: { userId, status: { in: [...RUNNING] }, deletedAt: null },
    });
    if (running >= limit) {
      throw new HttpException(
        {
          code: 'TOO_MANY_RUNNING',
          message: `Tu as déjà ${running} vidéo${running > 1 ? 's' : ''} en cours. Attends qu’une d’elles soit prête.`,
        },
        429,
      );
    }

    // Coût FOURNISSEUR de cette création, figé maintenant : tarif en vigueur à cette seconde, options
    // réellement envoyées, taux sortant et marge du moment. Plus rien ne se recalculera après coup.
    const billing = await this.freezeProviderCost(userId, model, {
      priced: built.priced,
      resolution: built.resolution ?? input.resolution,
      durationSeconds: built.durationSeconds ?? input.durationSeconds,
      ctx,
    });

    // Devis déjà affiché : il est honoré s'il est encore valable ET s'il couvre toujours le coût.
    const unitForQuote = await this.catalog.costPerUnit(model, {
      priced: built.priced,
      resolution: built.resolution ?? input.resolution,
      at: ctx.at,
    });
    const honoured = await this.honouredPrice(userId, input.quoteId, {
      modelSlug: model.slug,
      resolution: built.resolution ?? input.resolution,
      durationSeconds: input.durationSeconds,
      freshCredits: freshCost,
      costMicroUsd:
        unitForQuote.microUsdPerUnit *
        BigInt(input.durationSeconds) *
        BigInt(unitForQuote.price.billableMultiplier),
      ctx,
    });
    const cost = honoured.credits;

    const options: CreationOptions = {
      prompt: input.prompt,
      format: input.format,
      resolution: input.resolution,
      durationSeconds: input.durationSeconds,
    };
    const generationId = randomUUID();
    const key = `inputs/${userId}/${generationId}.${sniffed.ext}`;
    await this.storage.put(key, file.buffer, sniffed.mime);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.generation.create({
          data: {
            id: generationId,
            userId,
            modelId: model.id,
            modelSlug: model.slug,
            presetId: preset?.id ?? null,
            creditsCost: cost,
            billableSeconds: input.durationSeconds,
            costMicroUsd: billing?.costMicroUsd,
            pricingRate: billing?.rateText,
            marginPercent: billing?.marginPercent,
            priceFcfa: billing?.priceFcfa,
            modelPriceId: billing?.modelPriceId,
            pricingConfigId: billing?.pricingConfigId,
            prompt: input.prompt,
            options: options as unknown as Prisma.InputJsonValue,
            consentAt: new Date(),
            consentIp: ip ?? null,
          },
        });
        await tx.mediaFile.create({
          data: {
            role: 'INPUT_IMAGE',
            bucket: 'INPUTS',
            key,
            mimeType: sniffed.mime,
            sizeBytes: file.size,
            ownerId: userId,
            generationId,
            verifiedAt: new Date(),
          },
        });
        // Débit atomique : réservation dans la même transaction que la création (échec = rien n'est créé).
        await this.credits.reserve(tx, {
          userId,
          generationId,
          amount: cost,
        });
        // Les dollars sont engagés dans la MÊME transaction : on ne peut pas réserver des crédits pour une
        // création que le solde fournisseur ne peut pas payer, ni l'inverse.
        if (honoured.quoteId) {
          // Un devis ne sert qu'une fois, et dans la même transaction que le débit.
          await tx.creationQuote.updateMany({
            where: { id: honoured.quoteId, usedAt: null },
            data: { usedAt: new Date() },
          });
        }
        if (billing) {
          await this.providerLedger.reserve(tx, {
            generationId,
            costMicroUsd: billing.costMicroUsd,
            fcfaPerUsd: billing.rateText,
            safetyMarginMicroUsd: billing.safetyMarginMicroUsd,
          });
        }
      });
    } catch (e) {
      await this.storage.delete(key).catch(() => undefined);
      throw e;
    }

    // Premier envoi tout de suite ; la tâche périodique prend le relais en cas d'échec ou de lenteur.
    await this.advance(generationId).catch((e: unknown) =>
      this.logger.error(`Envoi de ${generationId} : ${String(e)}`),
    );
    return this.get(userId, generationId);
  }

  /**
   * Valeurs que le CLIENT a le droit de choisir, traduites vers les clés exactes du modèle. Le parcours
   * connaît des rôles (durée, qualité, format, description) ; le catalogue connaît les clés du fournisseur.
   * C'est la seule jointure entre les deux, et elle ne porte aucun nom de modèle.
   */
  private clientValuesOf(
    model: CatalogModel,
    input: CreateCreationInput,
  ): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    const put = (
      role: Parameters<typeof this.catalog.keyOfRole>[1],
      v: unknown,
    ) => {
      const param = model.params.find((x) => x.role === role);
      // Un paramètre imposé par la configuration n'est jamais renseigné depuis le client.
      if (param && param.exposure === 'CLIENT') values[param.key] = v;
    };
    put('PROMPT', input.prompt);
    put('DURATION', input.durationSeconds);
    put('RESOLUTION', input.resolution);
    put('ASPECT_RATIO', input.format);
    return values;
  }

  /**
   * Fige ce que coûte une création chez le fournisseur et vérifie qu'on peut se le permettre : tarif en
   * vigueur, options RÉELLEMENT envoyées, taux sortant, marge, puis plafonds de dépense du jour.
   *
   * Renvoie null avec le fournisseur SIMULÉ : aucun dollar réel n'est dépensé, donc rien n'est engagé.
   * Les refus arrivent AVANT toute réservation de crédits.
   */
  private async freezeProviderCost(
    userId: string,
    model: CatalogModel,
    p: {
      priced: Record<string, unknown>;
      resolution: string | null;
      durationSeconds: number;
      ctx: PricingContext;
    },
  ): Promise<{
    costMicroUsd: bigint;
    rateText: string;
    marginPercent: string;
    priceFcfa: number;
    modelPriceId: string;
    pricingConfigId: string;
    safetyMarginMicroUsd: bigint;
  } | null> {
    if (this.provider.name === 'mock') return null;

    const { ctx } = p;
    const cost = await this.catalog.cost(model, {
      priced: p.priced,
      resolution: p.resolution,
      durationSeconds: p.durationSeconds,
      at: ctx.at,
    });
    const costMicroUsd = cost.microUsd;

    // Plafonds quotidiens : filet contre une fuite (boucle, abus) qui viderait le compte prépayé en une nuit.
    const since = startOfToday();
    const [spentAll, spentUser] = await Promise.all([
      this.providerLedger.spentSince(since),
      this.providerLedger.spentSince(since, { userId }),
    ]);
    if (spentAll + costMicroUsd > ctx.config.dailyCapMicroUsd) {
      this.logger.error(
        `Plafond quotidien de dépense fournisseur atteint (${formatMicroUsd(ctx.config.dailyCapMicroUsd)} $) : créations refusées.`,
      );
      throw new ServiceUnavailableException({
        code: 'GENERATION_UNAVAILABLE',
        message:
          'La création est momentanément indisponible. Réessaie un peu plus tard.',
      });
    }
    if (spentUser + costMicroUsd > ctx.config.dailyUserCapMicroUsd) {
      throw new HttpException(
        {
          code: 'DAILY_LIMIT_REACHED',
          message:
            'Tu as atteint ta limite de créations pour aujourd’hui. Réessaie demain.',
        },
        429,
      );
    }

    return {
      costMicroUsd,
      rateText: formatRate(ctx.rate.rate),
      marginPercent: ctx.marginPercent,
      priceFcfa: netNeededFcfa(costMicroUsd, ctx.rate.rate, ctx.marginPercent),
      modelPriceId: cost.modelPriceId,
      pricingConfigId: ctx.config.id,
      safetyMarginMicroUsd: ctx.config.safetyMarginMicroUsd,
    };
  }

  private loadStyle(id: string) {
    return this.prisma.preset.findFirst({ where: { id, visible: true } });
  }

  /** Texte envoyé au modèle : celui du client dans le gabarit du serveur. */
  composePrompt(text: string | null | undefined): string {
    const base = (text ?? '').trim().replace(/[.\s]+$/, '');
    return PROMPT_TEMPLATE.replace('{texte}', base);
  }

  private async concurrencyLimit(): Promise<number> {
    const row = await this.prisma.setting.findUnique({
      where: { key: 'maxConcurrentGenerationsPerUser' },
    });
    return typeof row?.value === 'number' && row.value > 0 ? row.value : 2;
  }

  // ───────────── Lecture ─────────────

  async list(
    userId: string,
    q: {
      page: number;
      pageSize: number;
      status?: 'ready' | 'running' | 'failed';
    },
  ): Promise<CreationPage> {
    const statuses =
      q.status === 'ready'
        ? ['COMPLETED']
        : q.status === 'running'
          ? [...RUNNING]
          : q.status === 'failed'
            ? ['FAILED', 'CANCELLED']
            : undefined;
    // Toujours borné à l'utilisateur connecté : on ne liste que SES créations.
    const where: Prisma.GenerationWhereInput = {
      userId,
      deletedAt: null,
      hidden: false,
      ...(statuses ? { status: { in: statuses as never[] } } : {}),
    };
    const total = await this.prisma.generation.count({ where });
    const pageNumber = clampPage(q.page, total, q.pageSize);
    const rows = await this.prisma.generation.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.pageSize,
      skip: (pageNumber - 1) * q.pageSize,
    });
    let page = rows;
    const running = page.filter((g) =>
      (RUNNING as readonly string[]).includes(g.status),
    );
    if (running.length > 0) {
      for (const g of running) {
        await this.advance(g.id).catch((e: unknown) =>
          this.logger.error(`Suivi de ${g.id} : ${String(e)}`),
        );
      }
      const fresh = await this.prisma.generation.findMany({
        where: { id: { in: page.map((g) => g.id) } },
        include: INCLUDE,
      });
      const byId = new Map(fresh.map((g) => [g.id, g]));
      page = page.map((g) => byId.get(g.id) ?? g);
    }
    return buildPage(
      page.map((g) => this.view(g)),
      total,
      pageNumber,
      q.pageSize,
    );
  }

  async get(userId: string, id: string): Promise<CreationView> {
    const g = await this.owned(userId, id);
    if (!(RUNNING as readonly string[]).includes(g.status)) return this.view(g);
    // Suivi à la consultation : la création avance même sans file de tâches (test, panne de Redis).
    await this.advance(id).catch((e: unknown) =>
      this.logger.error(`Suivi de ${id} : ${String(e)}`),
    );
    return this.view(await this.owned(userId, id));
  }

  private async owned(userId: string, id: string): Promise<GenerationRow> {
    const g = await this.prisma.generation.findFirst({
      where: { id, userId, deletedAt: null, hidden: false },
      include: INCLUDE,
    });
    if (!g) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Création introuvable.',
      });
    }
    return g;
  }

  private view(g: GenerationRow): CreationView {
    const options = (g.options as unknown as CreationOptions | null) ?? {
      format: '9:16',
    };
    const output = g.media.find((m) => m.role === 'OUTPUT_VIDEO');
    const input = g.media.find((m) => m.role === 'INPUT_IMAGE');
    const ready = g.status === 'COMPLETED' && !!output && !output.purgedAt;
    const failed = g.status === 'FAILED' || g.status === 'CANCELLED';
    const base = `/api/creations/${g.id}`;
    const posterOk = !!input && !input.purgedAt;
    return {
      id: g.id,
      styleName: g.preset?.name ?? null,
      status: statusOf(g.status),
      styleId: g.presetId,
      prompt: promptOf(options),
      credits: g.creditsCost,
      refunded: failed,
      errorMessage: failed
        ? (FAILURE_MESSAGES[g.failureCode as FailureCode] ?? FAILURE_MESSAGE)
        : null,
      options,
      createdAt: g.createdAt.toISOString(),
      completedAt: g.completedAt?.toISOString() ?? null,
      expiresAt: g.outputExpiresAt?.toISOString() ?? null,
      simulated: (g.providerRequestId ?? '').startsWith('MOCK-'),
      thumbnailUrl: posterOk ? `${base}/file?variant=thumb` : null,
      fileUrl: ready ? `${base}/file` : null,
      downloadUrl: ready ? `${base}/file?download=1` : null,
    };
  }

  async file(
    userId: string,
    id: string,
    variant: 'output' | 'thumb',
  ): Promise<{ body: Buffer; mime: string; filename: string }> {
    const g = await this.owned(userId, id);
    const wanted: MediaFile | undefined =
      variant === 'thumb'
        ? g.media.find((m) => m.role === 'INPUT_IMAGE')
        : g.media.find((m) => m.role === 'OUTPUT_VIDEO');
    const notReady = variant === 'output' && g.status !== 'COMPLETED';
    if (!wanted || wanted.purgedAt || notReady) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Fichier introuvable.',
      });
    }
    const slug = (g.preset?.name ?? 'creation')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const ext = wanted.key.split('.').pop() ?? 'bin';
    return {
      body: await this.storage.get(wanted.key),
      mime: wanted.mimeType,
      filename: `yamboka-${slug}-${g.id.slice(0, 8)}.${ext}`,
    };
  }

  // ───────────── Suppression et signalement ─────────────

  async remove(userId: string, id: string): Promise<void> {
    const g = await this.owned(userId, id);
    if ((RUNNING as readonly string[]).includes(g.status)) {
      throw new ConflictException({
        code: 'IN_PROGRESS',
        message: 'Cette création est en cours : attendez qu’elle se termine.',
      });
    }
    if (g.retentionHold) {
      throw new ConflictException({
        code: 'RETENTION_HOLD',
        message:
          'Cette création fait l’objet d’un signalement : elle ne peut pas être supprimée pour le moment.',
      });
    }
    const now = new Date();
    for (const m of g.media.filter((m) => !m.purgedAt)) {
      await this.storage.delete(m.key);
    }
    await this.prisma.$transaction([
      this.prisma.mediaFile.updateMany({
        where: { generationId: id, purgedAt: null },
        data: { purgedAt: now },
      }),
      this.prisma.generation.update({
        where: { id },
        data: { deletedAt: now, inputsPurgedAt: now, outputPurgedAt: now },
      }),
    ]);
  }

  async report(
    userId: string,
    id: string,
    input: ReportCreationInput,
  ): Promise<void> {
    await this.owned(userId, id);
    const existing = await this.prisma.report.findFirst({
      where: {
        generationId: id,
        reporterUserId: userId,
        status: { in: ['NEW', 'IN_PROGRESS'] },
      },
    });
    if (existing) return;
    await this.prisma.$transaction([
      this.prisma.report.create({
        data: {
          generationId: id,
          reporterUserId: userId,
          reason: input.reason,
          details: input.details || null,
        },
      }),
      // RG-28 : un signalement gèle la conservation des fichiers.
      this.prisma.generation.update({
        where: { id },
        data: { retentionHold: true },
      }),
    ]);
  }

  // ───────────── Traitement asynchrone ─────────────

  /** Fait avancer toutes les créations en cours (appelé par la tâche périodique). */
  async advanceAll(): Promise<number> {
    const rows = await this.prisma.generation.findMany({
      where: { status: { in: [...RUNNING] } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    for (const r of rows) {
      await this.advance(r.id).catch((e: unknown) =>
        this.logger.error(`Création ${r.id} : ${String(e)}`),
      );
    }
    return rows.length;
  }

  /**
   * Une étape de plus pour une création : envoi au fournisseur, puis consultation de son statut réel (seule
   * source de vérité pour finaliser ou rembourser). Idempotent : rejouer ne débite ni ne rembourse deux fois.
   */
  async advance(id: string): Promise<void> {
    let g = await this.prisma.generation.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!g || !(RUNNING as readonly string[]).includes(g.status)) return;

    if (Date.now() - g.createdAt.getTime() > GENERATION_TIMEOUT_MS) {
      if (g.providerStatusUrl) {
        await this.provider
          .cancel(g.providerStatusUrl.replace(/status(?=\?|$)/, 'cancel'))
          .catch(() => undefined);
      }
      // Si les crédits ont déjà été consommés (résultat obtenu juste avant), fail() ne rembourse pas : on laisse
      // alors le suivi normal terminer la création au lieu de la bloquer.
      if (await this.fail(g, 'Délai dépassé.', 'TIMEOUT')) return;
    }

    try {
      if (g.status === 'PENDING') {
        await this.submit(g);
        g = await this.prisma.generation.findUnique({
          where: { id },
          include: INCLUDE,
        });
        if (!g) return;
      }
      await this.poll(g);
    } catch (e) {
      if (e instanceof GenerationUnavailableError) {
        // Fournisseur momentanément injoignable : on réessaiera au prochain passage (limite : le délai ci-dessus).
        this.logger.warn(`Fournisseur indisponible pour ${id} : ${e.message}`);
        return;
      }
      if (e instanceof GenerationProviderOutOfCreditsError) {
        // Le fournisseur dit lui-même qu'il ne peut plus produire : on bloque les nouvelles créations, on
        // restitue les crédits de celle-ci, et l'administration est alertée.
        await this.blockForProviderCredit(e.message);
        // D'abord rendre ce qui a été engagé pour CETTE création (rien n'a été produit), ENSUITE seulement
        // ramener le solde à zéro : dans l'autre ordre, la restitution rouvrirait un solde déclaré vide.
        await this.fail(g as GenerationRow, e.message, 'PROVIDER_CREDIT');
        await this.providerLedger
          .markExhausted(e.message)
          .catch((err: unknown) =>
            this.logger.error(`Recalage à zéro impossible : ${String(err)}`),
          );
        return;
      }
      if (
        e instanceof GenerationRejectedError ||
        e instanceof GenerationAuthError
      ) {
        await this.fail(
          g as GenerationRow,
          e.message,
          e instanceof OutputRejectedError ? e.failureCode : 'PROVIDER',
        );
        return;
      }
      throw e;
    }
  }

  private async submit(g: GenerationRow): Promise<void> {
    const options = (g.options as unknown as CreationOptions | null) ?? {
      format: '9:16',
    };
    const mock = this.provider.name === 'mock';
    // Le slug figé sur la génération fait foi : le catalogue a pu changer depuis la réservation.
    const slug =
      g.modelSlug ?? g.model?.slug ?? g.product?.providerModel ?? null;
    if (!slug) {
      return void (await this.fail(g, 'Modèle introuvable.', 'UNSUPPORTED'));
    }
    let model: CatalogModel;
    try {
      model = await this.catalog.bySlug(slug, { requireActive: false });
    } catch {
      return void (await this.fail(
        g,
        `Modèle non géré : ${slug}`,
        'UNSUPPORTED',
      ));
    }

    // Photo d'entrée : exigée seulement par les modes qui la consomment.
    const needsImage = this.catalog.keyOfRole(model, 'IMAGE_URL') !== null;
    let imageUrl: string | undefined;
    if (needsImage) {
      const inputMedia = g.media.find((m) => m.role === 'INPUT_IMAGE');
      if (!inputMedia)
        return void (await this.fail(g, 'Photo introuvable.', 'BAD_RESULT'));
      imageUrl = await this.provider.uploadInput(
        await this.storage.get(inputMedia.key),
        inputMedia.mimeType,
      );
    }

    // `input` reconstruit à partir du catalogue, avec les choix figés de la création.
    let built;
    try {
      built = this.catalog.build(
        model,
        this.clientValuesOf(model, {
          prompt: g.prompt ?? '',
          durationSeconds: g.billableSeconds ?? options.durationSeconds ?? 5,
          resolution: options.resolution ?? DEFAULT_RESOLUTION,
          format: options.format,
        } as CreateCreationInput),
        {
          prompt: this.composePrompt(g.prompt),
          imageUrl,
        },
      );
    } catch (e) {
      return void (await this.fail(
        g,
        `Paramètres refusés par le catalogue : ${(e as Error).message}`,
        'UNSUPPORTED',
      ));
    }
    // Seul le simulé lit le texte brut (marqueur d'échec de test) : un vrai modèle ne reçoit que ses paramètres.
    const input = mock
      ? { ...built.input, prompt: g.prompt ?? '' }
      : built.input;

    let result;
    try {
      result = await this.provider.submit({
        model: slug,
        input,
        idempotencyKey: g.id,
      });
    } catch (e) {
      // Erreur de paramètre côté fournisseur : on journalise le corps de la réponse et on alerte, mais on
      // ne désactive JAMAIS le modèle tout seul (un faux positif couperait la production).
      if (e instanceof GenerationRejectedError) {
        this.logger.error(
          `Appel refusé par le fournisseur — modèle ${slug}, input ${JSON.stringify(input)} : ${e.message}`,
        );
        await this.recordModelRejection(slug, e.message);
      }
      throw e;
    }
    await this.prisma.generation.updateMany({
      where: { id: g.id, status: 'PENDING' },
      data: {
        status: 'SUBMITTED',
        providerRequestId: result.requestId,
        providerStatusUrl: result.statusUrl,
        providerInput: input as unknown as Prisma.InputJsonValue,
        submittedAt: new Date(),
      },
    });
    // Une soumission acceptée prouve que le solde fournisseur est revenu : le verrou se lève de lui-même.
    await this.clearProviderCreditBlock();
  }

  /**
   * Dernier refus de paramètres par le fournisseur, gardé pour l'administration (alerte). Le modèle n'est
   * JAMAIS désactivé automatiquement : un refus isolé ne prouve pas que le catalogue est faux, et couper la
   * production sur un faux positif coûte plus cher que l'alerte.
   */
  private async recordModelRejection(
    slug: string,
    message: string,
  ): Promise<void> {
    const value = JSON.stringify({
      slug,
      message: message.slice(0, 500),
      at: new Date().toISOString(),
    });
    await this.prisma.setting
      .upsert({
        where: { key: MODEL_REJECTION_KEY },
        update: { value },
        create: { key: MODEL_REJECTION_KEY, value },
      })
      .catch(() => undefined);
  }

  /** Date de détection du solde fournisseur épuisé, ou null si la production est ouverte. */
  private async providerOutOfCredits(): Promise<boolean> {
    const row = await this.prisma.setting.findUnique({
      where: { key: PROVIDER_OUT_OF_CREDITS_KEY },
    });
    return typeof row?.value === 'string' && row.value.length > 0;
  }

  /**
   * Pose le verrou « solde fournisseur épuisé ». Idempotent : la date de la PREMIÈRE détection est conservée,
   * pour que l'administration sache depuis quand la production est arrêtée.
   */
  private async blockForProviderCredit(reason: string): Promise<void> {
    this.logger.error(
      `Solde du fournisseur de génération épuisé, nouvelles créations bloquées : ${reason}`,
    );
    if (await this.providerOutOfCredits()) return;
    const now = new Date().toISOString();
    await this.prisma.setting.upsert({
      where: { key: PROVIDER_OUT_OF_CREDITS_KEY },
      update: { value: now },
      create: { key: PROVIDER_OUT_OF_CREDITS_KEY, value: now },
    });
  }

  /**
   * Lève le verrou en supprimant la ligne (le réglage est absent quand la production est ouverte :
   * `Setting.value` n'accepte pas null). Sans effet s'il n'est pas posé.
   */
  private async clearProviderCreditBlock(): Promise<void> {
    const { count } = await this.prisma.setting.deleteMany({
      where: { key: PROVIDER_OUT_OF_CREDITS_KEY },
    });
    if (count > 0) {
      this.logger.log(
        'Soumission acceptée par le fournisseur : blocage « solde épuisé » levé.',
      );
    }
  }

  private async poll(g: GenerationRow): Promise<void> {
    if (!g.providerStatusUrl) return;
    const result = await this.provider.getStatus(g.providerStatusUrl);
    if (result.status === 'completed') {
      await this.complete(g, result.outputUrl);
    } else if (
      result.status === 'failed' ||
      result.status === 'rejected' ||
      result.status === 'canceled'
    ) {
      await this.fail(
        g,
        result.error ?? result.status,
        result.status === 'rejected'
          ? 'MODERATION'
          : result.status === 'canceled'
            ? 'CANCELED'
            : 'PROVIDER',
      );
    } else if (result.status === 'processing' && g.status === 'SUBMITTED') {
      await this.prisma.generation.updateMany({
        where: { id: g.id, status: 'SUBMITTED' },
        data: { status: 'PROCESSING' },
      });
    }
  }

  private async complete(g: GenerationRow, outputUrl?: string): Promise<void> {
    if (!outputUrl) {
      await this.fail(g, 'Terminé sans fichier.', 'NO_RESULT');
      return;
    }
    const body = await this.fetchOutput(outputUrl);
    // Le fichier est contrôlé AVANT toute capture de crédits : un résultat vide, illisible ou au mauvais format
    // lève OutputRejectedError, ce qui fait échouer la création et restitue les crédits.
    const { mime, ext } = checkOutput(body);
    const key = `outputs/${g.userId}/${g.id}.${ext}`;
    await this.storage.put(key, body, mime);

    const retention = await this.prisma.setting.findUnique({
      where: { key: 'outputRetentionDays' },
    });
    const days = typeof retention?.value === 'number' ? retention.value : 90;
    // Capture avant de marquer terminée : si on s'interrompt ici, la prochaine passe reprend sans rien dupliquer.
    await this.credits.capture(g.id);
    // Le fournisseur a bien produit : les dollars engagés sont définitivement dépensés.
    await this.providerLedger.capture(g.id);
    const now = new Date();
    let readyNoteId: string | null = null;
    const done = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.generation.updateMany({
        where: { id: g.id, status: { in: [...RUNNING] } },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          outputExpiresAt: new Date(now.getTime() + days * 86_400_000),
        },
      });
      if (claimed.count === 0) return false;
      await tx.mediaFile.upsert({
        where: { bucket_key: { bucket: 'OUTPUTS', key } },
        update: {},
        create: {
          role: 'OUTPUT_VIDEO',
          bucket: 'OUTPUTS',
          key,
          mimeType: mime,
          sizeBytes: body.length,
          ownerId: g.userId,
          generationId: g.id,
          verifiedAt: now,
        },
      });
      const note = await this.notifications.notify(tx, {
        userId: g.userId,
        type: 'GENERATION_READY',
        title: 'Votre création est prête',
        body: g.preset
          ? `« ${g.preset.name} » est prête dans Mes créations.`
          : 'Votre création est prête dans Mes créations.',
        link: `/app/creations/${g.id}`,
        dedupKey: `gen-ready:${g.id}`,
      });
      readyNoteId = note.id;
      return true;
    });
    if (!done) await this.storage.delete(key).catch(() => undefined);
    // Après validation de la transaction : un e-mail en panne ne peut pas défaire une création terminée.
    else await this.notifications.dispatchEmail(readyNoteId);
  }

  /** Télécharge le résultat. Le simulé fournit une vidéo de substitution : jamais la photo de l'utilisateur. */
  private async fetchOutput(url: string): Promise<Buffer> {
    if (url.startsWith('mock://')) {
      return await readFile(join(process.cwd(), 'assets', 'mock-output.mp4'));
    }
    if (!url.startsWith('https://')) {
      throw new OutputRejectedError(
        'BAD_RESULT',
        'Adresse de résultat refusée.',
      );
    }
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    } catch (e) {
      throw new GenerationUnavailableError(
        `Téléchargement impossible : ${String(e)}`,
      );
    }
    if (!res.ok) {
      throw new GenerationUnavailableError(
        `Téléchargement : HTTP ${res.status}`,
      );
    }
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length > MAX_OUTPUT_BYTES) {
      throw new OutputRejectedError('BAD_RESULT', 'Résultat trop volumineux.');
    }
    return body;
  }

  /**
   * Échec : les crédits réservés sont restitués (RELEASE, une seule fois) puis la création est marquée échouée.
   * Renvoie false, sans rien changer, si les crédits ont déjà été consommés par un succès (capture) : on ne rembourse
   * jamais une création réussie, ni ne la déclare échouée.
   */
  private async fail(
    g: GenerationRow,
    reason: string,
    code: FailureCode = 'PROVIDER',
  ): Promise<boolean> {
    this.logger.warn(`Création ${g.id} échouée (${code}) : ${reason}`);
    try {
      await this.credits.release(g.id);
    } catch (e) {
      if (e instanceof ConflictException) {
        this.logger.error(
          `Création ${g.id} : restitution impossible (${e.message}), échec non enregistré`,
        );
        return false;
      }
      throw e;
    }
    // Les crédits ont été restitués : les dollars engagés le sont aussi (le fournisseur ne facture pas un échec).
    await this.providerLedger
      .release(g.id)
      .catch((e: unknown) =>
        this.logger.error(
          `Création ${g.id} : dollars engagés non restitués (${String(e)})`,
        ),
      );
    const noteIds: (string | null)[] = [];
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.generation.updateMany({
        where: { id: g.id, status: { in: [...RUNNING] } },
        data: {
          status: 'FAILED',
          errorMessage: reason,
          failureCode: code,
          completedAt: new Date(),
        },
      });
      if (claimed.count === 0) return;
      const label = g.preset ? `« ${g.preset.name} »` : 'Votre création';
      const failed = await this.notifications.notify(tx, {
        userId: g.userId,
        type: 'GENERATION_FAILED',
        title: 'Création échouée',
        body: g.preset
          ? `${label} n’a pas abouti.`
          : 'Votre création n’a pas abouti.',
        link: `/app/creations/${g.id}`,
        dedupKey: `gen-failed:${g.id}`,
      });
      const refund = await this.notifications.notify(tx, {
        userId: g.userId,
        type: 'CREDITS_REFUNDED',
        title: 'Crédits restitués',
        body: `${g.creditsCost} ${g.creditsCost > 1 ? 'crédits vous ont été restitués' : 'crédit vous a été restitué'} après l’échec de votre création.`,
        link: '/app/historique',
        dedupKey: `refund:${g.id}`,
      });
      noteIds.push(failed.id, refund.id);
    });
    for (const id of noteIds) await this.notifications.dispatchEmail(id);
    return true;
  }
}
