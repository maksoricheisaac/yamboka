import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ActivitySummary, BalanceView, LedgerPage } from '@yamboka/shared';
import { LEDGER_FILTERS, pageQuerySchema } from '@yamboka/shared';
import { z } from 'zod';
import { CurrentUser } from '../common/decorators';
import type { AuthUser } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { CreditsService } from './credits.service';

const pageQuery = pageQuerySchema.extend({
  filter: z.enum(LEDGER_FILTERS).default('all'),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
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

  @Get('summary')
  @ApiOperation({
    summary:
      'Activité des 30 derniers jours (créations, crédits dépensés et achetés)',
  })
  summary(@CurrentUser() user: AuthUser): Promise<ActivitySummary> {
    return this.credits.activitySummary(user.id);
  }

  @Get('ledger')
  @ApiOperation({
    summary:
      'Historique de mes mouvements de crédits, du plus récent au plus ancien (filtrable par famille d’opérations)',
  })
  async ledger(
    @CurrentUser() user: AuthUser,
    @Query(new ZodPipe(pageQuery)) query: PageQuery,
  ): Promise<LedgerPage> {
    const page = await this.credits.listLedger(user.id, {
      ...query,
      from: query.from ? new Date(`${query.from}T00:00:00.000Z`) : undefined,
      // Bornes incluses : « jusqu'au » couvre toute la journée choisie.
      to: query.to
        ? new Date(new Date(`${query.to}T00:00:00.000Z`).getTime() + 86_400_000)
        : undefined,
    });
    return {
      ...page,
      items: page.items.map((i) => ({
        ...i,
        type: i.type as LedgerPage['items'][number]['type'],
        expiresAt: i.expiresAt?.toISOString() ?? null,
        createdAt: i.createdAt.toISOString(),
      })),
    };
  }
}
