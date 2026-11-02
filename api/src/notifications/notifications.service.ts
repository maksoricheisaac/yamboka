import { Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_EMAIL_PREFS,
  EMAIL_PREF_KEYS,
  type EmailPrefKey,
  type EmailPrefs,
} from '@yamboka/shared';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { EmailService } from '../email/email.service';
import {
  generationEmail,
  purchaseEmail,
  accountNoticeEmail,
  type RenderedEmail,
} from '../email/templates';
import type { NotificationType, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

/** Événement → préférence d'e-mail. Un événement absent d'ici ne produit jamais d'e-mail. */
const PREF_BY_TYPE: Partial<Record<NotificationType, EmailPrefKey>> = {
  GENERATION_READY: 'generationReady',
  GENERATION_FAILED: 'generationFailed',
  PAYMENT_SUCCESS: 'paymentConfirmed',
  CREDITS_REFUNDED: 'creditsRefunded',
};

/** Nombre maximal d'envois par notification, puis on abandonne (l'erreur reste consignée). */
const MAX_ATTEMPTS = 5;
/** Délai entre deux essais : n × 2 minutes. */
const RETRY_STEP_MS = 120_000;
/** Une notification plus ancienne que cela n'est plus envoyée par e-mail. */
const EMAIL_WINDOW_MS = 24 * 3_600_000;

/** Préférences enregistrées, complétées par les valeurs par défaut (une préférence inconnue est ignorée). */
export function resolvePrefs(stored: unknown): EmailPrefs {
  const out = { ...DEFAULT_EMAIL_PREFS };
  if (stored && typeof stored === 'object') {
    for (const key of EMAIL_PREF_KEYS) {
      const v = (stored as Record<string, unknown>)[key];
      if (typeof v === 'boolean') out[key] = v;
    }
  }
  return out;
}

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  /** Identifie l'événement : le rejouer (webhook en double, tâche relancée) ne crée rien de plus. */
  dedupKey: string;
}

