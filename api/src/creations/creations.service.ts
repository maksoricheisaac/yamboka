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
  CreationKind,
  CreationOptions,
  CreationPage,
  CreationStatus,
  CreationView,
  ReportCreationInput,
  StyleView,
} from '@yamboka/shared';
import { MAX_UPLOAD_BYTES } from '@yamboka/shared';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { quoteCredits, type ProductPricing } from '../catalog/pricing';
import { CreditsService } from '../credits/credits.service';
import {
  GenerationAuthError,
  GenerationProvider,
  GenerationRejectedError,
  GenerationUnavailableError,
} from '../generation/generation-provider';
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

export interface UploadedImage {
  buffer: Buffer;
  size: number;
  originalname: string;
}

/** Durée facturée d'une vidéo faite à partir d'une photo quand le style n'impose rien. */
const DEFAULT_VIDEO_SECONDS = 5;
/** Au-delà, une création sans réponse du fournisseur est annulée et remboursée. */
const GENERATION_TIMEOUT_MS = 60 * 60_000;
/** Un résultat distant plus gros que cela est refusé. */
const MAX_OUTPUT_BYTES = 200 * 1024 * 1024;
const FAILURE_MESSAGE =
  'La création n’a pas abouti. Vos crédits ont été restitués.';

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

export function kindOf(
  preset: Pick<Preset, 'type'>,
  product: Pick<GenerationProduct, 'billingUnit'>,
): CreationKind {
  if (preset.type === 'MOTION') return 'fun';
  return product.billingUnit === 'IMAGE' ? 'affiche' : 'pub';
}

function pricingOf(p: GenerationProduct): ProductPricing {
  return {
    code: p.code,
    billingUnit: p.billingUnit,
    creditsPerUnit: p.creditsPerUnit,
    providerCostUsdPerUnit: Number(p.providerCostUsdPerUnit),
    billableMultiplier: p.billableMultiplier,
    minSeconds: p.minSeconds,
    maxSeconds: p.maxSeconds,
    active: p.active,
  };
}

/** Durée facturée d'un style vidéo : celle du produit, bornée par ses limites. */
function videoSeconds(p: GenerationProduct): number {
  let s = DEFAULT_VIDEO_SECONDS;
  if (p.minSeconds !== null) s = Math.max(s, p.minSeconds);
  if (p.maxSeconds !== null) s = Math.min(s, p.maxSeconds);
  return s;
}

