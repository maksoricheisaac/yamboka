import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class CreditsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Le solde est toujours la somme du registre (RG-02) : il n'existe aucun champ « solde ». */
  async getBalance(userId: string, db: Db = this.prisma): Promise<number> {
    const { _sum } = await db.creditLedger.aggregate({
      where: { userId },
      _sum: { amount: true },
    });
    return _sum.amount ?? 0;
  }

  /**
   * Crédits de bienvenue, une seule fois par compte : la référence `welcome:<userId>` est unique,
   * donc un second appel (ou un appel concurrent) n'a aucun effet. Retourne vrai si les crédits ont été ajoutés.
   */
  async grantWelcome(
    db: Db,
    userId: string,
    amount: number,
    expiresAt: Date,
  ): Promise<boolean> {
    if (amount <= 0) return false;
    const result = await db.creditLedger.createMany({
      data: [
        {
          userId,
          amount,
          type: 'WELCOME',
          reference: `welcome:${userId}`,
          expiresAt,
          note: 'Crédits de bienvenue',
        },
      ],
      skipDuplicates: true,
    });
    return result.count === 1;
  }
}
