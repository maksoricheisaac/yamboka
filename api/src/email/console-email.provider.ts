import { Injectable, Logger } from '@nestjs/common';
import { EmailMessage, EmailProvider } from './email.provider';

export type SentEmail = EmailMessage & { sentAt: Date };

/** Mode développement : affiche l'e-mail dans la console et le garde en mémoire (outbox de test). */
@Injectable()
export class ConsoleEmailProvider extends EmailProvider {
  private readonly logger = new Logger('Email');
  private readonly outbox: SentEmail[] = [];

  send(message: EmailMessage): Promise<void> {
    this.outbox.push({ ...message, sentAt: new Date() });
    if (this.outbox.length > 100) this.outbox.shift();
    this.logger.log(
      `E-mail à ${message.to} — ${message.subject}\n${message.text}`,
    );
    return Promise.resolve();
  }

  messagesFor(to: string): SentEmail[] {
    return this.outbox.filter((m) => m.to === to.toLowerCase());
  }
}