function quoteOf(p: GenerationProduct) {
  return quoteCredits(
    pricingOf(p),
    p.billingUnit === 'SECOND' ? videoSeconds(p) : undefined,
  );
}

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

  // ───────────── Styles ─────────────

  async listStyles(kind?: CreationKind): Promise<StyleView[]> {
    const presets = await this.prisma.preset.findMany({
      where: { visible: true, product: { active: true } },
      include: {
        product: true,
        media: { where: { role: 'PRESET_THUMBNAIL' } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return presets
      .map((p): StyleView => {
        const quote = quoteOf(p.product);
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          category: p.category,
          featured: p.featured,
          kind: kindOf(p, p.product),
          credits: quote.credits,
          seconds: quote.billableSeconds,
          thumbnailUrl: p.media.some((m) => !m.purgedAt)
            ? `/v1/creations/styles/${p.id}/thumbnail`
            : null,
        };
      })
      .filter((s) => !kind || s.kind === kind);
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
        message: 'Yamboka est en maintenance. Réessayez un peu plus tard.',
      });
    }
    if (!file || file.size === 0) {
      throw new BadRequestException({
        code: 'PHOTO_REQUIRED',
        message: 'Ajoutez une photo.',
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

    const preset = await this.resolvePreset(input);
    const quote = quoteOf(preset.product);
    if (input.kind !== 'fun' && !input.prompt) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Données invalides.',
        details: [{ field: 'prompt', message: 'Décrivez ce que vous souhaitez.' }],
      });
    }

    const limit = await this.concurrencyLimit();
    const running = await this.prisma.generation.count({
      where: { userId, status: { in: [...RUNNING] }, deletedAt: null },
    });
    if (running >= limit) {
      throw new HttpException(
        {
          code: 'TOO_MANY_RUNNING',
          message: `Vous avez déjà ${running} création${running > 1 ? 's' : ''} en cours. Attendez qu’une d’elles se termine.`,
        },
        429,
      );
    }

    const options: CreationOptions = {
      // Une tendance suit le format de sa vidéo de référence : le choix de format ne s'applique pas.
      format: input.kind === 'fun' ? '9:16' : input.format,
      ...(input.prompt ? { prompt: input.prompt } : {}),
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
            productId: preset.productId,
            presetId: preset.id,
            creditsCost: quote.credits,
            billableSeconds: quote.billableSeconds,
            prompt: this.composePrompt(preset, options),
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
        await this.credits.reserve(tx, {
          userId,
          generationId,
          amount: quote.credits,
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

  /**
   * Style utilisé : celui demandé, ou, pour une affiche ou une pub, le premier style publié du type (le coût en
   * dépend). Une tendance (fun) exige un style explicite.
   */
  private async resolvePreset(input: CreateCreationInput) {
    const bad = (message: string) =>
      new BadRequestException({ code: 'STYLE_UNAVAILABLE', message });
    const candidates = await this.prisma.preset.findMany({
      where: {
        visible: true,
        product: { active: true },
        ...(input.styleId ? { id: input.styleId } : {}),
      },
      include: { product: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const matching = candidates.filter(
      (p) => kindOf(p, p.product) === input.kind,
    );
    if (input.styleId) {
      if (!matching[0]) throw bad('Ce style n’est pas disponible.');
      return matching[0];
    }
    if (input.kind === 'fun') throw bad('Choisissez une tendance.');
    if (!matching[0]) throw bad('Ce type de création n’est pas disponible pour le moment.');
    return matching[0];
  }

  private composePrompt(preset: Preset, o: CreationOptions): string | null {
    const parts = [preset.defaultPrompt, o.prompt].filter(Boolean);
    return parts.length ? parts.join('. ') : null;
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
    const isVideo = g.product.billingUnit === 'SECOND';
    const kind: CreationKind = g.preset
      ? kindOf(g.preset, g.product)
      : isVideo
        ? 'pub'
        : 'affiche';
    const output = g.media.find(
      (m) => m.role === 'OUTPUT_VIDEO' || m.role === 'OUTPUT_IMAGE',
    );
    const input = g.media.find((m) => m.role === 'INPUT_IMAGE');
    const ready = g.status === 'COMPLETED' && !!output && !output.purgedAt;
    const failed = g.status === 'FAILED' || g.status === 'CANCELLED';
    const base = `/v1/creations/${g.id}`;
    const posterOk = isVideo ? !!input && !input.purgedAt : ready;
    return {
      id: g.id,
      kind,
      styleName: g.preset?.name ?? 'Création',
      status: statusOf(g.status),
      styleId: g.presetId,
      prompt: promptOf(options),
      credits: g.creditsCost,
      refunded: failed,
      errorMessage: failed ? FAILURE_MESSAGE : null,
      options,
      createdAt: g.createdAt.toISOString(),
      completedAt: g.completedAt?.toISOString() ?? null,
      expiresAt: g.outputExpiresAt?.toISOString() ?? null,
      isVideo,
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
    const isVideo = g.product.billingUnit === 'SECOND';
    const wanted: MediaFile | undefined =
      variant === 'thumb' && isVideo
        ? g.media.find((m) => m.role === 'INPUT_IMAGE')
        : g.media.find(
            (m) => m.role === 'OUTPUT_VIDEO' || m.role === 'OUTPUT_IMAGE',
          );
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
          .cancel(g.providerStatusUrl.replace('status', 'cancel'))
          .catch(() => undefined);
      }
      await this.fail(g, 'Délai dépassé.');
      return;
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
        await this.fail(g as GenerationRow, e.message);
        return;
      }
      throw e;
    }
  }

  private async submit(g: GenerationRow): Promise<void> {
    const inputMedia = g.media.find((m) => m.role === 'INPUT_IMAGE');
    if (!inputMedia) return this.fail(g, 'Photo introuvable.');
    const options = (g.options as unknown as CreationOptions | null) ?? {
      format: '9:16',
    };
    const imageUrl = await this.provider.uploadInput(
      await this.storage.get(inputMedia.key),
      inputMedia.mimeType,
    );

    // Paramètres : seul le transfert de mouvement (genjutsu) est documenté dans ce dépôt ; les autres styles
    // envoient image + texte + format, à confirmer avec la documentation du modèle avant tout usage réel.
    const input: Record<string, unknown> = { image_urls: [imageUrl] };
    if (g.product.resolution) input.resolution = g.product.resolution;
    if (g.preset?.type === 'MOTION') {
      const example = g.preset.media.find(
        (m) => m.role === 'PRESET_EXAMPLE_VIDEO' && !m.purgedAt,
      );
      if (example) {
        input.video_url = await this.provider.uploadInput(
          await this.storage.get(example.key),
          example.mimeType,
        );
      } else if (this.provider.name !== 'mock') {
        return this.fail(g, 'Ce style n’a pas de vidéo de référence.');
      }
    } else {
      input.prompt = g.prompt ?? '';
      input.aspect_ratio = options.format;
    }

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
      await this.fail(g, result.error ?? result.status);
    } else if (result.status === 'processing' && g.status === 'SUBMITTED') {
      await this.prisma.generation.updateMany({
        where: { id: g.id, status: 'SUBMITTED' },
        data: { status: 'PROCESSING' },
      });
    }
  }

  private async complete(g: GenerationRow, outputUrl?: string): Promise<void> {
    if (!outputUrl) return this.fail(g, 'Résultat manquant.');
    const isVideo = g.product.billingUnit === 'SECOND';
    const { body, mime } = await this.fetchOutput(g, outputUrl, isVideo);
    const ext =
      mime === 'video/mp4'
        ? 'mp4'
        : mime === 'image/png'
          ? 'png'
          : mime === 'image/webp'
            ? 'webp'
            : 'jpg';
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
          role: isVideo ? 'OUTPUT_VIDEO' : 'OUTPUT_IMAGE',
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
        body: `« ${g.preset?.name ?? 'Création'} » est prête dans Mes créations.`,
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

  private async fetchOutput(
    g: GenerationRow,
    url: string,
    isVideo: boolean,
  ): Promise<{ body: Buffer; mime: string }> {
    if (url.startsWith('mock://')) {
      if (isVideo) {
        return {
          body: await readFile(join(process.cwd(), 'assets', 'mock-output.mp4')),
          mime: 'video/mp4',
        };
      }
      const input = g.media.find((m) => m.role === 'INPUT_IMAGE');
      if (!input) throw new GenerationRejectedError('Photo introuvable.');
      return { body: await this.storage.get(input.key), mime: input.mimeType };
    }
    if (!url.startsWith('https://')) {
      throw new GenerationRejectedError('Adresse de résultat refusée.');
    }
    let res: Response;
    try {
      res = await fetch(url);
    } catch (e) {
      throw new GenerationUnavailableError(
        `Téléchargement impossible : ${String(e)}`,
      );
    }
    if (!res.ok) {
      throw new GenerationUnavailableError(`Téléchargement : HTTP ${res.status}`);
    }
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length > MAX_OUTPUT_BYTES) {
      throw new GenerationRejectedError('Résultat trop volumineux.');
    }
    const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    if (
      !['video/mp4', 'image/png', 'image/jpeg', 'image/webp'].includes(mime)
    ) {
      throw new GenerationRejectedError(`Type de résultat inattendu : ${mime}`);
    }
    return { body, mime };
  }

  /** Échec : les crédits réservés sont restitués (RELEASE, une seule fois) puis la création est marquée échouée. */
  private async fail(g: GenerationRow, reason: string): Promise<void> {
    this.logger.warn(`Création ${g.id} échouée : ${reason}`);
    await this.credits.release(g.id);
    const noteIds: (string | null)[] = [];
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.generation.updateMany({
        where: { id: g.id, status: { in: [...RUNNING] } },
        data: {
          status: 'FAILED',
          errorMessage: reason,
          completedAt: new Date(),
        },
      });
      if (claimed.count === 0) return;
      const failed = await this.notifications.notify(tx, {
        userId: g.userId,
        type: 'GENERATION_FAILED',
        title: 'Création échouée',
        body: `« ${g.preset?.name ?? 'Création'} » n’a pas abouti.`,
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
  }
}
