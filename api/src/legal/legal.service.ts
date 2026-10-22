import { Injectable } from '@nestjs/common';
import { LegalDocType, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

/** Textes qui doivent être acceptés à l'inscription (la politique de confidentialité est informative). */
const ACCEPTED_TYPES: LegalDocType[] = ['CGU', 'CHARTE'];

@Injectable()
export class LegalService {
  constructor(private readonly prisma: PrismaService) {}

  /** Dernière version publiée de chaque texte à accepter. */
  async latestDocuments(db: Db = this.prisma) {
    const docs = await Promise.all(
      ACCEPTED_TYPES.map((type) =>
        db.legalDocument.findFirst({
          where: { type },
          orderBy: { version: 'desc' },
        }),
      ),
    );
    return docs.filter((d): d is NonNullable<typeof d> => d !== null);
  }

  /** Enregistre l'acceptation horodatée des dernières versions (idempotent). */
  async recordAcceptance(db: Db, userId: string, ip?: string): Promise<void> {
    const docs = await this.latestDocuments(db);
    await db.legalAcceptance.createMany({
      data: docs.map((d) => ({ userId, documentId: d.id, ip })),
      skipDuplicates: true,
    });
  }

  /**
   * Vrai si l'utilisateur a accepté, pour chaque texte, au moins la dernière version majeure :
   * une nouvelle version majeure impose une nouvelle acceptation (AD-62).
   */
  async hasAcceptedRequired(userId: string): Promise<boolean> {
    for (const type of ACCEPTED_TYPES) {
      const required = await this.prisma.legalDocument.findFirst({
        where: { type, major: true },
        orderBy: { version: 'desc' },
      });
      if (!required) continue;
      const accepted = await this.prisma.legalAcceptance.findFirst({
        where: {
          userId,
          document: { type, version: { gte: required.version } },
        },
      });
      if (!accepted) return false;
    }
    return true;
  }
}
