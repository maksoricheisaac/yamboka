import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  ChangePasswordInput,
  DeleteAccountInput,
  SessionUser,
  UpdateProfileInput,
} from '@yamboka/shared';
import { PasswordService } from '../auth/password.service';
import { SessionService } from '../auth/session.service';
import { CreditsService } from '../credits/credits.service';
import { LegalService } from '../legal/legal.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly credits: CreditsService,
    private readonly legal: LegalService,
  ) {}

  async toSessionUser(userId: string): Promise<SessionUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { oauthAccounts: { select: { provider: true } } },
    });
    const [credits, creditValueFcfa, legalAccepted] = await Promise.all([
      this.credits.getBalance(userId),
      this.credits.creditValue(),
      this.legal.hasAcceptedRequired(userId),
    ]);
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerifiedAt !== null,
      legalAccepted,
      hasPassword: user.passwordHash !== null,
      googleLinked: user.oauthAccounts.some((a) => a.provider === 'google'),
      credits,
      creditValueFcfa,
    };
  }

  /** Seuls prénom, nom et téléphone sont modifiables : le rôle et le statut ne passent jamais par ici. */
  async updateProfile(
    userId: string,
    input: UpdateProfileInput,
  ): Promise<SessionUser> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
      },
    });
    return this.toSessionUser(userId);
  }

  async changePassword(
    userId: string,
    sessionId: string,
    input: ChangePasswordInput,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!user.passwordHash) {
      throw new BadRequestException({
        code: 'NO_PASSWORD',
        message:
          'Ce compte n’a pas de mot de passe. Utilisez « Mot de passe oublié » pour en définir un.',
      });
    }
    if (
      !(await this.passwords.verify(user.passwordHash, input.currentPassword))
    ) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Le mot de passe actuel est incorrect.',
      });
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.passwords.hash(input.newPassword) },
    });
    // Les autres appareils sont déconnectés ; la session courante est conservée.
    await this.sessions.revokeAll(userId, sessionId);
  }

  async acceptLegal(userId: string, ip?: string): Promise<SessionUser> {
    await this.legal.recordAcceptance(this.prisma, userId, ip);
    return this.toSessionUser(userId);
  }

  /**
   * Suppression de compte (UF-62). Le registre de crédits et les traces légales sont conservés (RG-34) :
   * les données personnelles sont effacées et le compte est anonymisé plutôt que supprimé.
   */
  async deleteAccount(
    userId: string,
    input: DeleteAccountInput,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (user.passwordHash) {
      if (
        !input.password ||
        !(await this.passwords.verify(user.passwordHash, input.password))
      ) {
        throw new UnauthorizedException({
          code: 'INVALID_CREDENTIALS',
          message: 'Mot de passe incorrect.',
        });
      }
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          email: `supprime+${userId}@yamboka.invalid`,
          firstName: 'Compte',
          lastName: 'supprimé',
          phone: null,
          avatarUrl: null,
          passwordHash: null,
          deletedAt: new Date(),
        },
      }),
      this.prisma.oAuthAccount.deleteMany({ where: { userId } }),
      this.prisma.emailToken.deleteMany({ where: { userId } }),
      this.prisma.notification.deleteMany({ where: { userId } }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }
}
