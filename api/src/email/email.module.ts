import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { ConsoleEmailProvider } from './console-email.provider';
import { EmailProvider } from './email.provider';
import { EmailService } from './email.service';
import { SmtpEmailProvider } from './smtp-email.provider';

/** Domaine d'une adresse « Nom <a@b.c> » ou « a@b.c » (en minuscules), ou undefined. */
export function domainOf(address: string | undefined): string | undefined {
  const m = address?.match(/@([^\s>]+)>?\s*$/);
  return m?.[1].toLowerCase();
}

@Global()
@Module({
  providers: [
    ConsoleEmailProvider,
    {
      provide: EmailProvider,
      inject: [ConfigService, ConsoleEmailProvider],
      useFactory: (
        config: ConfigService<Env, true>,
        consoleProvider: ConsoleEmailProvider,
      ) => {
        if (config.get('EMAIL_PROVIDER', { infer: true }) !== 'smtp')
          return consoleProvider;
        const from = domainOf(config.get('EMAIL_FROM', { infer: true }));
        const login = domainOf(config.get('SMTP_USER', { infer: true }));
        // Beaucoup de fournisseurs refusent un expéditeur hors de leur domaine autorisé.
        if (from && login && from !== login) {
          new Logger('Email').warn(
            'Le domaine de EMAIL_FROM diffère de celui de SMTP_USER : vérifiez qu’il est autorisé par le fournisseur (SPF/DKIM).',
          );
        }
        return new SmtpEmailProvider(config);
      },
    },
    EmailService,
  ],
  exports: [EmailService, EmailProvider, ConsoleEmailProvider],
})
export class EmailModule {}