/**
 * Notifications. La notification dans l'application est toujours créée ; l'e-mail dépend de la préférence de
 * l'utilisateur ET de la vérification de son adresse. Création et envoi sont séparés : `notify` s'exécute dans la
 * transaction de l'événement (atomique avec lui), `dispatchEmail` après sa validation, de sorte qu'un e-mail en
 * panne ne peut jamais faire échouer une génération ou un paiement déjà terminés.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async getPrefs(userId: string, db: Db = this.prisma): Promise<EmailPrefs> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { emailPrefs: true },
    });
    return resolvePrefs(user?.emailPrefs);
  }

  /** Crée la notification (une seule fois par `dedupKey`). Renvoie son identifiant si elle vient d'être créée. */
  async notify(db: Db, n: NotifyInput): Promise<{ id: string | null }> {
    const user = await db.user.findUnique({
      where: { id: n.userId },
      select: { emailPrefs: true, emailVerifiedAt: true },
    });
    const prefKey = PREF_BY_TYPE[n.type];
    const wantsEmail =
      !!user?.emailVerifiedAt &&
      prefKey !== undefined &&
      resolvePrefs(user.emailPrefs)[prefKey];
    // skipDuplicates : un doublon est ignoré sans casser la transaction de l'appelant.
    const created = await db.notification.createMany({
      data: [
        {
          userId: n.userId,
          type: n.type,
          title: n.title,
          body: n.body,
          link: n.link ?? null,
          dedupKey: n.dedupKey,
          emailPending: wantsEmail,
        },
      ],
      skipDuplicates: true,
    });
    if (created.count === 0) return { id: null };
    const row = await db.notification.findUnique({
      where: { dedupKey: n.dedupKey },
      select: { id: true },
    });
    return { id: row?.id ?? null };
  }

  /** Envoie l'e-mail d'une notification, si elle en attend un. Ne lève jamais : l'échec est consigné pour reprise. */
  async dispatchEmail(notificationId: string | null): Promise<void> {
    if (!notificationId) return;
    try {
      const n = await this.prisma.notification.findUnique({
        where: { id: notificationId },
        include: { user: true },
      });
      if (!n || !n.emailPending || n.emailSentAt) return;

      // La préférence est relue au moment de l'envoi : désactivée entre-temps, l'e-mail ne part pas.
      const prefKey = PREF_BY_TYPE[n.type];
      const stillWanted =
        !!n.user.emailVerifiedAt &&
        prefKey !== undefined &&
        resolvePrefs(n.user.emailPrefs)[prefKey];
      if (!stillWanted) {
        await this.prisma.notification.update({
          where: { id: n.id },
          data: { emailPending: false },
        });
        return;
      }

      try {
        const mail = await this.render(n);
        if (!mail) {
          await this.prisma.notification.update({
            where: { id: n.id },
            data: { emailPending: false },
          });
          return;
        }
        await this.email.sendNotificationEmail(n.user.email, mail);
        await this.prisma.notification.update({
          where: { id: n.id },
          data: { emailSentAt: new Date(), emailPending: false, emailError: null },
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'erreur inconnue';
        const attempts = n.emailAttempts + 1;
        this.logger.warn(
          `E-mail de notification ${n.id} non envoyé (essai ${attempts}/${MAX_ATTEMPTS}) : ${message}`,
        );
        await this.prisma.notification.update({
          where: { id: n.id },
          data: {
            emailAttempts: attempts,
            emailError: message.slice(0, 300),
            emailPending: attempts < MAX_ATTEMPTS,
          },
        });
      }
    } catch (e) {
      this.logger.error(`Envoi d'e-mail ${notificationId} : ${String(e)}`);
    }
  }

  /** Reprise : renvoie les e-mails en attente, avec un délai croissant, dans les 24 heures. */
  async flushPendingEmails(now = new Date()): Promise<number> {
    const rows = await this.prisma.notification.findMany({
      where: {
        emailPending: true,
        emailSentAt: null,
        emailAttempts: { lt: MAX_ATTEMPTS },
        createdAt: { gt: new Date(now.getTime() - EMAIL_WINDOW_MS) },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    let sent = 0;
    for (const n of rows) {
      if (now.getTime() - n.createdAt.getTime() < n.emailAttempts * RETRY_STEP_MS)
        continue;
      await this.dispatchEmail(n.id);
      sent += 1;
    }
    return sent;
  }

  private appUrl(path: string | null): string {
    return `${this.config.get('APP_URL', { infer: true })}${path ?? '/app'}`;
  }

  private async render(n: {
    type: NotificationType;
    title: string;
    body: string;
    link: string | null;
    dedupKey: string | null;
    user: { firstName: string };
  }): Promise<RenderedEmail | null> {
    const url = this.appUrl(n.link);
    switch (n.type) {
      case 'GENERATION_READY':
        return generationEmail(n.user.firstName, { ok: true, url });
      case 'GENERATION_FAILED':
        return generationEmail(n.user.firstName, { ok: false, refunded: true, url });
      case 'CREDITS_REFUNDED':
        return accountNoticeEmail(n.user.firstName, n.title, n.body);
      case 'PAYMENT_SUCCESS': {
        const paymentId = n.dedupKey?.replace(/^payment-ok:/, '');
        const p = paymentId
          ? await this.prisma.payment.findUnique({
              where: { id: paymentId },
              include: { pack: true },
            })
          : null;
        if (!p) return accountNoticeEmail(n.user.firstName, n.title, n.body);
        return purchaseEmail(
          n.user.firstName,
          {
            packName: p.pack.name,
            credits: p.credits + p.bonusCredits,
            amountFcfa: p.amount,
            reference: p.id.slice(0, 8).toUpperCase(),
            paidAt: p.creditedAt ?? new Date(),
          },
          this.appUrl('/app/creer'),
        );
      }
      default:
        return null;
    }
  }
}
