import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  ForgotPasswordInput,
  LoginInput,
  LoginOtpInput,
  ResetPasswordInput,
  SignupInput,
} from '@yamboka/shared';
import { CreditsService } from '../credits/credits.service';
import { EmailService } from '../email/email.service';
import { EmailTokenType, Prisma, User } from '../generated/prisma/client';
import { LegalService } from '../legal/legal.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { isDisposableEmail } from './disposable-domains';
import type { GoogleProfile } from './google-oauth.client';
import { OtpIssued, OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { SessionContext, SessionService } from './session.service';
import { randomToken, sha256 } from './tokens';

const HOUR = 3600 * 1000;
const TOKEN_TTL: Record<EmailTokenType, number> = {
  VERIFY_EMAIL: 24 * HOUR, // hérité : la vérification passe par un code (OtpService)
  RESET_PASSWORD: 1 * HOUR,
};
/** Plafond d'envois d'e-mails par utilisateur et par type, sur une heure (UF-09). */
const MAX_EMAILS_PER_HOUR = 5;

export interface AuthResult {
  userId: string;
  session: { token: string; expiresAt: Date };
}

/** Connexion en deux temps : le mot de passe est correct, mais la session n'est ouverte qu'après le code reçu par e-mail. */
export interface LoginChallenge {
  otpRequired: true;
  email: string;
  otp: OtpIssued;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly email: EmailService,
    private readonly credits: CreditsService,
    private readonly settings: SettingsService,
    private readonly legal: LegalService,
    private readonly otp: OtpService,
  ) {}

  // ───────────── Inscription et connexion ─────────────

  async register(
    input: SignupInput,
    ctx: SessionContext,
  ): Promise<AuthResult & { emailSent: boolean }> {
    if (isDisposableEmail(input.email)) {
      throw new BadRequestException({
        code: 'DISPOSABLE_EMAIL',
        message:
          'Les adresses e-mail jetables ne sont pas acceptées. Utilisez votre adresse personnelle.',
      });
    }

    const passwordHash = await this.passwords.hash(input.password);
    let user: User;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
            phone: input.phone,
            passwordHash,
            signupIp: ctx.ip,
          },
        });
        await this.legal.recordAcceptance(tx, created.id, ctx.ip);
        return created;
      });
    } catch (e) {
      if (this.isUniqueViolation(e)) {
        throw new ConflictException({
          code: 'EMAIL_TAKEN',
          message:
            'Cette adresse e-mail est déjà utilisée. Connectez-vous ou réinitialisez votre mot de passe.',
        });
      }
      throw e;
    }

    // L'inscription réussit même si l'e-mail ne part pas : le compte existe et le code peut être redemandé.
    // On dit la vérité à l'interface (emailSent) au lieu de laisser croire qu'un message est parti.
    const emailSent = await this.otp
      .issue(user.email, 'VERIFY_EMAIL', user)
      .then(() => true)
      .catch((e: unknown) => {
        this.logger.warn(
          `Code d'inscription non envoyé : ${e instanceof HttpException ? String(e.getStatus()) : 'erreur'}`,
        );
        return false;
      });
    const session = await this.sessions.create(user.id, ctx);
    return { userId: user.id, session, emailSent };
  }

  /**
   * Étape 1 : vérifie le mot de passe. Selon le paramètre `loginOtpMode` (off | admin | all), la session s'ouvre
   * tout de suite ou seulement après confirmation par code (étape 2 : completeLoginOtp).
   */
  async login(
    input: LoginInput,
    ctx: SessionContext,
  ): Promise<AuthResult | LoginChallenge> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    const valid = await this.passwords.verify(
      user?.passwordHash,
      input.password,
    );
    // Même message et même durée que le compte existe ou non : pas de fuite d'information.
    if (!user || user.deletedAt || !valid) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'E-mail ou mot de passe incorrect.',
      });
    }
    this.assertActive(user);

    const mode = await this.settings.get('loginOtpMode');
    const required =
      mode === 'all' || (mode === 'admin' && user.role === 'ADMIN');
    if (required) {
      const otp = await this.otp.issue(user.email, 'LOGIN', user);
      return { otpRequired: true, email: user.email, otp };
    }
    const session = await this.sessions.create(user.id, ctx);
    return { userId: user.id, session };
  }

  /** Étape 2 : le code reçu par e-mail ouvre la session. Il est lié à l'adresse et à l'objectif « connexion ». */
  async completeLoginOtp(
    input: LoginOtpInput,
    ctx: SessionContext,
  ): Promise<AuthResult> {
    const { userId } = await this.otp.verify(input.email, 'LOGIN', input.code);
    const user = userId
      ? await this.prisma.user.findUnique({ where: { id: userId } })
      : null;
    if (!user || user.deletedAt) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Connexion impossible.',
      });
    }
    this.assertActive(user);
    const session = await this.sessions.create(user.id, ctx);
    return { userId: user.id, session };
  }

  // ───────────── Vérification de l'e-mail (code à usage unique) ─────────────

  async resendVerification(
    userId: string,
  ): Promise<
    { status: 'sent'; otp: OtpIssued } | { status: 'already_verified' }
  > {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (user.emailVerifiedAt) return { status: 'already_verified' };
    // Les erreurs (délai, plafond horaire, échec SMTP) remontent telles quelles à l'utilisateur.
    const otp = await this.otp.issue(user.email, 'VERIFY_EMAIL', user);
    return { status: 'sent', otp };
  }

  /**
   * Corrige une faute de frappe dans l'adresse d'inscription tant qu'elle n'est pas vérifiée : sans cela, la personne
   * resterait bloquée (le code part vers une adresse qui n'est pas la sienne). Un compte déjà vérifié ne passe pas par ici.
   */
  async changeUnverifiedEmail(
    userId: string,
    email: string,
  ): Promise<OtpIssued> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (user.emailVerifiedAt) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_VERIFIED',
        message: 'Votre adresse e-mail est déjà confirmée.',
      });
    }
    if (email !== user.email) {
      if (isDisposableEmail(email)) {
        throw new BadRequestException({
          code: 'DISPOSABLE_EMAIL',
          message:
            'Les adresses e-mail jetables ne sont pas acceptées. Utilisez votre adresse personnelle.',
        });
      }
      try {
        await this.prisma.user.update({
          where: { id: userId },
          data: { email },
        });
      } catch (e) {
        if (this.isUniqueViolation(e)) {
          throw new ConflictException({
            code: 'EMAIL_TAKEN',
            message: 'Cette adresse e-mail est déjà utilisée.',
          });
        }
        throw e;
      }
    }
    return this.otp.issue(email, 'VERIFY_EMAIL', {
      id: userId,
      firstName: user.firstName,
    });
  }

  async verifyEmail(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (user.emailVerifiedAt) return;
    await this.otp.verify(user.email, 'VERIFY_EMAIL', code);
    await this.prisma.$transaction((tx) => this.markEmailVerified(tx, userId));
  }

  /** Marque l'adresse comme vérifiée. Aucun crédit n'est offert à l'inscription : les crédits s'achètent. */
  private async markEmailVerified(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    await tx.user.updateMany({
      where: { id: userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
  }

  // ───────────── Mot de passe oublié ─────────────

  /** Répond toujours de la même façon, que l'adresse existe ou non. */
  async forgotPassword(input: ForgotPasswordInput): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (!user || user.deletedAt || user.status === 'BANNED') return;
    const token = await this.issueEmailToken(user.id, 'RESET_PASSWORD');
    if (!token) return;
    await this.email
      .sendPasswordReset(user.email, user.firstName, token)
      .catch((e: unknown) => {
        this.logger.error(
          `Envoi de l'e-mail de réinitialisation impossible : ${String(e)}`,
        );
      });
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const tokenHash = sha256(input.token);
    const passwordHash = await this.passwords.hash(input.password);
    const ok = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.emailToken.updateMany({
        where: {
          tokenHash,
          type: 'RESET_PASSWORD',
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) return false;
      const row = await tx.emailToken.findUniqueOrThrow({
        where: { tokenHash },
      });
      await tx.user.update({
        where: { id: row.userId },
        data: { passwordHash },
      });
      // Toutes les sessions sont invalidées après un changement de mot de passe.
      await tx.session.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return true;
    });
    if (!ok) throw this.invalidToken();
  }

  // ───────────── Google ─────────────

  async loginWithGoogle(
    profile: GoogleProfile,
    ctx: SessionContext,
  ): Promise<AuthResult> {
    // Seule une adresse vérifiée par Google est acceptée.
    if (!profile.emailVerified) {
      throw new ForbiddenException({
        code: 'GOOGLE_EMAIL_UNVERIFIED',
        message: 'L’adresse e-mail de votre compte Google n’est pas vérifiée.',
      });
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const linked = await tx.oAuthAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: 'google',
            providerAccountId: profile.sub,
          },
        },
        include: { user: true },
      });
      if (linked) return linked.user;

      const existing = await tx.user.findUnique({
        where: { email: profile.email },
      });
      if (existing) {
        if (existing.deletedAt) {
          throw new ForbiddenException({
            code: 'ACCOUNT_DELETED',
            message: 'Ce compte a été supprimé.',
          });
        }
        await tx.oAuthAccount.create({
          data: {
            userId: existing.id,
            provider: 'google',
            providerAccountId: profile.sub,
          },
        });
        // Un compte e-mail jamais vérifié a pu être créé par un tiers avec cette adresse :
        // son mot de passe n'est pas digne de confiance, on l'efface et on coupe ses sessions.
        if (!existing.emailVerifiedAt && existing.passwordHash) {
          await tx.user.update({
            where: { id: existing.id },
            data: { passwordHash: null },
          });
          await tx.session.updateMany({
            where: { userId: existing.id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        await this.markEmailVerified(tx, existing.id);
        return existing;
      }

      const created = await tx.user.create({
        data: {
          email: profile.email,
          firstName:
            profile.givenName ?? profile.name?.split(' ')[0] ?? 'Utilisateur',
          lastName:
            profile.familyName ??
            profile.name?.split(' ').slice(1).join(' ') ??
            '',
          avatarUrl: profile.picture,
          signupIp: ctx.ip,
          oauthAccounts: {
            create: { provider: 'google', providerAccountId: profile.sub },
          },
        },
      });
      await this.markEmailVerified(tx, created.id);
      return created;
    });

    this.assertActive(user);
    const session = await this.sessions.create(user.id, ctx);
    return { userId: user.id, session };
  }

  // ───────────── Utilitaires ─────────────

  assertActive(user: Pick<User, 'status'>): void {
    if (user.status === 'BANNED') {
      throw new ForbiddenException({
        code: 'ACCOUNT_BANNED',
        message: 'Ce compte a été banni.',
      });
    }
    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'Ce compte est suspendu temporairement.',
      });
    }
  }

  /** Crée un jeton à usage unique ; renvoie null si le plafond horaire d'envois est atteint. */
  private async issueEmailToken(
    userId: string,
    type: EmailTokenType,
  ): Promise<string | null> {
    const recent = await this.prisma.emailToken.count({
      where: { userId, type, createdAt: { gte: new Date(Date.now() - HOUR) } },
    });
    if (recent >= MAX_EMAILS_PER_HOUR) return null;

    const token = randomToken();
    await this.prisma.$transaction([
      // Un nouveau lien invalide les précédents.
      this.prisma.emailToken.updateMany({
        where: { userId, type, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.emailToken.create({
        data: {
          userId,
          type,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + TOKEN_TTL[type]),
        },
      }),
    ]);
    return token;
  }

  private invalidToken(): BadRequestException {
    return new BadRequestException({
      code: 'INVALID_TOKEN',
      message: 'Ce lien est invalide ou a expiré.',
    });
  }

  private isUniqueViolation(e: unknown): boolean {
    return (
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
    );
  }
}
