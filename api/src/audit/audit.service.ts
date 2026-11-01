import { Global, Injectable, Module } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  reason?: string;
  ip?: string;
}

/**
 * Journal d'audit des opérations sensibles. On passe le client de transaction pour que la trace soit écrite
 * ATOMIQUEMENT avec l'opération : pas de modification sans trace, pas de trace sans modification.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(entry: AuditEntry, db: Db = this.prisma) {
    return db.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before,
        after: entry.after,
        reason: entry.reason,
        ip: entry.ip,
      },
    });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
