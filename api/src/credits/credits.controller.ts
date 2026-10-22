import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { BalanceView, LedgerPage } from '@yamboka/shared';
import { z } from 'zod';
import { CurrentUser } from '../common/decorators';
import type { AuthUser } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { CreditsService } from './credits.service';

const pageQuery = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
type PageQuery = z.infer<typeof pageQuery>;

@ApiTags('credits')
@Controller('credits')
export class CreditsController {
  constructor(private readonly credits: CreditsService) {}

  @Get('balance')
  @ApiOperation({ summary: 'Solde en crédits et valeur indicative en FCFA' })
  async balance(@CurrentUser() user: AuthUser): Promise<BalanceView> {
    const [credits, creditValueFcfa] = await Promise.all([
      this.credits.getBalance(user.id),
      this.credits.creditValue(),
    ]);
    return { credits, creditValueFcfa, valueFcfa: credits * creditValueFcfa };
  }

  @Get('ledger')
  @ApiOperation({
    summary:
      'Historique de mes mouvements de crédits, du plus récent au plus ancien',
  })
  async ledger(
    @CurrentUser() user: AuthUser,
    @Query(new ZodPipe(pageQuery)) query: PageQuery,
  ): Promise<LedgerPage> {
    const page = await this.credits.listLedger(user.id, query);
    return {
      nextCursor: page.nextCursor,
      items: page.items.map((i) => ({
        ...i,
        type: i.type as LedgerPage['items'][number]['type'],
        expiresAt: i.expiresAt?.toISOString() ?? null,
        createdAt: i.createdAt.toISOString(),
      })),
    };
  }
}
