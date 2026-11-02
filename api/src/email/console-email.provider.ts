import { Injectable, Logger } from '@nestjs/common';
import { EmailDiagnostic, EmailMessage, EmailProvider } from './email.provider';

export type SentEmail = EmailMessage & { sentAt: Date };

/**
 * Mode développement et test : aucun e-mail ne part. Le message est gardé en mémoire (outbox lue par les tests
 * et par /dev/outbox hors production). Le journal ne contient ni le corps ni les codes : uniquement le sujet.
 */
@Injectable()
export class ConsoleEmailProvider extends EmailProvider {
  readonly name = 'console' as const;
  private readonly logger = new Logger('Email');
  private readonly outbox: SentEmail[] = [];

  send(message: EmailMessage): Promise<void> {
    this.outbox.push({ ...message, sentAt: new Date() });
    if (this.outbox.length > 100) this.outbox.shift();
    this.logger.log(`E-mail simulé (non envoyé) — ${message.subject}`);
    return Promise.resolve();
  }

  diagnose(): Promise<EmailDiagnostic> {
    return Promise.resolve({
      provider: 'console',
      ok: false,
      detail:
        'Mode console : aucun e-mail réel n’est envoyé. Renseignez EMAIL_PROVIDER=smtp et les variables SMTP_* pour la production.',
    });
  }

  messagesFor(to: string): SentEmail[] {
    return this.outbox.filter((m) => m.to === to.toLowerCase());
  }
}
