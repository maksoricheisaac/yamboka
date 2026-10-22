import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { SESSION_COOKIE } from '@yamboka/shared';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { randomToken, sha256 } from './tokens';

export interface SessionContext {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get ttlMs(): number {
    return (
      this.config.get('SESSION_TTL_DAYS', { infer: true }) * 24 * 3600 * 1000
    );
  }

  /** Crée une session. Seul le hachage du jeton est stocké ; le jeton brut ne quitte pas le cookie. */
  async create(
    userId: string,
    ctx: SessionContext,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + this.ttlMs);
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: sha256(token),
        ip: ctx.ip,
        userAgent: ctx.userAgent?.slice(0, 300),
        expiresAt,
      },
    });
    return { token, expiresAt };
  }

  async findValid(token: string) {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date())
      return null;
    if (session.user.deletedAt) return null;
    return session;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Révoque toutes les sessions d'un utilisateur (changement de mot de passe, suppression de compte). */
  async revokeAll(userId: string, exceptSessionId?: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }

  private cookieBase() {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'lax' as const,
      path: '/',
      domain: this.config.get('COOKIE_DOMAIN', { infer: true }) || undefined,
    };
  }

  setCookie(res: Response, token: string, expiresAt: Date): void {
    res.cookie(SESSION_COOKIE, token, {
      ...this.cookieBase(),
      expires: expiresAt,
    });
  }

  clearCookie(res: Response): void {
    res.clearCookie(SESSION_COOKIE, this.cookieBase());
  }
}
