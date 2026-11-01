import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt } from 'node:crypto';
import type { Env } from '../config/env';
import { EmailService } from '../email/email.service';
import type { OtpPurpose } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { safeEqual } from './tokens';

const HOUR = 3600 * 1000;

export interface OtpIssued {
  /** Délai avant de pouvoir demander un nouveau code, pour le compte à rebours de l'interface. */
  resendInSeconds: number;
  expiresInMinutes: number;
}

/**
 * Codes à usage unique envoyés par e-mail.
 * - Générés par `crypto.randomInt` (CSPRNG), jamais stockés en clair : seul un HMAC lié à l'objectif et à l'adresse l'est.
 * - Un nouveau code invalide les précédents ; un code ne sert qu'une fois (réclamation atomique).
 * - Chaque vérification consomme une tentative AVANT la comparaison, de façon atomique : des requêtes parallèles
 *   ne permettent pas de dépasser le plafond.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly length: number;
  private readonly ttlMinutes: number;
  private readonly maxAttempts: number;
  private readonly cooldownSeconds: number;
  private readonly maxPerHour: number;
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    config: ConfigService<Env, true>,
  ) {
    this.length = config.get('EMAIL_OTP_LENGTH', { infer: true });
    this.ttlMinutes = config.get('EMAIL_OTP_TTL_MINUTES', { infer: true });
    this.maxAttempts = config.get('EMAIL_OTP_MAX_ATTEMPTS', { infer: true });
    this.cooldownSeconds = config.get('EMAIL_OTP_RESEND_COOLDOWN_SECONDS', {
      infer: true,
    });
    this.maxPerHour = config.get('EMAIL_OTP_MAX_SENDS_PER_HOUR', {
      infer: true,
    });
    this.secret = config.get('SESSION_SECRET', { infer: true });
  }

  private hash(purpose: OtpPurpose, email: string, code: string): string {
    return createHmac('sha256', this.secret)
      .update(`otp:${purpose}:${email}:${code}`)
      .digest('hex');
  }

  private generate(): string {
    return randomInt(0, 10 ** this.length)
      .toString()
      .padStart(this.length, '0');
  }

  /** Crée et envoie un code. Lève si le plafond est atteint ou si l'e-mail n'a pas pu partir (rien n'est alors « envoyé »). */
  async issue(
    email: string,
    purpose: OtpPurpose,
    user: { id: string; firstName: string } | null,
  ): Promise<OtpIssued> {
    const now = Date.now();
    const last = await this.prisma.emailOtp.findFirst({
      where: { email, purpose },
      orderBy: { createdAt: 'desc' },
    });
    if (last) {
      const wait =
        this.cooldownSeconds -
        Math.floor((now - last.createdAt.getTime()) / 1000);
      if (wait > 0) {
        throw new HttpException(
          {
            code: 'OTP_COOLDOWN',
            message: `Patientez ${wait} seconde${wait > 1 ? 's' : ''} avant de redemander un code.`,
            details: { retryAfterSeconds: wait },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    const recent = await this.prisma.emailOtp.count({
      where: { email, purpose, createdAt: { gte: new Date(now - HOUR) } },
    });
    if (recent >= this.maxPerHour) {
      throw new HttpException(
        {
          code: 'OTP_RATE_LIMIT',
          message: 'Trop de codes demandés. Réessayez dans une heure.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = this.generate();
    const row = await this.prisma.$transaction(async (tx) => {
      // Un nouveau code invalide les précédents.
      await tx.emailOtp.updateMany({
        where: { email, purpose, usedAt: null },
        data: { usedAt: new Date() },
      });
      return tx.emailOtp.create({
        data: {
          email,
          purpose,
          userId: user?.id,
          codeHash: this.hash(purpose, email, code),
          expiresAt: new Date(now + this.ttlMinutes * 60_000),
        },
      });
    });

    try {
      await this.email.sendOtp(
        email,
        user?.firstName ?? null,
        code,
        purpose,
        this.ttlMinutes,
      );
    } catch (e) {
      // Le code n'a pas pu partir : on l'invalide et on supprime la trace pour ne pas bloquer une nouvelle demande.
      await this.prisma.emailOtp
        .delete({ where: { id: row.id } })
        .catch(() => undefined);
      this.logger.error(
        `Envoi du code impossible (${purpose}) : ${e instanceof Error ? e.message : 'erreur'}`,
      );
      throw new ServiceUnavailableException({
        code: 'EMAIL_UNAVAILABLE',
        message:
          'Nous n’avons pas pu envoyer l’e-mail. Vérifiez l’adresse puis réessayez dans quelques instants.',
      });
    }
    return {
      resendInSeconds: this.cooldownSeconds,
      expiresInMinutes: this.ttlMinutes,
    };
  }

  /** Vérifie un code et le consomme. Lève une erreur explicite sinon. */
  async verify(
    email: string,
    purpose: OtpPurpose,
    code: string,
  ): Promise<{ userId: string | null }> {
    const invalid = () =>
      new BadRequestException({
        code: 'OTP_INVALID',
        message:
          'Code incorrect ou expiré. Vérifiez-le ou demandez-en un nouveau.',
      });

    const row = await this.prisma.emailOtp.findFirst({
      where: { email, purpose, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) throw invalid();
    if (row.expiresAt.getTime() <= Date.now()) {
      await this.prisma.emailOtp.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      throw new BadRequestException({
        code: 'OTP_EXPIRED',
        message: 'Ce code a expiré. Demandez-en un nouveau.',
      });
    }

    // Une tentative est consommée avant toute comparaison, de façon atomique.
    const reserved = await this.prisma.emailOtp.updateMany({
      where: { id: row.id, usedAt: null, attempts: { lt: this.maxAttempts } },
      data: { attempts: { increment: 1 } },
    });
    if (reserved.count !== 1) {
      await this.prisma.emailOtp.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      throw new HttpException(
        {
          code: 'OTP_TOO_MANY_ATTEMPTS',
          message: 'Trop de tentatives. Demandez un nouveau code.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (!safeEqual(this.hash(purpose, email, code), row.codeHash)) {
      const fresh = await this.prisma.emailOtp.findUnique({
        where: { id: row.id },
      });
      const left = this.maxAttempts - (fresh?.attempts ?? this.maxAttempts);
      if (left <= 0) {
        await this.prisma.emailOtp.updateMany({
          where: { id: row.id, usedAt: null },
          data: { usedAt: new Date() },
        });
      }
      throw new BadRequestException({
        code: 'OTP_INVALID',
        message:
          left > 0
            ? `Code incorrect. Il vous reste ${left} essai${left > 1 ? 's' : ''}.`
            : 'Code incorrect. Demandez un nouveau code.',
        details: { attemptsLeft: Math.max(left, 0) },
      });
    }

    // Réclamation : un seul appelant (même en parallèle) peut consommer le code.
    const claimed = await this.prisma.emailOtp.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw invalid();
    return { userId: row.userId };
  }

  /** Purge des codes périmés (tâche d'entretien). */
  async purgeExpired(now = new Date()): Promise<number> {
    const res = await this.prisma.emailOtp.deleteMany({
      where: { expiresAt: { lt: new Date(now.getTime() - HOUR) } },
    });
    return res.count;
  }
}
