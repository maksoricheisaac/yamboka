import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import type { Env } from '../config/env';
import {
  ConsoleEmailProvider,
  SentEmail,
} from '../email/console-email.provider';

/**
 * Outils de développement et de test : lecture de l'outbox e-mail (liens de vérification, etc.).
 * Absent en production : le module n'est pas chargé et le contrôleur refuse par sécurité.
 */
@ApiExcludeController()
@Controller('dev')
export class DevController {
  constructor(
    private readonly emails: ConsoleEmailProvider,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Get('outbox')
  outbox(@Query('to') to?: string): { messages: SentEmail[] } {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new NotFoundException();
    }
    return { messages: to ? this.emails.messagesFor(to) : [] };
  }
}
