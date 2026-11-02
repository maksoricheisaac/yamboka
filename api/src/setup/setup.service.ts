import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  SetupAdminInput,
  SetupCheckItem,
  SetupDiagnostic,
  SetupStatus,
  SetupSummary,
} from '@yamboka/shared';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { SessionContext, SessionService } from '../auth/session.service';
import { safeEqual, sha256 } from '../auth/tokens';
import type { Env } from '../config/env';
import { EmailService } from '../email/email.service';
import { LegalService } from '../legal/legal.service';
import { PrismaService } from '../prisma/prisma.service';
import { SETTING_DEFAULTS } from '../settings/settings.service';
import { seedBaseData } from './base-data';

/** Identifiant du verrou consultatif PostgreSQL qui sérialise les tentatives d'initialisation. */
const SETUP_LOCK_ID = 7_311_001;

/**
 * Assistant de configuration initiale. Utilisable UNE seule fois :
 *  - l'état « installé » est persistant en base (table InstallState, ligne unique) : il survit aux redémarrages,
 *    aux redéploiements et à la restauration d'une sauvegarde ;
 *  - la création est atomique (transaction + verrou consultatif + clé primaire unique) : deux requêtes simultanées
 *    ne peuvent pas créer deux administrateurs initiaux ;
 *  - l'accès exige SETUP_SECRET, comparé en temps constant ;
 *  - aucune route ne permet de réinitialiser l'installation.
 */
@Injectable()
export class SetupService {
  private readonly logger = new Logger(SetupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly email: EmailService,
    private readonly legal: LegalService,
    private readonly audit: AuditService,
  ) {}

  private get secret(): string | undefined {
    return this.config.get('SETUP_SECRET', { infer: true });
  }

