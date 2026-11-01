import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AdminReportRow,
  AdminUserDetail,
  AdminUserRow,
  CreditAdjustInput,
  ListQuery,
  Page,
  UserStatusActionInput,
} from '@yamboka/shared';
import { AuditService } from '../audit/audit.service';
import { CreditsService } from '../credits/credits.service';
import { EmailService } from '../email/email.service';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const TARGET_STATUS = {
  SUSPEND: 'SUSPENDED',
  BAN: 'BANNED',
  REACTIVATE: 'ACTIVE',
} as const;

const NOTICE: Record<keyof typeof TARGET_STATUS, [string, string]> = {
  SUSPEND: [
    'Votre compte est suspendu',
    'Votre compte Yamboka a été suspendu. Répondez à cet e-mail pour en savoir plus.',
  ],
  BAN: [
    'Votre compte a été fermé',
    'Votre compte Yamboka a été banni pour non-respect de la charte d’utilisation.',
  ],
  REACTIVATE: [
    'Votre compte est réactivé',
    'Votre compte Yamboka est de nouveau actif. Vous pouvez vous reconnecter.',
  ],
};

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  async list(q: ListQuery & { role?: string }): Promise<Page<AdminUserRow>> {
    const where: Prisma.UserWhereInput = {};
    if (q.q) {
      where.OR = [
        { email: { contains: q.q, mode: 'insensitive' } },
        { firstName: { contains: q.q, mode: 'insensitive' } },
        { lastName: { contains: q.q, mode: 'insensitive' } },
      ];
    }
    if (
      q.status === 'ACTIVE' ||
      q.status === 'SUSPENDED' ||
      q.status === 'BANNED'
    )
      where.status = q.status;
    if (q.role === 'ADMIN' || q.role === 'USER') where.role = q.role;

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    const balances = await this.prisma.creditLedger.groupBy({
      by: ['userId'],
      where: { userId: { in: users.map((u) => u.id) } },
      _sum: { amount: true },
    });
    const byUser = new Map(balances.map((b) => [b.userId, b._sum.amount ?? 0]));
    return {
      items: users.map((u) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        role: u.role,
        status: u.status,
        emailVerified: u.emailVerifiedAt !== null,
        credits: byUser.get(u.id) ?? 0,
        createdAt: u.createdAt.toISOString(),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async detail(id: string): Promise<AdminUserDetail> {
    const u = await this.prisma.user.findUnique({
      where: { id },
      include: {
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { pack: true },
        },
        generations: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { product: true },
        },
        ledger: { orderBy: { createdAt: 'desc' }, take: 30 },
        moderationTarget: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { actor: true },
        },
      },
    });
    if (!u)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Utilisateur introuvable.',
      });
    const credits = await this.credits.getBalance(id);
    return {
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      phone: u.phone,
      role: u.role,
      status: u.status,
      emailVerified: u.emailVerifiedAt !== null,
      deletedAt: u.deletedAt?.toISOString() ?? null,
      credits,
      createdAt: u.createdAt.toISOString(),
      payments: u.payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        credits: p.credits,
        status: p.status,
        operator: p.operator,
        createdAt: p.createdAt.toISOString(),
      })),
      generations: u.generations.map((g) => ({
        id: g.id,
        status: g.status,
        creditsCost: g.creditsCost,
        product: g.product.name,
        createdAt: g.createdAt.toISOString(),
      })),
      ledger: u.ledger.map((l) => ({
        id: l.id,
        type: l.type,
        amount: l.amount,
        note: l.note,
        createdAt: l.createdAt.toISOString(),
      })),
      moderation: u.moderationTarget.map((m) => ({
        id: m.id,
        action: m.action,
        reason: m.reason,
        actor: m.actor.email,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  /** Suspension, bannissement, réactivation : motif obligatoire, trace de modération et d'audit dans la même transaction. */
  async setStatus(
    adminId: string,
    userId: string,
    input: UserStatusActionInput,
    ip?: string,
  ): Promise<void> {
    if (adminId === userId) {
      throw new BadRequestException({
        code: 'SELF_ACTION',
        message: 'Vous ne pouvez pas modifier votre propre compte.',
      });
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Utilisateur introuvable.',
      });
    if (user.role === 'ADMIN') {
      throw new BadRequestException({
        code: 'ADMIN_PROTECTED',
        message: 'Retirez d’abord le rôle administrateur à ce compte.',
      });
    }
    const next = TARGET_STATUS[input.action];
    if (user.status === next) {
      throw new ConflictException({
        code: 'NO_CHANGE',
        message: 'Le compte est déjà dans cet état.',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { status: next } });
      if (next !== 'ACTIVE') {
        await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await tx.moderationAction.create({
        data: {
          targetUserId: userId,
          action: input.action === 'REACTIVATE' ? 'REACTIVATE' : input.action,
          reason: input.reason,
          actorId: adminId,
        },
      });
      await this.audit.log(
        {
          actorId: adminId,
          action: `user.${input.action.toLowerCase()}`,
          entityType: 'User',
          entityId: userId,
          before: { status: user.status },
          after: { status: next },
          reason: input.reason,
          ip,
        },
        tx,
      );
    });
    const [title, message] = NOTICE[input.action];
    await this.email.sendAccountNotice(
      user.email,
      user.firstName,
      title,
      message,
    );
  }

  async adjustCredits(
    adminId: string,
    userId: string,
    input: CreditAdjustInput,
    ip?: string,
  ): Promise<{ balance: number }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Utilisateur introuvable.',
      });
    const before = await this.credits.getBalance(userId);
    const result = await this.credits.adjust({
      userId,
      amount: input.amount,
      reason: input.reason,
      adminId,
      onCommit: (tx, reference) =>
        this.audit
          .log(
            {
              actorId: adminId,
              action: 'credits.adjust',
              entityType: 'User',
              entityId: userId,
              before: { balance: before },
              after: { balance: before + input.amount, reference },
              reason: input.reason,
              ip,
            },
            tx,
          )
          .then(() => undefined),
    });
    return { balance: result.balance };
  }

  // ───────────── Réclamations et signalements ─────────────

  async listReports(q: ListQuery): Promise<Page<AdminReportRow>> {
    const where: Prisma.ReportWhereInput = {};
    if (
      q.status &&
      ['NEW', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'].includes(q.status)
    )
      where.status = q.status as 'NEW';
    const [total, rows] = await Promise.all([
      this.prisma.report.count({ where }),
      this.prisma.report.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { reporter: true },
      }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        generationId: r.generationId,
        reason: r.reason,
        details: r.details,
        status: r.status,
        resolution: r.resolution,
        reporter: r.reporter?.email ?? r.reporterContact,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async handleReport(
    adminId: string,
    id: string,
    status: 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED',
    resolution: string,
    ip?: string,
  ): Promise<void> {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Signalement introuvable.',
      });
    await this.prisma.$transaction(async (tx) => {
      await tx.report.update({
        where: { id },
        data: {
          status,
          resolution,
          handledById: adminId,
          handledAt: new Date(),
        },
      });
      await this.audit.log(
        {
          actorId: adminId,
          action: 'report.handle',
          entityType: 'Report',
          entityId: id,
          before: { status: report.status },
          after: { status },
          reason: resolution,
          ip,
        },
        tx,
      );
    });
  }
}
