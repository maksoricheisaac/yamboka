import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Logger,
  NotFoundException,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';
import { Public } from '../common/decorators';
import type { Env } from '../config/env';
import { ZodPipe } from '../common/zod.pipe';
import { PaymentsService } from './payments.service';
import {
  isTransactionEvent,
  saspayWebhookSchema,
  verifySaspayWebhook,
} from './saspay/saspay.webhook';

const callbackSchema = z.object({
  reference: z.string().trim().min(1).max(200),
});

/**
 * Réception des notifications des fournisseurs de paiement. Une notification n'est JAMAIS crue : elle ne fait que
 * déclencher une vérification du statut réel auprès du fournisseur (RG-04), et la réponse ne révèle pas ce qui existe.
 */
@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Fournisseur SIMULÉ uniquement : sans signature, ce point d'entrée n'existe plus dès que SasPay est actif. */
  @Public()
  @Throttle({ global: { limit: 120, ttl: 60_000 } })
  @HttpCode(200)
  @Post('payment')
  @ApiOperation({
    summary:
      'Callback du fournisseur simulé : déclenche la vérification, ne crédite jamais directement',
  })
  async payment(
    @Body(new ZodPipe(callbackSchema)) body: { reference: string },
  ): Promise<{ received: true }> {
    if (this.config.get('PAYMENT_PROVIDER', { infer: true }) === 'saspay') {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Introuvable.',
      });
    }
    await this.payments.handleCallback(body.reference);
    return { received: true };
  }

  /**
   * Webhook SasPay (docs § Webhooks). Ordre : secret configuré → signature HMAC sur le corps BRUT + horodatage
   * (anti-rejeu 300 s) → structure → événement de transaction → enregistrement dédupliqué → vérification chez SasPay.
   * Répond 2xx rapidement ; une signature invalide donne 403 et n'a AUCUN effet.
   */
  @Public()
  @Throttle({ global: { limit: 120, ttl: 60_000 } })
  @HttpCode(200)
  @Post('saspay')
  @ApiOperation({
    summary:
      'Webhook SasPay signé : déclenche la vérification du paiement, ne crédite jamais directement',
  })
  async saspay(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-webhook-signature') signature: string | undefined,
    @Headers('x-webhook-timestamp') timestamp: string | undefined,
  ): Promise<{ received: true }> {
    const secret = this.config.get('SASPAY_WEBHOOK_SECRET', { infer: true });
    if (!secret) {
      // Mauvaise configuration côté Yamboka : on refuse plutôt que d'accepter sans pouvoir authentifier.
      this.logger.error(
        'Webhook SasPay reçu mais SASPAY_WEBHOOK_SECRET est absent',
      );
      throw new ServiceUnavailableException({
        code: 'WEBHOOK_NOT_CONFIGURED',
        message: 'Réception des notifications non configurée.',
      });
    }
    const check = verifySaspayWebhook({
      rawBody: req.rawBody,
      signature,
      timestamp,
      secret,
    });
    if (!check.ok) {
      this.logger.warn(`Webhook SasPay refusé (${check.reason})`);
      throw new ForbiddenException({
        code: 'WEBHOOK_SIGNATURE_INVALID',
        message: 'Signature invalide.',
      });
    }

    let json: unknown;
    try {
      json = JSON.parse((req.rawBody as Buffer).toString('utf8'));
    } catch {
      throw new BadRequestException({
        code: 'WEBHOOK_INVALID',
        message: 'Corps illisible.',
      });
    }
    const parsed = saspayWebhookSchema.safeParse(json);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'WEBHOOK_INVALID',
        message: 'Notification invalide.',
      });
    }
    const { event, data } = parsed.data;
    // webhook.test, settlement.*, wallet_transfer.* : authentiques mais sans lien avec un achat de crédits.
    if (!isTransactionEvent(event)) return { received: true };

    const outcome = await this.payments.handleProviderEvent({
      gateway: 'saspay',
      event,
      providerTxId: data.id,
      // Résumé expurgé : ni numéro de téléphone (msisdn) ni autre donnée personnelle.
      summary: {
        status: asText(data.status),
        amount: asText(data.amount),
        charged: asText(data.charged),
        currency: asText(data.currency),
        network: asText(data.network),
        reference: asText(data.reference),
      },
    });
    if (outcome === 'unknown') {
      this.logger.warn(
        'Webhook SasPay : transaction inconnue ou pas encore enregistrée',
      );
    }
    return { received: true };
  }
}

function asText(value: unknown): string | null {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).slice(0, 100)
    : null;
}
