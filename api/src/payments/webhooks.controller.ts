import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { Public } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PaymentsService } from './payments.service';

const callbackSchema = z.object({
  reference: z.string().trim().min(1).max(200),
});

/**
 * Réception des callbacks du fournisseur de paiement. Un callback n'est JAMAIS cru : il ne fait que déclencher
 * une vérification du statut réel auprès du fournisseur. La réponse est toujours la même, que la référence
 * existe ou non (RG-04). Un vrai agrégateur imposera son propre format ; il sera branché ici à ce moment-là.
 */
@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Throttle({ global: { limit: 120, ttl: 60_000 } })
  @HttpCode(200)
  @Post('payment')
  @ApiOperation({
    summary:
      'Callback de paiement : déclenche la vérification, ne crédite jamais directement',
  })
  async payment(
    @Body(new ZodPipe(callbackSchema)) body: { reference: string },
  ): Promise<{ received: true }> {
    await this.payments.handleCallback(body.reference);
    return { received: true };
  }
}
