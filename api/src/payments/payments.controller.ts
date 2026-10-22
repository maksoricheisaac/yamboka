import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type {
  CreatePaymentInput,
  PaymentReceipt,
  PaymentView,
  SimulatePaymentInput,
} from '@yamboka/shared';
import { createPaymentSchema, simulatePaymentSchema } from '@yamboka/shared';
import type { Response } from 'express';
import { CurrentUser, RequireVerifiedEmail } from '../common/decorators';
import type { AuthUser } from '../common/decorators';
import { jsonSchema } from '../common/json-schema';
import { ZodPipe } from '../common/zod.pipe';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @RequireVerifiedEmail()
  @Throttle({
    auth: { limit: 10, ttl: 60_000 },
    global: { limit: 30, ttl: 60_000 },
  })
  @Post()
  @ApiOperation({
    summary:
      'Démarre l’achat d’un pack (montant et crédits calculés côté serveur)',
  })
  @ApiBody({ schema: jsonSchema(createPaymentSchema) })
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createPaymentSchema)) body: CreatePaymentInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ payment: PaymentView }> {
    res.status(201);
    return { payment: await this.payments.create(user.id, body) };
  }

  @Get()
  @ApiOperation({ summary: 'Historique de mes achats (UF-25)' })
  async list(
    @CurrentUser() user: AuthUser,
  ): Promise<{ payments: PaymentView[] }> {
    return { payments: await this.payments.list(user.id) };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'État d’un de mes paiements (interrogé pendant l’attente)',
  })
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ payment: PaymentView }> {
    return { payment: await this.payments.get(user.id, id) };
  }

  @Get(':id/receipt')
  @ApiOperation({ summary: 'Reçu d’un achat réussi (UF-26)' })
  async receipt(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ receipt: PaymentReceipt }> {
    return { receipt: await this.payments.receipt(user.id, id) };
  }

  @HttpCode(200)
  @Post(':id/simulate')
  @ApiOperation({
    summary:
      'Mode simulation : agit comme le client sur son téléphone (404 avec un vrai fournisseur)',
  })
  @ApiBody({ schema: jsonSchema(simulatePaymentSchema) })
  async simulate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(simulatePaymentSchema)) body: SimulatePaymentInput,
  ): Promise<{ payment: PaymentView }> {
    return { payment: await this.payments.simulate(user.id, id, body) };
  }
}