  /** Installé = ligne d'état présente, OU un administrateur existe déjà (installation antérieure : on la verrouille). */
  async isInitialized(): Promise<boolean> {
    if (await this.prisma.installState.findUnique({ where: { id: 1 } }))
      return true;
    const admin = await this.prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true },
    });
    if (!admin) return false;
    await this.prisma.installState.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, adminUserId: admin.id },
    });
    return true;
  }

  async status(): Promise<SetupStatus> {
    return {
      initialized: await this.isInitialized(),
      secretConfigured: Boolean(this.secret),
    };
  }

  /** Refuse tout accès si l'installation est faite, si le secret n'est pas configuré ou s'il est faux. */
  async authorize(provided: string | undefined): Promise<void> {
    if (await this.isInitialized()) {
      throw new ForbiddenException({
        code: 'SETUP_LOCKED',
        message:
          'La plateforme est déjà initialisée : l’assistant est verrouillé.',
      });
    }
    const expected = this.secret;
    if (!expected) {
      throw new ServiceUnavailableException({
        code: 'SETUP_NOT_CONFIGURED',
        message:
          'L’assistant est indisponible : définissez la variable SETUP_SECRET sur le serveur (au moins 24 caractères) puis redémarrez.',
      });
    }
    // Hachage préalable : comparaison en temps constant quelles que soient les longueurs.
    if (!provided || !safeEqual(sha256(provided), sha256(expected))) {
      throw new UnauthorizedException({
        code: 'SETUP_SECRET_INVALID',
        message: 'Secret d’installation incorrect.',
      });
    }
  }

  /** Étape 1 : diagnostic compréhensible, sans identifiant de base de données ni secret. */
  async diagnose(): Promise<SetupDiagnostic> {
    const items: SetupCheckItem[] = [];

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      items.push({
        key: 'database',
        label: 'Base de données',
        state: 'ok',
        detail: 'Connexion établie, migrations appliquées.',
      });
    } catch {
      items.push({
        key: 'database',
        label: 'Base de données',
        state: 'error',
        detail:
          'Connexion impossible. Vérifiez DATABASE_URL et le serveur PostgreSQL.',
      });
    }

    items.push({
      key: 'install',
      label: 'État de l’installation',
      state: 'ok',
      detail: 'Plateforme non initialisée : aucun administrateur.',
    });

    const mail = await this.email.diagnose();
    items.push({
      key: 'email',
      label: 'E-mails',
      // Non bloquant : l'administrateur est créé avec une adresse déjà vérifiée. Mais sans e-mail, les clients ne pourront pas valider leur adresse.
      state: mail.ok ? 'ok' : 'warning',
      detail: mail.detail,
    });

    items.push({
      key: 'providers',
      label: 'Fournisseurs',
      state: 'warning',
      detail:
        'Paiement et génération en mode simulation (aucun fournisseur réel branché). Normal en phase 1.',
    });

    const sessionOk =
      (this.config.get('SESSION_SECRET', { infer: true }) ?? '').length >= 32;
    items.push({
      key: 'secrets',
      label: 'Secrets du serveur',
      state: sessionOk ? 'ok' : 'error',
      detail: sessionOk
        ? 'Secret de session défini.'
        : 'SESSION_SECRET est trop court.',
    });

    return { items, canContinue: items.every((i) => i.state !== 'error') };
  }

  /** Étapes 2 à 4 : crée l'administrateur, les données de base et verrouille, dans UNE transaction. */
  async complete(
    input: SetupAdminInput,
    ctx: SessionContext,
  ): Promise<{
    userId: string;
    session: { token: string; expiresAt: Date };
    summary: SetupSummary;
  }> {
    const passwordHash = await this.passwords.hash(input.password);

    const { userId, baseData } = await this.prisma.$transaction(
      async (tx) => {
        // Sérialise les tentatives simultanées : la seconde attend, puis voit l'état « installé ».
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SETUP_LOCK_ID})`;
        const locked = () =>
          new ForbiddenException({
            code: 'SETUP_LOCKED',
            message:
              'La plateforme est déjà initialisée : l’assistant est verrouillé.',
          });
        if (await tx.installState.findUnique({ where: { id: 1 } }))
          throw locked();
        if (
          await tx.user.findFirst({
            where: { role: 'ADMIN' },
            select: { id: true },
          })
        )
          throw locked();

        const baseData = await seedBaseData(tx);

        const existing = await tx.user.findUnique({
          where: { email: input.email },
        });
        if (existing) {
          // Un compte client portant cette adresse existe : on ne l'élève pas silencieusement.
          throw new ForbiddenException({
            code: 'EMAIL_TAKEN',
            message:
              'Cette adresse est déjà utilisée par un compte. Choisissez-en une autre.',
          });
        }
        const admin = await tx.user.create({
          data: {
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
            passwordHash,
            role: 'ADMIN',
            // L'administrateur est le propriétaire qui détient SETUP_SECRET : adresse considérée comme vérifiée.
            emailVerifiedAt: new Date(),
            signupIp: ctx.ip,
          },
        });
        await this.legal.recordAcceptance(tx, admin.id, ctx.ip);
        await tx.installState.create({
          data: { id: 1, adminUserId: admin.id },
        });
        await this.audit.log(
          {
            actorId: admin.id,
            action: 'setup.completed',
            entityType: 'Installation',
            after: { adminEmail: admin.email },
            reason: 'Initialisation de la plateforme',
            ip: ctx.ip,
          },
          tx,
        );
        return { userId: admin.id, baseData };
      },
      { timeout: 30_000, maxWait: 30_000 },
    );

    this.logger.log('Plateforme initialisée : premier administrateur créé.');
    const session = await this.sessions.create(userId, ctx);
    const mail = await this.email.diagnose();
    return {
      userId,
      session,
      summary: {
        adminEmail: input.email,
        baseData,
        email: mail,
      },
    };
  }

  /** Utilisé par les tests : valeurs par défaut des paramètres essentiels. */
  get essentialSettingKeys(): string[] {
    return Object.keys(SETTING_DEFAULTS);
  }
}
