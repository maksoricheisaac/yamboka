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
  CreationFormat,
  CreationOptions,
  CreationPage,
  CreationStatus,
  CreationView,
  CreditRates,
  ReportCreationInput,
  StyleView,
  SuggestionAudience,
  VideoResolution,
} from '@yamboka/shared';
import {
  DEFAULT_RESOLUTION,
  MAX_UPLOAD_BYTES,
  VIDEO_RESOLUTIONS,
  videoCostCredits,
} from '@yamboka/shared';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CreditsService } from '../credits/credits.service';
import {
  GenerationAuthError,
  GenerationProvider,
  GenerationRejectedError,
  GenerationUnavailableError,
} from '../generation/generation-provider';
import { WAN_MODEL, modelSpecOf } from '../generation/models';
import type {
  GenerationProduct,
  MediaFile,
  Preset,
  Prisma,
} from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
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
  CANCELED: 'La création a été annulée. Vos crédits ont été restitués.',
};

type GenerationRow = Prisma.GenerationGetPayload<{
  include: {
    product: true;
    preset: { include: { media: true } };
    media: true;
  };
}>;

const INCLUDE = {
  product: true,
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
  ) {}

  // ───────────── Idées et réglages ─────────────

  /** Produits vidéo actifs du modèle unique, un par résolution. */
  private async videoProducts(): Promise<Map<VideoResolution, GenerationProduct>> {
    const rows = await this.prisma.generationProduct.findMany({
      where: { active: true, providerModel: WAN_MODEL, billingUnit: 'SECOND' },
    });
    const out = new Map<VideoResolution, GenerationProduct>();
    for (const r of rows) {
      if ((VIDEO_RESOLUTIONS as readonly string[]).includes(r.resolution ?? '')) {
        out.set(r.resolution as VideoResolution, r);
      }
    }
    return out;
  }

  /** Tarifs, valeur du crédit et garde-fou : lus en base (modifiables dans l'administration), jamais en dur. */
  async config(): Promise<CreationConfig> {
    const [products, creditValueFcfa, credits, balancePercent] =
      await Promise.all([
        this.videoProducts(),
        this.credits.creditValue(),
        this.settings.get('generationConfirmCredits'),
        this.settings.get('generationConfirmBalancePercent'),
      ]);
    const rates = {} as CreditRates;
    for (const r of VIDEO_RESOLUTIONS) {
      rates[r] = products.get(r)?.creditsPerUnit ?? 0;
    }
    return { rates, creditValueFcfa, guard: { credits, balancePercent } };
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
    // Une photo qui montre une personne : le client confirme qu'il a le droit de l'utiliser.
    if (input.personPhoto && !input.consent) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Données invalides.',
        details: [
          {
            field: 'consent',
            message: 'Confirme que tu as le droit d’utiliser cette photo.',
          },
        ],
      });
    }

    const products = await this.videoProducts();
    const product = products.get(input.resolution);
    if (!product || !modelSpecOf(product.providerModel)) {
      if (this.provider.name !== 'mock' || !product) {
        throw new BadRequestException({
          code: 'STYLE_UNAVAILABLE',
          message: 'Cette qualité n’est pas disponible pour le moment.',
        });
      }
    }
    const preset = input.styleId ? await this.loadStyle(input.styleId) : null;
    if (input.styleId && !preset) {
      throw new BadRequestException({
        code: 'STYLE_UNAVAILABLE',
        message: 'Cette idée n’est plus disponible.',
      });
    }

    // Coût : recalculé ICI avec la même fonction que l'affichage, à partir des tarifs en base. Rien ne vient du client.
    const rates = {} as CreditRates;
    for (const r of VIDEO_RESOLUTIONS) {
      rates[r] = products.get(r)?.creditsPerUnit ?? 0;
    }
    const cost = videoCostCredits(rates, input.resolution, input.durationSeconds);

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
            productId: product.id,
            presetId: preset?.id ?? null,
            creditsCost: cost,
            billableSeconds: input.durationSeconds,
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
      cursor?: string;
      limit: number;
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
    const rows = await this.prisma.generation.findMany({
      where: {
        userId,
        deletedAt: null,
        hidden: false,
        ...(statuses ? { status: { in: statuses as never[] } } : {}),
      },
      include: INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    let page = rows.slice(0, q.limit);
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
    return {
      items: page.map((g) => this.view(g)),
      nextCursor: rows.length > q.limit ? page[page.length - 1].id : null,
    };
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
    const inputMedia = g.media.find((m) => m.role === 'INPUT_IMAGE');
    if (!inputMedia)
      return void (await this.fail(g, 'Photo introuvable.', 'BAD_RESULT'));
    const options = (g.options as unknown as CreationOptions | null) ?? {
      format: '9:16',
    };
    const spec = modelSpecOf(g.product.providerModel);
    const mock = this.provider.name === 'mock';
    if (!spec && !mock) {
      return void (await this.fail(
        g,
        `Modèle non géré : ${g.product.providerModel}`,
        'UNSUPPORTED',
      ));
    }
    const imageUrl = await this.provider.uploadInput(
      await this.storage.get(inputMedia.key),
      inputMedia.mimeType,
    );

    // Paramètres exacts du modèle (registre vérifié auprès de l'API). Le simulé n'en a pas besoin.
    const built = spec
      ? spec.build({
          prompt: this.composePrompt(g.prompt),
          imageUrl,
          format: options.format,
          resolution:
            options.resolution ?? g.product.resolution ?? DEFAULT_RESOLUTION,
          durationSeconds: g.billableSeconds ?? options.durationSeconds ?? 5,
          audio: true,
        })
      : {};
    // Seul le simulé lit le texte (marqueur d'échec de test) : un vrai modèle ne reçoit que ses paramètres documentés.
    const input = mock ? { ...built, prompt: g.prompt ?? '' } : built;

    const result = await this.provider.submit({
      model: g.product.providerModel,
      input,
      idempotencyKey: g.id,
    });
    await this.prisma.generation.updateMany({
      where: { id: g.id, status: 'PENDING' },
      data: {
        status: 'SUBMITTED',
        providerRequestId: result.requestId,
        providerStatusUrl: result.statusUrl,
        submittedAt: new Date(),
      },
    });
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
        link: '/app/credits/historique',
        dedupKey: `refund:${g.id}`,
      });
      noteIds.push(failed.id, refund.id);
    });
    for (const id of noteIds) await this.notifications.dispatchEmail(id);
    return true;
  }
}
